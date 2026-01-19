package opcua

import (
	"os"
	"path/filepath"
	"testing"

	"plotter-pen/internal/persistence"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupTestDB creates an in-memory test database
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	err = db.AutoMigrate(&persistence.OPCUAConfig{})
	if err != nil {
		t.Fatalf("Failed to migrate: %v", err)
	}
	return db
}

// seedTestConfig inserts a test config
func seedTestConfig(db *gorm.DB, cfg persistence.OPCUAConfig) {
	db.Create(&cfg)
}

// === Config Tests ===

func TestNewConfigManager_Defaults(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)
	cfg := cm.Get()

	// Check defaults are applied
	if cfg.Endpoint != "opc.tcp://192.168.0.1:4840" {
		t.Errorf("Endpoint = %v, want opc.tcp://192.168.0.1:4840", cfg.Endpoint)
	}
	if cfg.NamespaceID != 4 {
		t.Errorf("NamespaceID = %v, want 4", cfg.NamespaceID)
	}
	if cfg.DataType != "string_array" {
		t.Errorf("DataType = %v, want string_array", cfg.DataType)
	}
}

func TestConfigManager_LoadFromDB(t *testing.T) {
	db := setupTestDB(t)
	seedTestConfig(db, persistence.OPCUAConfig{
		Name:        "Test PLC",
		IsActive:    true,
		Endpoint:    "opc.tcp://192.168.1.100:4840",
		NamespaceID: 3,
		DataType:    "string_array",
		TriggerNode: "ns=3;s=MyTrigger",
	})

	cm := NewConfigManager(db)
	cfg := cm.Get()

	if cfg.Name != "Test PLC" {
		t.Errorf("Name = %v, want Test PLC", cfg.Name)
	}
	if cfg.Endpoint != "opc.tcp://192.168.1.100:4840" {
		t.Errorf("Endpoint = %v, want opc.tcp://192.168.1.100:4840", cfg.Endpoint)
	}
	if cfg.NamespaceID != 3 {
		t.Errorf("NamespaceID = %v, want 3", cfg.NamespaceID)
	}
}

func TestConfigManager_LoadFromEnv(t *testing.T) {
	db := setupTestDB(t)

	// Set env vars
	envVars := map[string]string{
		"OPCUA_ENDPOINT":     "opc.tcp://env-server:4840",
		"OPCUA_DATA_NODE":    "ns=2;s=EnvData",
		"OPCUA_TRIGGER_NODE": "ns=2;s=EnvTrigger",
		"OPCUA_DATA_TYPE":    "int32",
	}

	for k, v := range envVars {
		os.Setenv(k, v)
		defer os.Unsetenv(k)
	}

	cm := NewConfigManager(db)
	cfg := cm.Get()

	if cfg.Endpoint != "opc.tcp://env-server:4840" {
		t.Errorf("Endpoint = %v, want opc.tcp://env-server:4840", cfg.Endpoint)
	}
	if cfg.DataNode != "ns=2;s=EnvData" {
		t.Errorf("DataNode = %v, want ns=2;s=EnvData", cfg.DataNode)
	}
	if cfg.DataType != "int32" {
		t.Errorf("DataType = %v, want int32", cfg.DataType)
	}
}

func TestConfigManager_Update(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)

	cm.Update(Config{
		Endpoint:    "opc.tcp://updated:4840",
		NamespaceID: 5,
		DataType:    "float",
	})

	cfg := cm.Get()

	if cfg.Endpoint != "opc.tcp://updated:4840" {
		t.Errorf("Endpoint = %v, want opc.tcp://updated:4840", cfg.Endpoint)
	}
	if cfg.NamespaceID != 5 {
		t.Errorf("NamespaceID = %v, want 5", cfg.NamespaceID)
	}
}

