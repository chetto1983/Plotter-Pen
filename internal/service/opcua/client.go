package opcua

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/id"
	"github.com/gopcua/opcua/ua"
)

// Default certificate paths (overridable via OPCUA_CERT_PATH and OPCUA_KEY_PATH env vars)
const (
	DefaultCertPath = "certs/client.pem"
	DefaultKeyPath  = "certs/client.key"
)

// Client wraps gopcua client with connection management and auto-reconnect
type Client struct {
	client         *opcua.Client
	config         *ConfigManager
	connected      atomic.Bool
	mu             sync.RWMutex
	posCallback    PositionCallback
	stopCh         chan struct{}
	stopOnce       sync.Once // protects stopCh close
	onStatusChange func(connected bool)
	nodes          nodeCache // node IDs resolved from the configured names, per connection
}

// references browses the children of a node. It gives resolveNodeAddress its view of the
// server and takes the read lock itself, so it must not be called while holding c.mu.
func (c *Client) references(ctx context.Context, parent *ua.NodeID) ([]*ua.ReferenceDescription, error) {
	c.mu.RLock()
	client, connected := c.client, c.connected.Load()
	c.mu.RUnlock()

	if !connected || client == nil {
		return nil, fmt.Errorf("not connected to OPC UA server")
	}
	return client.Node(parent).References(ctx, id.HierarchicalReferences, ua.BrowseDirectionForward, ua.NodeClassAll, true)
}

// nodeID turns a configured address, a node ID or a path of browse names, into a node ID of
// this server. Call it before taking c.mu: resolving a path browses, which takes the lock.
func (c *Client) nodeID(ctx context.Context, address string) (*ua.NodeID, error) {
	return c.nodes.lookup(ctx, c, address)
}

// NewClient creates a new OPC UA client
func NewClient(config *ConfigManager) *Client {
	return &Client{
		config: config,
	}
}

// Connect establishes connection to OPC UA server with auto-reconnect
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected.Load() && c.client != nil {
		// Check if library still considers itself connected
		if c.client.State() == opcua.Connected {
			return nil
		}
		// Library says disconnected, clean up
		c.connected.Store(false)
	}

	cfg := c.config.Get()

	// Discover endpoints with a dedicated short timeout
	discoverCtx, discoverCancel := context.WithTimeout(ctx, 10*time.Second)
	defer discoverCancel()

	endpoints, err := opcua.GetEndpoints(discoverCtx, cfg.Endpoint)
	if err != nil {
		return fmt.Errorf("failed to get endpoints: %w", err)
	}

	// Select best endpoint (prefer Sign over SignAndEncrypt for performance)
	// No match is not fatal: fall back to the highest-security endpoint (SelectEndpoint sorts in place)
	ep, err := opcua.SelectEndpoint(endpoints, cfg.SecurityPolicy, ua.MessageSecurityModeFromString(cfg.SecurityMode))
	if err != nil && len(endpoints) > 0 {
		ep = endpoints[0]
	}

	opts := c.buildConnectionOptions(cfg, ep)

	client, err := opcua.NewClient(cfg.Endpoint, opts...)
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}

	if err := client.Connect(ctx); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.client = client
	c.connected.Store(true)
	c.nodes.clear() // node IDs belong to the server we just left
	c.stopCh = make(chan struct{})
	c.stopOnce = sync.Once{}

	// Monitor connection state in background
	go c.monitorState()

	return nil
}

// monitorState watches the gopcua client state and updates our connected flag
func (c *Client) monitorState() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		c.mu.RLock()
		client := c.client
		stopCh := c.stopCh
		c.mu.RUnlock()

		if client == nil {
			return
		}

		select {
		case <-stopCh:
			return
		case <-ticker.C:
			state := client.State()
			wasConnected := c.connected.Load()

			switch state {
			case opcua.Connected:
				if !wasConnected {
					c.connected.Store(true)
					fmt.Println("OPC UA: reconnected")
					c.notifyStatus(true)
				}
			case opcua.Disconnected, opcua.Reconnecting:
				if wasConnected {
					c.connected.Store(false)
					fmt.Printf("OPC UA: %s\n", state)
					c.notifyStatus(false)
				}
			case opcua.Closed:
				c.connected.Store(false)
				return
			}
		}
	}
}

