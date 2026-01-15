package opcua

import (
	"encoding/json"
	"os"
	"sync"
)

// Config represents OPC UA connection settings
type Config struct {
	Endpoint    string `json:"endpoint"`
	NamespaceID int    `json:"namespaceId"`
	TriggerNode string `json:"triggerNode"`
	ResetNode   string `json:"resetNode"`
	DataNode    string `json:"dataNode"`
	DataType    string `json:"dataType"` // string, string_array, int32

	// Position nodes for real-time machine tracking
	PositionXNode string `json:"positionXNode"`
	PositionYNode string `json:"positionYNode"`
	PositionZNode string `json:"positionZNode"`

	// Status nodes
	StatusNode   string `json:"statusNode"`
	AlarmNode    string `json:"alarmNode"`
	ProgressNode string `json:"progressNode"`

	// Subscription settings
	SubscriptionInterval int `json:"subscriptionInterval"` // milliseconds

	// Security settings
	SecurityMode   string `json:"securityMode"`   // None, Sign, SignAndEncrypt
	SecurityPolicy string `json:"securityPolicy"` // None, Basic256, Basic256Sha256
	CertFile       string `json:"certFile"`       // Client certificate PEM
	KeyFile        string `json:"keyFile"`        // Client private key PEM
	ServerCertFile string `json:"serverCertFile"` // Server certificate for validation
	Username       string `json:"username"`       // For UserIdentity
	Password       string `json:"password"`       // For UserIdentity
}

// ConfigManager handles OPC UA configuration with file persistence
type ConfigManager struct {
	config     Config
	configFile string
	mu         sync.RWMutex
}

// NewConfigManager creates a new config manager with defaults
func NewConfigManager(configFile string) *ConfigManager {
	cm := &ConfigManager{
		configFile: configFile,
		config: Config{
			Endpoint:    "opc.tcp://localhost:4840",
			NamespaceID: 2,
			TriggerNode: "ns=2;s=Trigger",
			ResetNode:   "ns=2;s=Reset",
			DataNode:    "ns=2;s=Data",
			DataType:    "string",
			// Position defaults
			PositionXNode: "ns=2;s=Position.X",
			PositionYNode: "ns=2;s=Position.Y",
			PositionZNode: "ns=2;s=Position.Z",
			// Status defaults
			StatusNode:   "ns=2;s=Status",
			AlarmNode:    "ns=2;s=Alarm",
			ProgressNode: "ns=2;s=Progress",
			// Subscription default: 100ms
			SubscriptionInterval: 100,
			// Security defaults (None = no encryption)
			SecurityMode:   "None",
			SecurityPolicy: "None",
		},
	}
	cm.loadFromFile()
	cm.loadFromEnv()
	return cm
}

// loadFromFile loads config from JSON file
func (cm *ConfigManager) loadFromFile() {
	data, err := os.ReadFile(cm.configFile)
	if err != nil {
		return // Use defaults
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err == nil {
		cm.config = cfg
	}
}

// loadFromEnv overrides config with environment variables
func (cm *ConfigManager) loadFromEnv() {
	if ep := os.Getenv("OPCUA_ENDPOINT"); ep != "" {
		cm.config.Endpoint = ep
	}
	if dn := os.Getenv("OPCUA_DATA_NODE"); dn != "" {
		cm.config.DataNode = dn
	}
	if tn := os.Getenv("OPCUA_TRIGGER_NODE"); tn != "" {
		cm.config.TriggerNode = tn
	}
	if rn := os.Getenv("OPCUA_RESET_NODE"); rn != "" {
		cm.config.ResetNode = rn
	}
	if dt := os.Getenv("OPCUA_DATA_TYPE"); dt != "" {
		cm.config.DataType = dt
	}
	// Position nodes
	if px := os.Getenv("OPCUA_POSITION_X"); px != "" {
		cm.config.PositionXNode = px
	}
	if py := os.Getenv("OPCUA_POSITION_Y"); py != "" {
		cm.config.PositionYNode = py
	}
	if pz := os.Getenv("OPCUA_POSITION_Z"); pz != "" {
		cm.config.PositionZNode = pz
	}
	// Status nodes
	if sn := os.Getenv("OPCUA_STATUS_NODE"); sn != "" {
		cm.config.StatusNode = sn
	}
}

// SaveToFile persists config to JSON file
func (cm *ConfigManager) SaveToFile() error {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	data, err := json.MarshalIndent(cm.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cm.configFile, data, 0644)
}

// Get returns current config (thread-safe)
func (cm *ConfigManager) Get() Config {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.config
}

// Update updates config fields (thread-safe)
func (cm *ConfigManager) Update(updates Config) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if updates.Endpoint != "" {
		cm.config.Endpoint = updates.Endpoint
	}
	if updates.NamespaceID > 0 {
		cm.config.NamespaceID = updates.NamespaceID
	}
	if updates.TriggerNode != "" {
		cm.config.TriggerNode = updates.TriggerNode
	}
	if updates.ResetNode != "" {
		cm.config.ResetNode = updates.ResetNode
	}
	if updates.DataNode != "" {
		cm.config.DataNode = updates.DataNode
	}
	if updates.DataType != "" {
		cm.config.DataType = updates.DataType
	}
	// Position nodes
	if updates.PositionXNode != "" {
		cm.config.PositionXNode = updates.PositionXNode
	}
	if updates.PositionYNode != "" {
		cm.config.PositionYNode = updates.PositionYNode
	}
	if updates.PositionZNode != "" {
		cm.config.PositionZNode = updates.PositionZNode
	}
	// Status nodes
	if updates.StatusNode != "" {
		cm.config.StatusNode = updates.StatusNode
	}
	if updates.AlarmNode != "" {
		cm.config.AlarmNode = updates.AlarmNode
	}
	if updates.ProgressNode != "" {
		cm.config.ProgressNode = updates.ProgressNode
	}
	if updates.SubscriptionInterval > 0 {
		cm.config.SubscriptionInterval = updates.SubscriptionInterval
	}
	// Security settings
	if updates.SecurityMode != "" {
		cm.config.SecurityMode = updates.SecurityMode
	}
	if updates.SecurityPolicy != "" {
		cm.config.SecurityPolicy = updates.SecurityPolicy
	}
	if updates.CertFile != "" {
		cm.config.CertFile = updates.CertFile
	}
	if updates.KeyFile != "" {
		cm.config.KeyFile = updates.KeyFile
	}
	if updates.ServerCertFile != "" {
		cm.config.ServerCertFile = updates.ServerCertFile
	}
	if updates.Username != "" {
		cm.config.Username = updates.Username
	}
	if updates.Password != "" {
		cm.config.Password = updates.Password
	}
}

// Merge creates effective config by merging stored config with request overrides
func (cm *ConfigManager) Merge(override *Config) Config {
	base := cm.Get()

	if override == nil {
		return base
	}

	if override.Endpoint != "" {
		base.Endpoint = override.Endpoint
	}
	if override.NamespaceID > 0 {
		base.NamespaceID = override.NamespaceID
	}
	if override.TriggerNode != "" {
		base.TriggerNode = override.TriggerNode
	}
	if override.ResetNode != "" {
		base.ResetNode = override.ResetNode
	}
	if override.DataNode != "" {
		base.DataNode = override.DataNode
	}
	if override.DataType != "" {
		base.DataType = override.DataType
	}

	return base
}
