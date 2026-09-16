package opcua

import (
	"context"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"sync"

	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

// nodeSeparator separates the browse names of a node address, as in "ServerInterfaces/Com/Point".
const nodeSeparator = "/"

// nodeIDPrefixes are the forms of a node ID string. The prefix decides, because
// ua.ParseNodeID takes anything else for a string node ID of namespace 0 and would
// swallow "ServerInterfaces/Com/Point" as one.
var nodeIDPrefixes = []string{"ns=", "nsu=", "i=", "s=", "g=", "b="}

// nodeBrowser lists the children of a node. The client implements it with the browse
// of gopcua; the tests answer from a fixed tree.
type nodeBrowser interface {
	references(ctx context.Context, parent *ua.NodeID) ([]*ua.ReferenceDescription, error)
}

// resolveNodeAddress turns a configured address into the node ID of this server.
//
// A node ID such as "ns=4;i=93" is used as it is. A path of browse names such as
// "ServerInterfaces/Com/Point" is followed from the Objects folder instead, because the
// same variable carries different numbers on the PLC and on the simulator, and even the
// index of its namespace changes from server to server. The names do not.
func resolveNodeAddress(ctx context.Context, browser nodeBrowser, address string) (*ua.NodeID, error) {
	if isNodeID(address) {
		nodeID, err := ua.ParseNodeID(strings.TrimSpace(address))
		if err != nil {
			return nil, fmt.Errorf("invalid node ID %q: %w", address, err)
		}
		return nodeID, nil
	}

	names := browseNames(address)
	if len(names) == 0 {
		return nil, fmt.Errorf("empty node address")
	}

	node, parent := ua.NewNumericNodeID(0, id.ObjectsFolder), "Objects"
	for _, name := range names {
		child, err := childByName(ctx, browser, node, parent, name)
		if err != nil {
			return nil, fmt.Errorf("node address %q: %w", address, err)
		}
		node, parent = child, name
	}
	return node, nil
}

// isNodeID reports whether the address is written as a node ID rather than as names.
func isNodeID(address string) bool {
	address = strings.TrimSpace(address)
	for _, prefix := range nodeIDPrefixes {
		if strings.HasPrefix(address, prefix) {
			return true
		}
	}
	return false
}

// browseNames splits an address into its browse names, without the empty ones.
func browseNames(address string) []string {
	var names []string
	for name := range strings.SplitSeq(address, nodeSeparator) {
		if name = strings.TrimSpace(name); name != "" {
			names = append(names, name)
		}
	}
	return names
}

// childByName browses parent and returns the child with this browse name. The namespace
// index of the browse name is ignored: it is exactly what is not stable between servers.
func childByName(ctx context.Context, browser nodeBrowser, parent *ua.NodeID, parentName, name string) (*ua.NodeID, error) {
	refs, err := browser.references(ctx, parent)
	if err != nil {
		return nil, fmt.Errorf("browsing %s failed: %w", parentName, err)
	}

	var children []string
	for _, ref := range refs {
		if ref == nil || ref.BrowseName == nil || ref.NodeID == nil || ref.NodeID.NodeID == nil {
			continue
		}
		if ref.BrowseName.Name == name {
			return ref.NodeID.NodeID, nil
		}
		children = append(children, ref.BrowseName.Name)
	}

	if len(children) == 0 {
		return nil, fmt.Errorf("%s has no %q and no other child", parentName, name)
	}
	return nil, fmt.Errorf("%s has no %q, only %s", parentName, name, strings.Join(children, ", "))
}

// nodeCache holds the node IDs resolved for the current connection: an address costs one
// browse per name the first time and nothing afterwards, until the connection is replaced.
type nodeCache struct {
	mu  sync.Mutex
	ids map[string]*ua.NodeID
}

// lookup resolves address once and remembers it.
func (n *nodeCache) lookup(ctx context.Context, browser nodeBrowser, address string) (*ua.NodeID, error) {
	n.mu.Lock()
	cached, ok := n.ids[address]
	n.mu.Unlock()
	if ok {
		return cached, nil
	}

	nodeID, err := resolveNodeAddress(ctx, browser, address)
	if err != nil {
		return nil, err
	}

	n.mu.Lock()
	defer n.mu.Unlock()
	if n.ids == nil {
		n.ids = make(map[string]*ua.NodeID)
	}
	n.ids[address] = nodeID
	return nodeID, nil
}

// clear forgets the resolved node IDs, which belong to one connection only.
func (n *nodeCache) clear() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.ids = nil
}