// buildConnectionOptions creates OPC UA connection options based on config and endpoint
func (c *Client) buildConnectionOptions(cfg Config, ep *ua.EndpointDescription) []opcua.Option {
	opts := []opcua.Option{
		// Connection resilience
		opcua.AutoReconnect(true),
		opcua.ReconnectInterval(5 * time.Second),
		opcua.DialTimeout(10 * time.Second),
		opcua.RequestTimeout(5 * time.Second),
	}

	// If we have an endpoint, use its security settings
	if ep != nil {
		opts = append(opts, opcua.SecurityFromEndpoint(ep, ua.UserTokenTypeAnonymous))
	} else {
		// Fallback to config-based security
		switch cfg.SecurityMode {
		case "Sign":
			opts = append(opts, opcua.SecurityMode(ua.MessageSecurityModeSign))
		case "SignAndEncrypt":
			opts = append(opts, opcua.SecurityMode(ua.MessageSecurityModeSignAndEncrypt))
		default:
			opts = append(opts, opcua.SecurityMode(ua.MessageSecurityModeNone))
		}

		switch cfg.SecurityPolicy {
		case "Basic256":
			opts = append(opts, opcua.SecurityPolicy(ua.SecurityPolicyURIBasic256))
		case "Basic256Sha256":
			opts = append(opts, opcua.SecurityPolicy(ua.SecurityPolicyURIBasic256Sha256))
		default:
			opts = append(opts, opcua.SecurityPolicy("None"))
		}
	}

	// Certificate-based authentication (client cert + key)
	if cfg.CertFile != "" && cfg.KeyFile != "" {
		opts = append(opts, opcua.CertificateFile(cfg.CertFile))
		opts = append(opts, opcua.PrivateKeyFile(cfg.KeyFile))
	}

	// Generate self-signed certificates for secure connections if no cert provided
	if ep != nil && ep.SecurityMode != ua.MessageSecurityModeNone {
		if cfg.CertFile == "" || cfg.KeyFile == "" {
			certPath := os.Getenv("OPCUA_CERT_PATH")
			if certPath == "" {
				certPath = DefaultCertPath
			}
			keyPath := os.Getenv("OPCUA_KEY_PATH")
			if keyPath == "" {
				keyPath = DefaultKeyPath
			}
			cert, key, err := LoadOrGenerateCert(certPath, keyPath)
			if err != nil {
				fmt.Printf("OPC UA: failed to load/generate certificate: %v\n", err)
			} else {
				fmt.Printf("OPC UA: using certificate from %s (import DER into PLC trusted certs)\n", certPath)
				opts = append(opts, opcua.Certificate(cert))
				opts = append(opts, opcua.PrivateKey(key))
			}
		}
	}

	// Username/password authentication
	if cfg.Username != "" {
		opts = append(opts, opcua.AuthUsername(cfg.Username, cfg.Password))
	} else {
		opts = append(opts, opcua.AuthAnonymous())
	}

	return opts
}

// Disconnect closes the connection
func (c *Client) Disconnect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.client == nil {
		return nil
	}

	// Stop state monitor
	if c.stopCh != nil {
		c.stopOnce.Do(func() { close(c.stopCh) })
	}

	err := c.client.Close(ctx)
	c.client = nil
	c.connected.Store(false)
	c.nodes.clear()
	return err
}

// IsConnected returns connection status
func (c *Client) IsConnected() bool {
	if !c.connected.Load() {
		return false
	}
	// Cross-check with library state
	c.mu.RLock()
	client := c.client
	c.mu.RUnlock()
	if client == nil {
		return false
	}
	state := client.State()
	return state == opcua.Connected
}

// SetStatusCallback sets a callback invoked on connection state changes
func (c *Client) SetStatusCallback(cb func(connected bool)) {
	c.mu.Lock()
	c.onStatusChange = cb
	c.mu.Unlock()
}

// notifyStatus invokes the status change callback
func (c *Client) notifyStatus(connected bool) {
	c.mu.RLock()
	cb := c.onStatusChange
	c.mu.RUnlock()
	if cb != nil {
		cb(connected)
	}
}

// valueOnly wraps v in a DataValue that carries only the value.
// gopcua encodes exactly the fields flagged in EncodingMask, and S7-1500 rejects
// writes that include status or timestamps with Bad_WriteNotSupported.
func valueOnly(v *ua.Variant) *ua.DataValue {
	return &ua.DataValue{EncodingMask: ua.DataValueValue, Value: v}
}

// WriteData writes data to the configured data node
func (c *Client) WriteData(ctx context.Context, data any, cfg Config) error {
	nodeID, err := c.nodeID(ctx, cfg.DataNode)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	variant, err := c.buildVariant(data, cfg.DataType)
	if err != nil {
		return fmt.Errorf("failed to build variant: %w", err)
	}

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       valueOnly(variant),
			},
		},
	}

	resp, err := c.client.Write(ctx, req)
	if err != nil {
		return fmt.Errorf("write failed: %w", err)
	}

	if resp.Results[0] != ua.StatusOK {
		return fmt.Errorf("write status: %v", resp.Results[0])
	}

	return nil
}

// WriteTrigger writes to the trigger node
func (c *Client) WriteTrigger(ctx context.Context, value bool, cfg Config) error {
	return c.writeBoolNode(ctx, cfg.TriggerNode, value, "trigger")
}