func TestConfigManager_SaveToDB(t *testing.T) {
	db := setupTestDB(t)
	seedTestConfig(db, persistence.OPCUAConfig{
		Name:     "Save Test",
		IsActive: true,
		Endpoint: "opc.tcp://initial:4840",
	})

	cm := NewConfigManager(db)
	cm.Update(Config{Endpoint: "opc.tcp://saved:4840"})

	err := cm.SaveToDB()
	if err != nil {
		t.Fatalf("SaveToDB error: %v", err)
	}

	// Load new manager and verify
	cm2 := NewConfigManager(db)
	cfg := cm2.Get()

	if cfg.Endpoint != "opc.tcp://saved:4840" {
		t.Errorf("Loaded endpoint = %v, want opc.tcp://saved:4840", cfg.Endpoint)
	}
}

func TestConfigManager_Merge(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)

	cm.Update(Config{
		Endpoint:    "opc.tcp://base:4840",
		NamespaceID: 2,
		DataNode:    "ns=2;s=BaseData",
	})

	override := &Config{
		Endpoint: "opc.tcp://override:4840",
	}

	merged := cm.Merge(override)

	if merged.Endpoint != "opc.tcp://override:4840" {
		t.Errorf("Endpoint should be overridden: %v", merged.Endpoint)
	}
	if merged.NamespaceID != 2 {
		t.Errorf("NamespaceID should keep base value: %v", merged.NamespaceID)
	}
	if merged.DataNode != "ns=2;s=BaseData" {
		t.Errorf("DataNode should keep base value: %v", merged.DataNode)
	}
}

func TestConfigManager_MergeNil(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)
	cm.Update(Config{Endpoint: "opc.tcp://base:4840"})

	merged := cm.Merge(nil)

	if merged.Endpoint != "opc.tcp://base:4840" {
		t.Errorf("Nil override should return base: %v", merged.Endpoint)
	}
}

// === Multi-PLC Tests ===

func TestConfigManager_ListAll(t *testing.T) {
	db := setupTestDB(t)
	seedTestConfig(db, persistence.OPCUAConfig{Name: "PLC 1", Endpoint: "opc.tcp://plc1:4840"})
	seedTestConfig(db, persistence.OPCUAConfig{Name: "PLC 2", Endpoint: "opc.tcp://plc2:4840"})

	cm := NewConfigManager(db)
	configs, err := cm.ListAll()
	if err != nil {
		t.Fatalf("ListAll error: %v", err)
	}

	if len(configs) != 2 {
		t.Errorf("Expected 2 PLCs, got %d", len(configs))
	}
}

func TestConfigManager_Create(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)

	created, err := cm.Create(Config{
		Name:     "New PLC",
		Endpoint: "opc.tcp://new:4840",
	})
	if err != nil {
		t.Fatalf("Create error: %v", err)
	}

	if created.ID == 0 {
		t.Error("Created PLC should have ID")
	}
	if created.Name != "New PLC" {
		t.Errorf("Name = %v, want New PLC", created.Name)
	}
}

func TestConfigManager_SetActive(t *testing.T) {
	db := setupTestDB(t)
	seedTestConfig(db, persistence.OPCUAConfig{Name: "PLC 1", IsActive: true, Endpoint: "opc.tcp://plc1:4840"})
	seedTestConfig(db, persistence.OPCUAConfig{Name: "PLC 2", IsActive: false, Endpoint: "opc.tcp://plc2:4840"})

	cm := NewConfigManager(db)

	// Get PLC 2 ID
	configs, _ := cm.ListAll()
	var plc2ID int64
	for _, c := range configs {
		if c.Name == "PLC 2" {
			plc2ID = c.ID
			break
		}
	}

	err := cm.SetActive(plc2ID)
	if err != nil {
		t.Fatalf("SetActive error: %v", err)
	}

	cfg := cm.Get()
	if cfg.Name != "PLC 2" {
		t.Errorf("Active PLC = %v, want PLC 2", cfg.Name)
	}
}