// commPath is where the PLC keeps the interface to this app. Read from the PLC at
// 192.168.0.1 on 2026-09-16: Objects/ServerInterfaces/Com. The names of docs/OPC Ua
// Interface.xml (Comm, PointArr, Trigger_read_done, End_Of_File) are an older export and
// are not on the machine any more.
const commPath = "ServerInterfaces/Com/"

// namedNodes replaces the node IDs the app shipped with by the names of the variables they
// were meant to reach, so a configuration saved before the names reads like the PLC program
// does. Those node IDs came from an old export and are no longer on the machine, so this also
// repairs them. A node ID somebody chose is left alone.
func namedNodes(cfg Config) Config {
	names := defaultConfig()
	for _, field := range []struct {
		address *string
		shipped string
		name    string
	}{
		{&cfg.TriggerNode, "ns=4;i=12", names.TriggerNode},
		{&cfg.ResetNode, "ns=4;i=12", names.ResetNode},
		{&cfg.DataNode, "ns=4;i=93", names.DataNode},
		{&cfg.PointArrayNode, "ns=4;i=93", names.PointArrayNode},
		{&cfg.TriggerWriteNode, "ns=4;i=12", names.TriggerWriteNode},
		{&cfg.ReadDoneNode, "ns=4;i=23", names.ReadDoneNode},
		{&cfg.EndOfFileNode, "ns=4;i=34", names.EndOfFileNode},
		{&cfg.PositionXNode, "ns=4;i=80", names.PositionXNode},
		{&cfg.PositionYNode, "ns=4;i=81", names.PositionYNode},
		{&cfg.PositionZNode, "ns=4;i=82", names.PositionZNode},
	} {
		if strings.TrimSpace(*field.address) == field.shipped {
			*field.address = field.name
		}
	}
	return cfg
}

// NodeVariable is one variable the PLC exposes under its server interfaces.
type NodeVariable struct {
	Path   string `json:"path"`
	NodeID string `json:"nodeId"`
}

const (
	// interfacesName is the folder a Siemens server keeps its interfaces in.
	interfacesName = "ServerInterfaces"
	// maxInterfaceDepth stops a walk that a cyclic address space would never end.
	maxInterfaceDepth = 6
)

// arrayElement matches the browse name of an element of an array, such as "[19]".
var arrayElement = regexp.MustCompile(`^\[\d+\]$`)

// interfaceVariables lists the variables the server interfaces expose, the ones a node
// address can point at. It goes into everything that has children, because a structure of
// the PLC such as Pos is a variable carrying its members, and leaves out the elements of an
// array: the twenty strings of the point array are not offered one by one.
func interfaceVariables(ctx context.Context, browser nodeBrowser) ([]NodeVariable, error) {
	objects := ua.NewNumericNodeID(0, id.ObjectsFolder)
	root, err := childByName(ctx, browser, objects, "Objects", interfacesName)
	if err != nil {
		return nil, err
	}

	var variables []NodeVariable
	var walk func(node *ua.NodeID, path string, depth int) error
	walk = func(node *ua.NodeID, path string, depth int) error {
		if depth > maxInterfaceDepth {
			return nil
		}
		refs, err := browser.references(ctx, node)
		if err != nil {
			return fmt.Errorf("browsing %s failed: %w", path, err)
		}
		for _, ref := range refs {
			if ref == nil || ref.BrowseName == nil || ref.NodeID == nil || ref.NodeID.NodeID == nil {
				continue
			}
			if arrayElement.MatchString(ref.BrowseName.Name) {
				continue
			}
			child := path + nodeSeparator + ref.BrowseName.Name
			if ref.NodeClass == ua.NodeClassVariable {
				variables = append(variables, NodeVariable{Path: child, NodeID: ref.NodeID.NodeID.String()})
			}
			if ref.NodeClass == ua.NodeClassVariable || ref.NodeClass == ua.NodeClassObject {
				if err := walk(ref.NodeID.NodeID, child, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}

	if err := walk(root, interfacesName, 1); err != nil {
		return nil, err
	}
	slices.SortFunc(variables, func(a, b NodeVariable) int { return strings.Compare(a.Path, b.Path) })
	return variables, nil
}