// WriteReset writes to the reset node
func (c *Client) WriteReset(ctx context.Context, value bool, cfg Config) error {
	return c.writeBoolNode(ctx, cfg.ResetNode, value, "reset")
}

// writeBoolNode writes a boolean to a node
func (c *Client) writeBoolNode(ctx context.Context, nodeStr string, value bool, name string) error {
	nodeID, err := c.nodeID(ctx, nodeStr)
	if err != nil {
		return fmt.Errorf("%s node: %w", name, err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       valueOnly(ua.MustVariant(value)),
			},
		},
	}

	resp, err := c.client.Write(ctx, req)
	if err != nil {
		return fmt.Errorf("%s write failed: %w", name, err)
	}

	if resp.Results[0] != ua.StatusOK {
		return fmt.Errorf("%s write status: %v", name, resp.Results[0])
	}

	return nil
}

// buildVariant creates ua.Variant based on data type
func (c *Client) buildVariant(data any, dataType string) (*ua.Variant, error) {
	switch dataType {
	case "string":
		s, ok := data.(string)
		if !ok {
			s = fmt.Sprintf("%v", data)
		}
		return ua.NewVariant(s)

	case "string_array":
		return c.buildStringArrayVariant(data)

	case "int32":
		return c.buildInt32Variant(data)

	case "float":
		return c.buildFloatVariant(data)

	case "bool":
		if v, ok := data.(bool); ok {
			return ua.NewVariant(v)
		}
		return nil, fmt.Errorf("cannot convert %T to bool", data)

	default:
		return ua.NewVariant(fmt.Sprintf("%v", data))
	}
}

func (c *Client) buildStringArrayVariant(data any) (*ua.Variant, error) {
	switch v := data.(type) {
	case []string:
		return ua.NewVariant(v)
	case string:
		lines := strings.Split(v, "\n")
		return ua.NewVariant(lines)
	case []any:
		arr := make([]string, len(v))
		for i, item := range v {
			arr[i] = fmt.Sprintf("%v", item)
		}
		return ua.NewVariant(arr)
	default:
		return nil, fmt.Errorf("cannot convert %T to string array", data)
	}
}

func (c *Client) buildInt32Variant(data any) (*ua.Variant, error) {
	switch v := data.(type) {
	case int:
		return ua.NewVariant(int32(v))
	case int32:
		return ua.NewVariant(v)
	case int64:
		return ua.NewVariant(int32(v))
	case float64:
		return ua.NewVariant(int32(v))
	default:
		return nil, fmt.Errorf("cannot convert %T to int32", data)
	}
}

func (c *Client) buildFloatVariant(data any) (*ua.Variant, error) {
	switch v := data.(type) {
	case float64:
		return ua.NewVariant(float32(v))
	case float32:
		return ua.NewVariant(v)
	case int:
		return ua.NewVariant(float32(v))
	default:
		return nil, fmt.Errorf("cannot convert %T to float", data)
	}
}

// SendWithTrigger sends data and triggers PLC execution
func (c *Client) SendWithTrigger(ctx context.Context, data any, cfg Config) error {
	if err := c.WriteData(ctx, data, cfg); err != nil {
		return fmt.Errorf("failed to write data: %w", err)
	}

	time.Sleep(50 * time.Millisecond)

	if err := c.WriteTrigger(ctx, true, cfg); err != nil {
		return fmt.Errorf("failed to set trigger: %w", err)
	}

	return nil
}

// ReadNode reads a value from a node
func (c *Client) ReadNode(ctx context.Context, nodeIDStr string) (any, error) {
	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return nil, fmt.Errorf("not connected to OPC UA server")
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDValue},
		},
	}

	resp, err := c.client.Read(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}

	if resp.Results[0].Status != ua.StatusOK {
		return nil, fmt.Errorf("read status: %v", resp.Results[0].Status)
	}

	return resp.Results[0].Value.Value(), nil
}

// WriteString writes a single string to a node.
func (c *Client) WriteString(ctx context.Context, nodeIDStr string, value string) error {
	return c.writeStringValue(ctx, nodeIDStr, value)
}

// WriteStringArray writes a string array to a node.
func (c *Client) WriteStringArray(ctx context.Context, nodeIDStr string, data []string) error {
	return c.writeStringValue(ctx, nodeIDStr, data)
}

// writeStringValue preserves the scalar/array variant type and value-only encoding.
func (c *Client) writeStringValue(ctx context.Context, nodeIDStr string, value any) error {
	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	variant, err := ua.NewVariant(value)
	if err != nil {
		return fmt.Errorf("failed to create variant: %w", err)
	}

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       valueOnly(variant),
			},
		},
	}

	resp, err := c.client.Write(ctx, req)
	if err != nil {
		return fmt.Errorf("write failed: %w", err)
	}

	if resp.Results[0] != ua.StatusOK {
		return fmt.Errorf("write status: %v", resp.Results[0])
	}

	return nil
}

