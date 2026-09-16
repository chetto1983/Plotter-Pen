package opcua

import (
	"context"
	"strings"
	"testing"

	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

// fakeServer answers browse requests from a fixed tree and records what was browsed.
type fakeServer struct {
	tree    map[string][]*ua.ReferenceDescription
	browsed []string
}

func (f *fakeServer) references(_ context.Context, parent *ua.NodeID) ([]*ua.ReferenceDescription, error) {
	f.browsed = append(f.browsed, parent.String())
	return f.tree[parent.String()], nil
}

// childRef builds a browse result for a variable: the namespace of the browse name is
// deliberately free to differ from the namespace of the node, as it does on the PLC.
func childRef(nameNS uint16, name string, nodeID *ua.NodeID) *ua.ReferenceDescription {
	return &ua.ReferenceDescription{
		BrowseName: &ua.QualifiedName{NamespaceIndex: nameNS, Name: name},
		NodeID:     &ua.ExpandedNodeID{NodeID: nodeID},
		NodeClass:  ua.NodeClassVariable,
	}
}

// objectRef builds a browse result for an object, the kind of node the walk goes into.
func objectRef(nameNS uint16, name string, nodeID *ua.NodeID) *ua.ReferenceDescription {
	ref := childRef(nameNS, name, nodeID)
	ref.NodeClass = ua.NodeClassObject
	return ref
}

var objectsFolderID = ua.NewNumericNodeID(0, id.ObjectsFolder)

// plcTree mirrors the address space read from the PLC at 192.168.0.1 on 2026-09-16:
// Objects organizes ServerInterfaces, which organizes the Com interface.
func plcTree() *fakeServer {
	serverInterfaces := ua.NewStringNodeID(3, "ServerInterfaces")
	com := ua.NewNumericNodeID(4, 1)
	point := ua.NewNumericNodeID(4, 12)
	pos := ua.NewNumericNodeID(4, 78)
	return &fakeServer{tree: map[string][]*ua.ReferenceDescription{
		objectsFolderID.String(): {
			objectRef(0, "Server", ua.NewNumericNodeID(0, id.Server)),
			objectRef(3, "ServerInterfaces", serverInterfaces),
		},
		serverInterfaces.String(): {objectRef(4, "Com", com)},
		com.String(): {
			childRef(4, "Point", point),
			childRef(4, "TriggerWrite", ua.NewNumericNodeID(4, 43)),
			childRef(4, "ReadDone", ua.NewNumericNodeID(4, 54)),
			childRef(4, "EndOfFile", ua.NewNumericNodeID(4, 65)),
			objectRef(4, "Pos", pos),
		},
		// the twenty strings of the array: the walk must not offer them one by one
		point.String(): {
			childRef(4, "[0]", ua.NewNumericNodeID(4, 13)),
			childRef(4, "[1]", ua.NewNumericNodeID(4, 14)),
		},
		pos.String(): {
			childRef(4, "X", ua.NewNumericNodeID(4, 79)),
			childRef(4, "Y", ua.NewNumericNodeID(4, 80)),
			childRef(4, "Z", ua.NewNumericNodeID(4, 81)),
		},
	}}
}

// otherServerTree carries the same names on other numbers and in other namespaces, the way a
// second PLC or a rebuilt program would: the names have to be enough to find the variables.
func otherServerTree() *fakeServer {
	serverInterfaces := ua.NewStringNodeID(1, "ServerInterfaces")
	com := ua.NewNumericNodeID(7, 500)
	return &fakeServer{tree: map[string][]*ua.ReferenceDescription{
		objectsFolderID.String():  {objectRef(1, "ServerInterfaces", serverInterfaces)},
		serverInterfaces.String(): {objectRef(7, "Com", com)},
		com.String():              {childRef(7, "Point", ua.NewStringNodeID(7, "DB1.Point"))},
	}}
}

func TestResolveNodeAddress_NodeIDIsUsedAsItIs(t *testing.T) {
	server := plcTree()

	nodeID, err := resolveNodeAddress(context.Background(), server, "ns=4;i=93")
	if err != nil {
		t.Fatalf("resolveNodeAddress: %v", err)
	}
	if got := nodeID.String(); got != "ns=4;i=93" {
		t.Errorf("node ID = %s, want ns=4;i=93", got)
	}
	if len(server.browsed) != 0 {
		t.Errorf("browsed %v, want no browse for a node ID", server.browsed)
	}
}

func TestResolveNodeAddress_NameOfThePLCVariable(t *testing.T) {
	nodeID, err := resolveNodeAddress(context.Background(), plcTree(), "ServerInterfaces/Com/Point")
	if err != nil {
		t.Fatalf("resolveNodeAddress: %v", err)
	}
	if got := nodeID.String(); got != "ns=4;i=12" {
		t.Errorf("node ID = %s, want ns=4;i=12", got)
	}
}

func TestResolveNodeAddress_SameNameOnAnotherServer(t *testing.T) {
	// The point of the names: one configuration, two servers that number their nodes differently.
	nodeID, err := resolveNodeAddress(context.Background(), otherServerTree(), "ServerInterfaces/Com/Point")
	if err != nil {
		t.Fatalf("resolveNodeAddress: %v", err)
	}
	if got := nodeID.String(); got != "ns=7;s=DB1.Point" {
		t.Errorf("node ID = %s, want ns=7;s=DB1.Point", got)
	}
}

func TestResolveNodeAddress_NestedObject(t *testing.T) {
	nodeID, err := resolveNodeAddress(context.Background(), plcTree(), "ServerInterfaces/Com/Pos/Y")
	if err != nil {
		t.Fatalf("resolveNodeAddress: %v", err)
	}
	if got := nodeID.String(); got != "ns=4;i=80" {
		t.Errorf("node ID = %s, want ns=4;i=80", got)
	}
}

func TestResolveNodeAddress_SpacesAroundTheNames(t *testing.T) {
	nodeID, err := resolveNodeAddress(context.Background(), plcTree(), " ServerInterfaces / Com / Point ")
	if err != nil {
		t.Fatalf("resolveNodeAddress: %v", err)
	}
	if got := nodeID.String(); got != "ns=4;i=12" {
		t.Errorf("node ID = %s, want ns=4;i=12", got)
	}
}

func TestResolveNodeAddress_UnknownName(t *testing.T) {
	_, err := resolveNodeAddress(context.Background(), plcTree(), "ServerInterfaces/Com/PointArr")
	if err == nil {
		t.Fatal("expected an error for a name the server does not have")
	}
	for _, want := range []string{"ServerInterfaces/Com/PointArr", "Point", "Pos"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %q", err, want)
		}
	}
}

