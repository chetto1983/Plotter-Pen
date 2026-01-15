package opcua

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gopcua/opcua"
	"github.com/gopcua/opcua/ua"
)

// Client wraps gopcua client with connection management
type Client struct {
	client       *opcua.Client
	config       *ConfigManager
	connected    bool
	mu           sync.RWMutex
	subscription *opcua.Subscription
	posCallback  PositionCallback
	stopCh       chan struct{}
}

// NewClient creates a new OPC UA client
func NewClient(config *ConfigManager) *Client {
	return &Client{
		config:    config,
		connected: false,
	}
}

// Connect establishes connection to OPC UA server
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.connected && c.client != nil {
		return nil // Already connected
	}

	cfg := c.config.Get()
	opts := c.buildConnectionOptions(cfg)

	client, err := opcua.NewClient(cfg.Endpoint, opts...)
	if err != nil {
		return fmt.Errorf("failed to create client: %w", err)
	}

	if err := client.Connect(ctx); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.client = client
	c.connected = true
	c.stopCh = make(chan struct{})
	return nil
}

// buildConnectionOptions creates OPC UA connection options based on config
func (c *Client) buildConnectionOptions(cfg Config) []opcua.Option {
	opts := []opcua.Option{}

	// Security mode
	switch cfg.SecurityMode {
	case "Sign":
		opts = append(opts, opcua.SecurityMode(ua.MessageSecurityModeSign))
	case "SignAndEncrypt":
		opts = append(opts, opcua.SecurityMode(ua.MessageSecurityModeSignAndEncrypt))
	default:
		opts = append(opts, opcua.SecurityMode(ua.MessageSecurityModeNone))
	}

	// Security policy
	switch cfg.SecurityPolicy {
	case "Basic256":
		opts = append(opts, opcua.SecurityPolicy(ua.SecurityPolicyURIBasic256))
	case "Basic256Sha256":
		opts = append(opts, opcua.SecurityPolicy(ua.SecurityPolicyURIBasic256Sha256))
	default:
		opts = append(opts, opcua.SecurityPolicy("None"))
	}

	// Certificate-based authentication
	if cfg.CertFile != "" && cfg.KeyFile != "" {
		opts = append(opts, opcua.CertificateFile(cfg.CertFile))
		opts = append(opts, opcua.PrivateKeyFile(cfg.KeyFile))
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
	c.connected = false
	return err
}

// IsConnected returns connection status
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// WriteData writes data to the configured data node
func (c *Client) WriteData(ctx context.Context, data interface{}, cfg Config) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.client == nil {
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

	if !c.connected || c.client == nil {
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

	if !c.connected || c.client == nil {
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
