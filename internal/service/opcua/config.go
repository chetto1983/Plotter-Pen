package opcua

import (
	"os"
	"sync"

	"plotter-pen/internal/persistence"

	"gorm.io/gorm"
)

// Config represents OPC UA connection settings
type Config struct {
	ID          int64  `json:"id,omitempty"`
	Name        string `json:"name,omitempty"`
	IsActive    bool   `json:"isActive,omitempty"`
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

	// Chunked transfer nodes (Db_Punti interface)
	PointArrayNode   string `json:"pointArrayNode"`
	TriggerWriteNode string `json:"triggerWriteNode"`
	ReadDoneNode     string `json:"readDoneNode"`
	EndOfFileNode    string `json:"endOfFileNode"`

	// Chunked transfer settings
	ChunkSize    int `json:"chunkSize"`
	AckTimeout   int `json:"ackTimeout"`
	PollInterval int `json:"pollInterval"`

	// Subscription settings
	SubscriptionInterval int `json:"subscriptionInterval"`

	// Security settings
	SecurityMode   string `json:"securityMode"`
	SecurityPolicy string `json:"securityPolicy"`
	CertFile       string `json:"certFile"`
	KeyFile        string `json:"keyFile"`
	ServerCertFile string `json:"serverCertFile"`
	Username       string `json:"username"`
	Password       string `json:"password"`
}

// ConfigManager handles OPC UA configuration with database persistence
type ConfigManager struct {
	db       *gorm.DB
	config   Config
	activeID int64
	mu       sync.RWMutex
}

// NewConfigManager creates a new config manager backed by database
func NewConfigManager(db *gorm.DB) *ConfigManager {
	cm := &ConfigManager{db: db}
	cm.loadFromDB()
	cm.loadFromEnv()
	return cm
}

// loadFromDB loads the active config from database
func (cm *ConfigManager) loadFromDB() {
	var dbCfg persistence.OPCUAConfig
	// Load the active PLC config
	if err := cm.db.Where("is_active = ?", true).First(&dbCfg).Error; err != nil {
		// Fallback to first config if no active
		if err := cm.db.First(&dbCfg).Error; err != nil {
			cm.config = defaultConfig()
			return
		}
	}
	cm.activeID = dbCfg.ID
	cm.config = dbConfigToConfig(dbCfg)
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
	if px := os.Getenv("OPCUA_POSITION_X"); px != "" {
		cm.config.PositionXNode = px
	}
	if py := os.Getenv("OPCUA_POSITION_Y"); py != "" {
		cm.config.PositionYNode = py
	}
	if pz := os.Getenv("OPCUA_POSITION_Z"); pz != "" {
		cm.config.PositionZNode = pz
	}
	if sn := os.Getenv("OPCUA_STATUS_NODE"); sn != "" {
		cm.config.StatusNode = sn
	}
}

// SaveToDB persists config to database
func (cm *ConfigManager) SaveToDB() error {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	dbCfg := configToDBConfig(cm.config)
	if cm.activeID > 0 {
		dbCfg.ID = cm.activeID
	}
	return cm.db.Save(&dbCfg).Error
}

// ListAll returns all PLC configurations
func (cm *ConfigManager) ListAll() ([]Config, error) {
	var dbCfgs []persistence.OPCUAConfig
	if err := cm.db.Order("name").Find(&dbCfgs).Error; err != nil {
		return nil, err
	}
	configs := make([]Config, len(dbCfgs))
	for i, db := range dbCfgs {
		configs[i] = dbConfigToConfig(db)
	}
	return configs, nil
}

// GetByID returns a specific PLC configuration
func (cm *ConfigManager) GetByID(id int64) (Config, error) {
	var dbCfg persistence.OPCUAConfig
	if err := cm.db.First(&dbCfg, id).Error; err != nil {
		return Config{}, err
	}
	return dbConfigToConfig(dbCfg), nil
}

// Create creates a new PLC configuration
func (cm *ConfigManager) Create(cfg Config) (Config, error) {
	dbCfg := configToDBConfig(cfg)
	dbCfg.ID = 0 // Let DB assign ID
	if err := cm.db.Create(&dbCfg).Error; err != nil {
		return Config{}, err
	}
	return dbConfigToConfig(dbCfg), nil
}

// Delete deletes a PLC configuration
func (cm *ConfigManager) Delete(id int64) error {
	// Don't allow deleting active config
	cm.mu.RLock()
	if cm.activeID == id {
		cm.mu.RUnlock()
		return gorm.ErrRecordNotFound
	}
	cm.mu.RUnlock()
	return cm.db.Delete(&persistence.OPCUAConfig{}, id).Error
}