func TestResolveNodeAddress_EmptyAddress(t *testing.T) {
	if _, err := resolveNodeAddress(context.Background(), plcTree(), "  /  "); err == nil {
		t.Fatal("expected an error for an empty address")
	}
}

func TestNodeCache_BrowsesOncePerAddress(t *testing.T) {
	server := plcTree()
	var cache nodeCache

	for range 3 {
		if _, err := cache.lookup(context.Background(), server, "ServerInterfaces/Com/Point"); err != nil {
			t.Fatalf("lookup: %v", err)
		}
	}
	if len(server.browsed) != 3 {
		t.Errorf("browsed %v, want one browse per name of the path only the first time", server.browsed)
	}

	cache.clear()
	if _, err := cache.lookup(context.Background(), server, "ServerInterfaces/Com/Point"); err != nil {
		t.Fatalf("lookup after clear: %v", err)
	}
	if len(server.browsed) != 6 {
		t.Errorf("browsed %v, want the path browsed again after clear", server.browsed)
	}
}

func TestResolveNodeAddress_MalformedNodeID(t *testing.T) {
	_, err := resolveNodeAddress(context.Background(), plcTree(), "ns=quattro;i=93")
	if err == nil || !strings.Contains(err.Error(), "ns=quattro;i=93") {
		t.Fatalf("error = %v, want one naming the malformed node ID", err)
	}
}