// WriteBoolNode writes a boolean value to a node
func (c *Client) WriteBoolNode(ctx context.Context, nodeIDStr string, value bool) error {
	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       valueOnly(ua.MustVariant(value)),
			},
		},
	}

	resp, err := c.client.Write(ctx, req)
	if err != nil {
		return fmt.Errorf("write failed: %w", err)
	}

	if resp.Results[0] != ua.StatusOK {
		return fmt.Errorf("write status: %v", resp.Results[0])
	}

	return nil
}

// ReadBoolNode reads a boolean value from a node
func (c *Client) ReadBoolNode(ctx context.Context, nodeIDStr string) (bool, error) {
	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return false, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return false, fmt.Errorf("not connected to OPC UA server")
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDValue},
		},
	}

	resp, err := c.client.Read(ctx, req)
	if err != nil {
		return false, fmt.Errorf("read failed: %w", err)
	}

	if resp.Results[0].Status != ua.StatusOK {
		return false, fmt.Errorf("read status: %v", resp.Results[0].Status)
	}

	val := resp.Results[0].Value.Value()
	if b, ok := val.(bool); ok {
		return b, nil
	}
	return false, fmt.Errorf("expected bool, got %T", val)
}

// BrowseResult represents a browse result node
type BrowseResult struct {
	NodeID      string
	BrowseName  string // the name a node address is written with
	DisplayName string
	NodeClass   string
}

// ReadNodeDataType reads the DataType attribute of a node
func (c *Client) ReadNodeDataType(ctx context.Context, nodeIDStr string) (*ua.NodeID, error) {
	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return nil, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return nil, fmt.Errorf("not connected to OPC UA server")
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDDataType},
		},
	}

	resp, err := c.client.Read(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}

	if resp.Results[0].Status != ua.StatusOK {
		return nil, fmt.Errorf("read status: %v", resp.Results[0].Status)
	}

	dataType, ok := resp.Results[0].Value.Value().(*ua.NodeID)
	if !ok {
		return nil, fmt.Errorf("expected NodeID, got %T", resp.Results[0].Value.Value())
	}

	return dataType, nil
}

// ReadNodeAccessLevel reads the AccessLevel attribute of a node.
func (c *Client) ReadNodeAccessLevel(ctx context.Context, nodeIDStr string) (uint8, error) {
	return c.readAccessLevel(ctx, nodeIDStr, ua.AttributeIDAccessLevel)
}

// ReadNodeUserAccessLevel reads the UserAccessLevel attribute of a node.
func (c *Client) ReadNodeUserAccessLevel(ctx context.Context, nodeIDStr string) (uint8, error) {
	return c.readAccessLevel(ctx, nodeIDStr, ua.AttributeIDUserAccessLevel)
}

// Retain checked uint8 decoding: gopcua Node.AccessLevel uses an unchecked assertion.
func (c *Client) readAccessLevel(ctx context.Context, nodeIDStr string, attribute ua.AttributeID) (uint8, error) {
	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return 0, err
	}

	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return 0, fmt.Errorf("not connected to OPC UA server")
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: attribute},
		},
	}

	resp, err := c.client.Read(ctx, req)
	if err != nil {
		return 0, fmt.Errorf("read failed: %w", err)
	}

	if resp.Results[0].Status != ua.StatusOK {
		return 0, fmt.Errorf("read status: %v", resp.Results[0].Status)
	}

	level, ok := resp.Results[0].Value.Value().(uint8)
	if !ok {
		return 0, fmt.Errorf("expected uint8, got %T", resp.Results[0].Value.Value())
	}

	return level, nil
}

// BrowseNode browses child nodes of a given node
func (c *Client) BrowseNode(ctx context.Context, nodeIDStr string) ([]BrowseResult, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return nil, fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := c.nodeID(ctx, nodeIDStr)
	if err != nil {
		return nil, err
	}

	refs, err := c.references(ctx, nodeID)
	if err != nil {
		return nil, fmt.Errorf("browse failed: %w", err)
	}

	var results []BrowseResult
	for _, ref := range refs {
		if ref == nil || ref.NodeID == nil || ref.NodeID.NodeID == nil {
			continue
		}
		result := BrowseResult{
			NodeID:    ref.NodeID.NodeID.String(),
			NodeClass: fmt.Sprintf("%d", ref.NodeClass),
		}
		if ref.BrowseName != nil {
			result.BrowseName = ref.BrowseName.Name
		}
		if ref.DisplayName != nil {
			result.DisplayName = ref.DisplayName.Text
		}
		results = append(results, result)
	}

	return results, nil
}
