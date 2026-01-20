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
	"github.com/gopcua/opcua/ua"
)

// Default certificate paths (overridable via OPCUA_CERT_PATH and OPCUA_KEY_PATH env vars)
const (
	DefaultCertPath = "certs/client.pem"
	DefaultKeyPath  = "certs/client.key"
)

// Client wraps gopcua client with connection management
type Client struct {
	client       *opcua.Client
	config       *ConfigManager
	connected    atomic.Bool
	mu           sync.RWMutex
	subscription *opcua.Subscription
	posCallback  PositionCallback
	stopCh       chan struct{}
	stopOnce     sync.Once // protects stopCh close
}

// NewClient creates a new OPC UA client
func NewClient(config *ConfigManager) *Client {
	return &Client{
		config: config,
		// connected is atomic.Bool, zero value is false
	}
}

// Connect establishes connection to OPC UA server
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected.Load() && c.client != nil {
		return nil // Already connected
	}

	cfg := c.config.Get()

	// Discover endpoints to find security requirements
	endpoints, err := opcua.GetEndpoints(ctx, cfg.Endpoint)
	if err != nil {
		return fmt.Errorf("failed to get endpoints: %w", err)
	}

	// Select best endpoint (prefer Sign over SignAndEncrypt for performance)
	ep := opcua.SelectEndpoint(endpoints, cfg.SecurityPolicy, ua.MessageSecurityModeFromString(cfg.SecurityMode))
	if ep == nil && len(endpoints) > 0 {
		// Auto-select first available secure endpoint
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
	c.stopCh = make(chan struct{})
	c.stopOnce = sync.Once{} // Reset for new connection lifecycle
	return nil
}

// buildConnectionOptions creates OPC UA connection options based on config and endpoint
func (c *Client) buildConnectionOptions(cfg Config, ep *ua.EndpointDescription) []opcua.Option {
	opts := []opcua.Option{}

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
			// Use persistent certificates saved to disk
			// Configurable via environment variables for production deployment
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
				// Log error but continue - connection may fail later
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

	err := c.client.Close(ctx)
	c.client = nil
	c.connected.Store(false)
	return err
}

// IsConnected returns connection status
func (c *Client) IsConnected() bool {
	return c.connected.Load()
}