func TestDefaultConfig_AddressesTheVariablesByName(t *testing.T) {
	cfg := defaultConfig()
	want := map[string]string{
		"PointArrayNode":   "ServerInterfaces/Com/Point",
		"TriggerWriteNode": "ServerInterfaces/Com/TriggerWrite",
		"ReadDoneNode":     "ServerInterfaces/Com/ReadDone",
		"EndOfFileNode":    "ServerInterfaces/Com/EndOfFile",
		"PositionXNode":    "ServerInterfaces/Com/Pos/X",
		"PositionYNode":    "ServerInterfaces/Com/Pos/Y",
		"PositionZNode":    "ServerInterfaces/Com/Pos/Z",
		"DataNode":         "ServerInterfaces/Com/Point",
		"TriggerNode":      "ServerInterfaces/Com/TriggerWrite",
		"ResetNode":        "ServerInterfaces/Com/TriggerWrite",
	}
	got := map[string]string{
		"PointArrayNode": cfg.PointArrayNode, "TriggerWriteNode": cfg.TriggerWriteNode,
		"ReadDoneNode": cfg.ReadDoneNode, "EndOfFileNode": cfg.EndOfFileNode,
		"PositionXNode": cfg.PositionXNode, "PositionYNode": cfg.PositionYNode,
		"PositionZNode": cfg.PositionZNode, "DataNode": cfg.DataNode,
		"TriggerNode": cfg.TriggerNode, "ResetNode": cfg.ResetNode,
	}
	for field, address := range want {
		if got[field] != address {
			t.Errorf("%s = %q, want %q", field, got[field], address)
		}
	}
}

func TestNamedNodes_ReplacesTheNodeIDsTheAppShippedWith(t *testing.T) {
	saved := Config{
		TriggerNode: "ns=4;i=12", ResetNode: "ns=4;i=12", DataNode: "ns=4;i=93",
		PositionXNode: "ns=4;i=80", PositionYNode: "ns=4;i=81", PositionZNode: "ns=4;i=82",
		PointArrayNode: "ns=4;i=93", TriggerWriteNode: "ns=4;i=12",
		ReadDoneNode: "ns=4;i=23", EndOfFileNode: "ns=4;i=34",
	}

	cfg := namedNodes(saved)

	if want := defaultConfig(); cfg.PointArrayNode != want.PointArrayNode ||
		cfg.TriggerWriteNode != want.TriggerWriteNode || cfg.ReadDoneNode != want.ReadDoneNode ||
		cfg.EndOfFileNode != want.EndOfFileNode || cfg.PositionXNode != want.PositionXNode ||
		cfg.PositionYNode != want.PositionYNode || cfg.PositionZNode != want.PositionZNode ||
		cfg.DataNode != want.DataNode || cfg.TriggerNode != want.TriggerNode || cfg.ResetNode != want.ResetNode {
		t.Errorf("configuration = %+v, want the names of defaultConfig()", cfg)
	}
}

func TestNamedNodes_LeavesEveryOtherNodeIDAlone(t *testing.T) {
	// The simulator numbers its nodes differently: a configuration pointing at it must survive.
	saved := Config{
		PointArrayNode: "ns=4;i=12", TriggerWriteNode: "ns=4;i=43",
		ReadDoneNode: "ns=4;i=54", EndOfFileNode: "ns=4;i=65", PositionXNode: "ns=4;i=79",
	}

	cfg := namedNodes(saved)

	if cfg != saved {
		t.Errorf("configuration = %+v, want it unchanged %+v", cfg, saved)
	}
}

