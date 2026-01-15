package opcua

import (
	"os"
	"path/filepath"
	"testing"
)

// === Config Tests ===

func TestNewConfigManager_Defaults(t *testing.T) {
	// Use temp file that doesn't exist
	tmpFile := filepath.Join(os.TempDir(), "nonexistent_opcua_config.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)

	cfg := cm.Get()

	if cfg.Endpoint != "opc.tcp://localhost:4840" {
		t.Errorf("Endpoint = %v, want opc.tcp://localhost:4840", cfg.Endpoint)
	}
	if cfg.NamespaceID != 2 {
		t.Errorf("NamespaceID = %v, want 2", cfg.NamespaceID)
	}
	if cfg.DataType != "string" {
		t.Errorf("DataType = %v, want string", cfg.DataType)
	}
	if cfg.SecurityMode != "None" {
		t.Errorf("SecurityMode = %v, want None", cfg.SecurityMode)
	}
}

func TestConfigManager_LoadFromFile(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_config.json")
	defer os.Remove(tmpFile)

	// Write test config
	configJSON := `{
		"endpoint": "opc.tcp://192.168.1.100:4840",
		"namespaceId": 3,
		"dataType": "string_array",
		"triggerNode": "ns=3;s=MyTrigger"
	}`
	os.WriteFile(tmpFile, []byte(configJSON), 0644)

	cm := NewConfigManager(tmpFile)
	cfg := cm.Get()

	if cfg.Endpoint != "opc.tcp://192.168.1.100:4840" {
		t.Errorf("Endpoint = %v, want opc.tcp://192.168.1.100:4840", cfg.Endpoint)
	}
	if cfg.NamespaceID != 3 {
		t.Errorf("NamespaceID = %v, want 3", cfg.NamespaceID)
	}
	if cfg.DataType != "string_array" {
		t.Errorf("DataType = %v, want string_array", cfg.DataType)
	}
}

func TestConfigManager_LoadFromEnv(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_env.json")
	defer os.Remove(tmpFile)

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

	cm := NewConfigManager(tmpFile)
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
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_update.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)

	// Update config
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

func TestConfigManager_SaveToFile(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_save.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)
	cm.Update(Config{
		Endpoint: "opc.tcp://saved:4840",
	})

	err := cm.SaveToFile()
	if err != nil {
		t.Fatalf("SaveToFile error: %v", err)
	}

	// Verify file was written
	data, err := os.ReadFile(tmpFile)
	if err != nil {
		t.Fatalf("Failed to read saved file: %v", err)
	}

	if len(data) == 0 {
		t.Error("Saved file is empty")
	}

	// Load new manager and verify
	cm2 := NewConfigManager(tmpFile)
	cfg := cm2.Get()

	if cfg.Endpoint != "opc.tcp://saved:4840" {
		t.Errorf("Loaded endpoint = %v, want opc.tcp://saved:4840", cfg.Endpoint)
	}
}

func TestConfigManager_Merge(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_merge.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)

	// Base config
	cm.Update(Config{
		Endpoint:    "opc.tcp://base:4840",
		NamespaceID: 2,
		DataNode:    "ns=2;s=BaseData",
	})

	// Merge with override
	override := &Config{
		Endpoint: "opc.tcp://override:4840",
		// NamespaceID not set (0), should keep base
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
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_merge_nil.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)
	cm.Update(Config{Endpoint: "opc.tcp://base:4840"})

	merged := cm.Merge(nil)

	if merged.Endpoint != "opc.tcp://base:4840" {
		t.Errorf("Nil override should return base: %v", merged.Endpoint)
	}
}

// === Client Tests (Unit - No Real Connection) ===

func TestNewClient(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_client.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)
	client := NewClient(cm)

	if client == nil {
		t.Fatal("NewClient returned nil")
	}

	if client.IsConnected() {
		t.Error("New client should not be connected")
	}
}

func TestClient_IsConnected_Initial(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_client_connected.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)
	client := NewClient(cm)

	if client.IsConnected() {
		t.Error("Client should not be connected initially")
	}
}

// === Security Config Tests ===

func TestConfig_SecuritySettings(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_security.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)

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
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_position.json")
	defer os.Remove(tmpFile)

	// Set position env vars
	os.Setenv("OPCUA_POSITION_X", "ns=2;s=Pos.X")
	os.Setenv("OPCUA_POSITION_Y", "ns=2;s=Pos.Y")
	os.Setenv("OPCUA_POSITION_Z", "ns=2;s=Pos.Z")
	defer os.Unsetenv("OPCUA_POSITION_X")
	defer os.Unsetenv("OPCUA_POSITION_Y")
	defer os.Unsetenv("OPCUA_POSITION_Z")

	cm := NewConfigManager(tmpFile)
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
	tmpFile := filepath.Join(os.TempDir(), "test_opcua_subscription.json")
	defer os.Remove(tmpFile)

	cm := NewConfigManager(tmpFile)
	cfg := cm.Get()

	// Default should be 100ms
	if cfg.SubscriptionInterval != 100 {
		t.Errorf("Default SubscriptionInterval = %v, want 100", cfg.SubscriptionInterval)
	}

	// Update
	cm.Update(Config{SubscriptionInterval: 50})
	cfg = cm.Get()

	if cfg.SubscriptionInterval != 50 {
		t.Errorf("Updated SubscriptionInterval = %v, want 50", cfg.SubscriptionInterval)
	}
}