// WriteData writes data to the configured data node
func (c *Client) WriteData(ctx context.Context, data interface{}, cfg Config) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(cfg.DataNode)
	if err != nil {
		return fmt.Errorf("invalid node ID: %w", err)
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
				Value:       &ua.DataValue{Value: variant},
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
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeStr)
	if err != nil {
		return fmt.Errorf("invalid %s node ID: %w", name, err)
	}

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       &ua.DataValue{Value: ua.MustVariant(value)},
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
func (c *Client) buildVariant(data interface{}, dataType string) (*ua.Variant, error) {
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

func (c *Client) buildStringArrayVariant(data interface{}) (*ua.Variant, error) {
	switch v := data.(type) {
	case []string:
		return ua.NewVariant(v)
	case string:
		lines := strings.Split(v, "\n")
		return ua.NewVariant(lines)
	case []interface{}:
		arr := make([]string, len(v))
		for i, item := range v {
			arr[i] = fmt.Sprintf("%v", item)
		}
		return ua.NewVariant(arr)
	default:
		return nil, fmt.Errorf("cannot convert %T to string array", data)
	}
}

func (c *Client) buildInt32Variant(data interface{}) (*ua.Variant, error) {
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

func (c *Client) buildFloatVariant(data interface{}) (*ua.Variant, error) {
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
func (c *Client) SendWithTrigger(ctx context.Context, data interface{}, cfg Config) error {
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
func (c *Client) ReadNode(ctx context.Context, nodeIDStr string) (interface{}, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return nil, fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid node ID: %w", err)
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

// WriteString writes a single string to a node
func (c *Client) WriteString(ctx context.Context, nodeIDStr string, value string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return fmt.Errorf("invalid node ID: %w", err)
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
				Value:       &ua.DataValue{Value: variant},
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

// WriteStringArray writes a string array to a node
// For Siemens S7-1500: reads current value first to match encoding
func (c *Client) WriteStringArray(ctx context.Context, nodeIDStr string, data []string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return fmt.Errorf("invalid node ID: %w", err)
	}

	// First read to get exact Siemens variant encoding
	readReq := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDValue},
		},
	}

	readResp, err := c.client.Read(ctx, readReq)
	if err != nil {
		return fmt.Errorf("read for encoding failed: %w", err)
	}

	if readResp.Results[0].Status != ua.StatusOK {
		return fmt.Errorf("read status: %v", readResp.Results[0].Status)
	}

	// Get the original DataValue and modify only the value
	originalDV := readResp.Results[0]
	variant, err := ua.NewVariant(data)
	if err != nil {
		return fmt.Errorf("failed to create variant: %w", err)
	}
	originalDV.Value = variant

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       originalDV,
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
// For Siemens S7-1500: reads current value first to match encoding
func (c *Client) WriteBoolNode(ctx context.Context, nodeIDStr string, value bool) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected.Load() || c.client == nil {
		return fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return fmt.Errorf("invalid node ID: %w", err)
	}

	// First read to get exact Siemens variant encoding
	readReq := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDValue},
		},
	}

	readResp, err := c.client.Read(ctx, readReq)
	if err != nil {
		return fmt.Errorf("read for encoding failed: %w", err)
	}

	if readResp.Results[0].Status != ua.StatusOK {
		return fmt.Errorf("read status: %v", readResp.Results[0].Status)
	}

	// Get the original DataValue and modify only the value
	originalDV := readResp.Results[0]
	originalDV.Value = ua.MustVariant(value)

	req := &ua.WriteRequest{
		NodesToWrite: []*ua.WriteValue{
			{
				NodeID:      nodeID,
				AttributeID: ua.AttributeIDValue,
				Value:       originalDV,
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
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return false, fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return false, fmt.Errorf("invalid node ID: %w", err)
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
	DisplayName string
	NodeClass   string
}

// ReadNodeDataType reads the DataType attribute of a node
func (c *Client) ReadNodeDataType(ctx context.Context, nodeIDStr string) (*ua.NodeID, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return nil, fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid node ID: %w", err)
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

// ReadNodeAccessLevel reads the AccessLevel attribute of a node
func (c *Client) ReadNodeAccessLevel(ctx context.Context, nodeIDStr string) (uint8, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return 0, fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return 0, fmt.Errorf("invalid node ID: %w", err)
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDAccessLevel},
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

// ReadNodeUserAccessLevel reads the UserAccessLevel attribute (actual user permissions)
func (c *Client) ReadNodeUserAccessLevel(ctx context.Context, nodeIDStr string) (uint8, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.connected.Load() || c.client == nil {
		return 0, fmt.Errorf("not connected to OPC UA server")
	}

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return 0, fmt.Errorf("invalid node ID: %w", err)
	}

	req := &ua.ReadRequest{
		NodesToRead: []*ua.ReadValueID{
			{NodeID: nodeID, AttributeID: ua.AttributeIDUserAccessLevel},
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

	nodeID, err := ua.ParseNodeID(nodeIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid node ID: %w", err)
	}

	req := &ua.BrowseRequest{
		NodesToBrowse: []*ua.BrowseDescription{
			{
				NodeID:          nodeID,
				BrowseDirection: ua.BrowseDirectionForward,
				ReferenceTypeID: ua.NewNumericNodeID(0, 33), // HierarchicalReferences
				IncludeSubtypes: true,
				NodeClassMask:   0xFF,                       // All node classes
				ResultMask:      uint32(ua.BrowseResultMaskAll),
			},
		},
	}

	resp, err := c.client.Browse(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("browse failed: %w", err)
	}

	if len(resp.Results) == 0 {
		return nil, fmt.Errorf("no browse results")
	}

	if resp.Results[0].StatusCode != ua.StatusOK {
		return nil, fmt.Errorf("browse status: %v", resp.Results[0].StatusCode)
	}

	var results []BrowseResult
	for _, ref := range resp.Results[0].References {
		results = append(results, BrowseResult{
			NodeID:      ref.NodeID.NodeID.String(),
			DisplayName: ref.DisplayName.Text,
			NodeClass:   fmt.Sprintf("%d", ref.NodeClass),
		})
	}

	return results, nil
}