// SetActive sets a PLC as the active configuration
func (cm *ConfigManager) SetActive(id int64) error {
	return cm.db.Transaction(func(tx *gorm.DB) error {
		// Deactivate all
		if err := tx.Model(&persistence.OPCUAConfig{}).Where("is_active = ?", true).Update("is_active", false).Error; err != nil {
			return err
		}
		// Activate the selected one
		if err := tx.Model(&persistence.OPCUAConfig{}).Where("id = ?", id).Update("is_active", true).Error; err != nil {
			return err
		}
		// Reload active config
		cm.mu.Lock()
		defer cm.mu.Unlock()
		var dbCfg persistence.OPCUAConfig
		if err := tx.First(&dbCfg, id).Error; err != nil {
			return err
		}
		cm.activeID = dbCfg.ID
		cm.config = dbConfigToConfig(dbCfg)
		return nil
	})
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
	if updates.PositionXNode != "" {
		cm.config.PositionXNode = updates.PositionXNode
	}
	if updates.PositionYNode != "" {
		cm.config.PositionYNode = updates.PositionYNode
	}
	if updates.PositionZNode != "" {
		cm.config.PositionZNode = updates.PositionZNode
	}
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
	if updates.PointArrayNode != "" {
		cm.config.PointArrayNode = updates.PointArrayNode
	}
	if updates.TriggerWriteNode != "" {
		cm.config.TriggerWriteNode = updates.TriggerWriteNode
	}
	if updates.ReadDoneNode != "" {
		cm.config.ReadDoneNode = updates.ReadDoneNode
	}
	if updates.EndOfFileNode != "" {
		cm.config.EndOfFileNode = updates.EndOfFileNode
	}
	if updates.ChunkSize > 0 {
		cm.config.ChunkSize = updates.ChunkSize
	}
	if updates.AckTimeout > 0 {
		cm.config.AckTimeout = updates.AckTimeout
	}
	if updates.PollInterval > 0 {
		cm.config.PollInterval = updates.PollInterval
	}
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

// defaultConfig returns default OPC UA configuration
// NodeIDs from OPC Ua Interface.xml: TriggerWrite=12, ReadDone=23, EOF=34, PointArr=93
func defaultConfig() Config {
	return Config{
		Endpoint:             "opc.tcp://192.168.0.1:4840",
		NamespaceID:          4,
		TriggerNode:          "ns=4;i=12",
		ResetNode:            "ns=4;i=12",
		DataNode:             "ns=4;i=93",
		DataType:             "string_array",
		PositionXNode:        "ns=4;i=80",
		PositionYNode:        "ns=4;i=81",
		PositionZNode:        "ns=4;i=82",
		PointArrayNode:       "ns=4;i=93",
		TriggerWriteNode:     "ns=4;i=12",
		ReadDoneNode:         "ns=4;i=23",
		EndOfFileNode:        "ns=4;i=34",
		ChunkSize:            20,
		AckTimeout:           5000,
		PollInterval:         100,
		SubscriptionInterval: 100,
		SecurityMode:         "SignAndEncrypt",
		SecurityPolicy:       "Basic256Sha256",
	}
}

// dbConfigToConfig converts database model to Config
func dbConfigToConfig(db persistence.OPCUAConfig) Config {
	return Config{
		ID:                   db.ID,
		Name:                 db.Name,
		IsActive:             db.IsActive,
		Endpoint:             db.Endpoint,
		NamespaceID:          db.NamespaceID,
		TriggerNode:          db.TriggerNode,
		ResetNode:            db.ResetNode,
		DataNode:             db.DataNode,
		DataType:             db.DataType,
		PositionXNode:        db.PositionXNode,
		PositionYNode:        db.PositionYNode,
		PositionZNode:        db.PositionZNode,
		StatusNode:           db.StatusNode,
		AlarmNode:            db.AlarmNode,
		ProgressNode:         db.ProgressNode,
		PointArrayNode:       db.PointArrayNode,
		TriggerWriteNode:     db.TriggerWriteNode,
		ReadDoneNode:         db.ReadDoneNode,
		EndOfFileNode:        db.EndOfFileNode,
		ChunkSize:            db.ChunkSize,
		AckTimeout:           db.AckTimeout,
		PollInterval:         db.PollInterval,
		SubscriptionInterval: db.SubscriptionInterval,
		SecurityMode:         db.SecurityMode,
		SecurityPolicy:       db.SecurityPolicy,
		CertFile:             db.CertFile,
		KeyFile:              db.KeyFile,
		ServerCertFile:       db.ServerCertFile,
		Username:             db.Username,
		Password:             db.Password,
	}
}

// configToDBConfig converts Config to database model
func configToDBConfig(cfg Config) persistence.OPCUAConfig {
	return persistence.OPCUAConfig{
		ID:                   cfg.ID,
		Name:                 cfg.Name,
		IsActive:             cfg.IsActive,
		Endpoint:             cfg.Endpoint,
		NamespaceID:          cfg.NamespaceID,
		TriggerNode:          cfg.TriggerNode,
		ResetNode:            cfg.ResetNode,
		DataNode:             cfg.DataNode,
		DataType:             cfg.DataType,
		PositionXNode:        cfg.PositionXNode,
		PositionYNode:        cfg.PositionYNode,
		PositionZNode:        cfg.PositionZNode,
		StatusNode:           cfg.StatusNode,
		AlarmNode:            cfg.AlarmNode,
		ProgressNode:         cfg.ProgressNode,
		PointArrayNode:       cfg.PointArrayNode,
		TriggerWriteNode:     cfg.TriggerWriteNode,
		ReadDoneNode:         cfg.ReadDoneNode,
		EndOfFileNode:        cfg.EndOfFileNode,
		ChunkSize:            cfg.ChunkSize,
		AckTimeout:           cfg.AckTimeout,
		PollInterval:         cfg.PollInterval,
		SubscriptionInterval: cfg.SubscriptionInterval,
		SecurityMode:         cfg.SecurityMode,
		SecurityPolicy:       cfg.SecurityPolicy,
		CertFile:             cfg.CertFile,
		KeyFile:              cfg.KeyFile,
		ServerCertFile:       cfg.ServerCertFile,
		Username:             cfg.Username,
		Password:             cfg.Password,
	}
}