func TestInterfaceVariables_ListsWhatTheInterfacesExpose(t *testing.T) {
	server := plcTree()

	variables, err := interfaceVariables(context.Background(), server)
	if err != nil {
		t.Fatalf("interfaceVariables: %v", err)
	}

	want := []NodeVariable{
		{Path: "ServerInterfaces/Com/EndOfFile", NodeID: "ns=4;i=65"},
		{Path: "ServerInterfaces/Com/Point", NodeID: "ns=4;i=12"},
		{Path: "ServerInterfaces/Com/Pos/X", NodeID: "ns=4;i=79"},
		{Path: "ServerInterfaces/Com/Pos/Y", NodeID: "ns=4;i=80"},
		{Path: "ServerInterfaces/Com/Pos/Z", NodeID: "ns=4;i=81"},
		{Path: "ServerInterfaces/Com/ReadDone", NodeID: "ns=4;i=54"},
		{Path: "ServerInterfaces/Com/TriggerWrite", NodeID: "ns=4;i=43"},
	}
	if len(variables) != len(want) {
		t.Fatalf("variables = %+v, want %d of them", variables, len(want))
	}
	for i, v := range variables {
		if v != want[i] {
			t.Errorf("variable %d = %+v, want %+v", i, v, want[i])
		}
	}
}

func TestInterfaceVariables_LeavesTheArrayElementsOut(t *testing.T) {
	variables, err := interfaceVariables(context.Background(), plcTree())
	if err != nil {
		t.Fatalf("interfaceVariables: %v", err)
	}
	for _, v := range variables {
		if strings.HasSuffix(v.Path, "[0]") || strings.HasSuffix(v.Path, "[1]") {
			t.Errorf("the twenty strings of Point are offered one by one: %+v", variables)
		}
	}
}

// A structure of the PLC, such as Pos, can come back as a variable that has the members
// inside it. The window must offer the members, which is what a node field points at.
func TestInterfaceVariables_GoesIntoAStructure(t *testing.T) {
	serverInterfaces := ua.NewStringNodeID(3, "ServerInterfaces")
	com := ua.NewNumericNodeID(4, 1)
	pos := ua.NewNumericNodeID(4, 78)
	server := &fakeServer{tree: map[string][]*ua.ReferenceDescription{
		objectsFolderID.String():  {objectRef(3, "ServerInterfaces", serverInterfaces)},
		serverInterfaces.String(): {objectRef(4, "Com", com)},
		com.String():              {childRef(4, "Pos", pos)}, // a variable, not an object
		pos.String(): {
			childRef(4, "X", ua.NewNumericNodeID(4, 79)),
			childRef(4, "Y", ua.NewNumericNodeID(4, 80)),
			childRef(4, "Z", ua.NewNumericNodeID(4, 81)),
		},
	}}

	variables, err := interfaceVariables(context.Background(), server)
	if err != nil {
		t.Fatalf("interfaceVariables: %v", err)
	}

	want := []string{
		"ServerInterfaces/Com/Pos",
		"ServerInterfaces/Com/Pos/X",
		"ServerInterfaces/Com/Pos/Y",
		"ServerInterfaces/Com/Pos/Z",
	}
	if len(variables) != len(want) {
		t.Fatalf("variables = %+v, want the structure and its three members", variables)
	}
	for i, v := range variables {
		if v.Path != want[i] {
			t.Errorf("variable %d = %q, want %q", i, v.Path, want[i])
		}
	}
}

func TestInterfaceVariables_WithoutServerInterfaces(t *testing.T) {
	bare := &fakeServer{tree: map[string][]*ua.ReferenceDescription{
		objectsFolderID.String(): {objectRef(0, "Server", ua.NewNumericNodeID(0, id.Server))},
	}}

	_, err := interfaceVariables(context.Background(), bare)
	if err == nil || !strings.Contains(err.Error(), "ServerInterfaces") {
		t.Fatalf("error = %v, want one naming ServerInterfaces", err)
	}
}