// === Client Tests ===

func TestNewClient(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)
	client := NewClient(cm)

	if client == nil {
		t.Fatal("NewClient returned nil")
	}

	if client.IsConnected() {
		t.Error("New client should not be connected")
	}
}

func TestClient_IsConnected_Initial(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)
	client := NewClient(cm)

	if client.IsConnected() {
		t.Error("Client should not be connected initially")
	}
}

// === Security Config Tests ===

func TestConfig_SecuritySettings(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)

	cm.Update(Config{
		SecurityMode:   "SignAndEncrypt",
		SecurityPolicy: "Basic256Sha256",
		CertFile:       "/path/to/cert.pem",
		KeyFile:        "/path/to/key.pem",
		Username:       "admin",
		Password:       "secret",
	})

	cfg := cm.Get()

	if cfg.SecurityMode != "SignAndEncrypt" {
		t.Errorf("SecurityMode = %v", cfg.SecurityMode)
	}
	if cfg.SecurityPolicy != "Basic256Sha256" {
		t.Errorf("SecurityPolicy = %v", cfg.SecurityPolicy)
	}
	if cfg.Username != "admin" {
		t.Errorf("Username = %v", cfg.Username)
	}
}

func TestConfig_PositionNodes(t *testing.T) {
	db := setupTestDB(t)

	os.Setenv("OPCUA_POSITION_X", "ns=2;s=Pos.X")
	os.Setenv("OPCUA_POSITION_Y", "ns=2;s=Pos.Y")
	os.Setenv("OPCUA_POSITION_Z", "ns=2;s=Pos.Z")
	defer os.Unsetenv("OPCUA_POSITION_X")
	defer os.Unsetenv("OPCUA_POSITION_Y")
	defer os.Unsetenv("OPCUA_POSITION_Z")

	cm := NewConfigManager(db)
	cfg := cm.Get()

	if cfg.PositionXNode != "ns=2;s=Pos.X" {
		t.Errorf("PositionXNode = %v", cfg.PositionXNode)
	}
	if cfg.PositionYNode != "ns=2;s=Pos.Y" {
		t.Errorf("PositionYNode = %v", cfg.PositionYNode)
	}
	if cfg.PositionZNode != "ns=2;s=Pos.Z" {
		t.Errorf("PositionZNode = %v", cfg.PositionZNode)
	}
}

func TestConfig_SubscriptionInterval(t *testing.T) {
	db := setupTestDB(t)
	cm := NewConfigManager(db)
	cfg := cm.Get()

	// Default should be 100ms
	if cfg.SubscriptionInterval != 100 {
		t.Errorf("Default SubscriptionInterval = %v, want 100", cfg.SubscriptionInterval)
	}

	cm.Update(Config{SubscriptionInterval: 50})
	cfg = cm.Get()

	if cfg.SubscriptionInterval != 50 {
		t.Errorf("Updated SubscriptionInterval = %v, want 50", cfg.SubscriptionInterval)
	}
}

// === Certificate Tests ===

func TestGenerateAndSaveCert(t *testing.T) {
	tmpDir := filepath.Join(os.TempDir(), "plotter-pen-test-certs")
	defer os.RemoveAll(tmpDir)

	certPath := filepath.Join(tmpDir, "client.pem")
	keyPath := filepath.Join(tmpDir, "client.key")

	err := GenerateAndSaveCert(certPath, keyPath)
	if err != nil {
		t.Fatalf("GenerateAndSaveCert error: %v", err)
	}

	// Verify files exist
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		t.Error("Certificate file not created")
	}
	if _, err := os.Stat(keyPath); os.IsNotExist(err) {
		t.Error("Key file not created")
	}

	// Verify DER file also created
	derPath := filepath.Join(tmpDir, "client.der")
	if _, err := os.Stat(derPath); os.IsNotExist(err) {
		t.Error("DER file not created")
	}
}
