package opcua

import (
	"context"
	"flag"
	"os"
	"testing"
	"time"

	"plotter-pen/internal/persistence"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var runIntegration = flag.Bool("integration", false, "run integration tests")

// setupValidationTestDB creates an in-memory test database with correct NodeIDs
func setupValidationTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	db.AutoMigrate(&persistence.OPCUAConfig{})

	// Insert config with correct NodeIDs from OPC Ua Interface.xml
	// TriggerWrite=12, ReadDone=23, EOF=34, PointArr=93, Pos.X=80, Y=81, Z=82
	cfg := persistence.OPCUAConfig{
		Name:             "Test PLC",
		IsActive:         true,
		Endpoint:         "opc.tcp://192.168.0.1:4840",
		NamespaceID:      4,
		DataNode:         "ns=4;i=93",
		TriggerNode:      "ns=4;i=12",
		ResetNode:        "ns=4;i=12",
		PointArrayNode:   "ns=4;i=93",
		TriggerWriteNode: "ns=4;i=12",
		ReadDoneNode:     "ns=4;i=23",
		EndOfFileNode:    "ns=4;i=34",
		PositionXNode:    "ns=4;i=80",
		PositionYNode:    "ns=4;i=81",
		PositionZNode:    "ns=4;i=82",
		ChunkSize:        20,
		AckTimeout:       5000,
		PollInterval:     100,
		SecurityMode:     "SignAndEncrypt",
		SecurityPolicy:   "Basic256Sha256",
	}
	db.Create(&cfg)
	return db
}

// TestValidateOPCUANodes is an integration test that validates all configured
// OPC UA nodes exist on the PLC.
// Run with: OPCUA_INTEGRATION=1 go test ./internal/service/opcua/... -run TestValidateOPCUANodes -v
func TestValidateOPCUANodes(t *testing.T) {
	if os.Getenv("OPCUA_INTEGRATION") != "1" && !*runIntegration {
		t.Skip("Skipping integration test. Use -integration flag or set OPCUA_INTEGRATION=1")
	}

	// Expected NodeIDs from OPC Ua Interface.xml (ns=4)
	expectedNodes := map[string]string{
		"PointArr":      "ns=4;i=93",
		"TriggerWrite":  "ns=4;i=12",
		"ReadDone":      "ns=4;i=23",
		"EndOfFile":     "ns=4;i=34",
		"Pos.X":         "ns=4;i=80",
		"Pos.Y":         "ns=4;i=81",
		"Pos.Z":         "ns=4;i=82",
	}

	db := setupValidationTestDB(t)
	configMgr := NewConfigManager(db)
	cfg := configMgr.Get()

	client := NewClient(configMgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	t.Log("Connecting to OPC UA server:", cfg.Endpoint)
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(ctx)

	t.Log("Connected successfully")

	// Validate each node
	failCount := 0
	for name, nodeID := range expectedNodes {
		val, err := client.ReadNode(ctx, nodeID)
		if err != nil {
			t.Errorf("❌ %s (%s): FAILED - %v", name, nodeID, err)
			failCount++
		} else {
			t.Logf("✓ %s (%s): OK - type=%T, value=%v", name, nodeID, val, val)
		}
	}

	if failCount > 0 {
		t.Fatalf("Node validation failed: %d/%d nodes not accessible", failCount, len(expectedNodes))
	}

	t.Log("All nodes validated successfully!")
}

// TestValidateChunkedTransferNodes specifically tests the chunked transfer interface
func TestValidateChunkedTransferNodes(t *testing.T) {
	if os.Getenv("OPCUA_INTEGRATION") != "1" && !*runIntegration {
		t.Skip("Skipping integration test. Use -integration flag or set OPCUA_INTEGRATION=1")
	}

	db := setupValidationTestDB(t)
	configMgr := NewConfigManager(db)
	cfg := configMgr.Get()

	client := NewClient(configMgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	t.Log("Connecting to:", cfg.Endpoint)
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connection failed: %v", err)
	}
	defer client.Disconnect(ctx)

	// Test 1: Read EndOfFile (should be BOOL) - ns=4;i=34
	t.Log("Testing EndOfFile node (ns=4;i=34)...")
	eof, err := client.ReadBoolNode(ctx, cfg.EndOfFileNode)
	if err != nil {
		t.Errorf("❌ EndOfFile read failed: %v", err)
	} else {
		t.Logf("✓ EndOfFile = %v", eof)
	}

	// Test 2: Read TriggerWrite (should be BOOL) - ns=4;i=12
	t.Log("Testing TriggerWrite node (ns=4;i=12)...")
	trigger, err := client.ReadBoolNode(ctx, cfg.TriggerWriteNode)
	if err != nil {
		t.Errorf("❌ TriggerWrite read failed: %v", err)
	} else {
		t.Logf("✓ TriggerWrite = %v", trigger)
	}

	// Test 3: Read ReadDone (should be BOOL) - ns=4;i=23
	t.Log("Testing ReadDone node (ns=4;i=23)...")
	done, err := client.ReadBoolNode(ctx, cfg.ReadDoneNode)
	if err != nil {
		t.Errorf("❌ ReadDone read failed: %v", err)
	} else {
		t.Logf("✓ ReadDone = %v", done)
	}

	// Test 4: Read Point array (should be String[20]) - ns=4;i=93
	t.Log("Testing PointArr node (ns=4;i=93)...")
	arr, err := client.ReadNode(ctx, cfg.PointArrayNode)
	if err != nil {
		t.Errorf("❌ Point array read failed: %v", err)
	} else {
		t.Logf("✓ Point array type=%T, value=%v", arr, arr)
	}

	t.Log("Chunked transfer nodes validation complete!")
}

// TestBrowseServerNodes browses the OPC UA server to discover available nodes
func TestBrowseServerNodes(t *testing.T) {
	if os.Getenv("OPCUA_INTEGRATION") != "1" && !*runIntegration {
		t.Skip("Skipping integration test. Use -integration flag or set OPCUA_INTEGRATION=1")
	}

	db := setupValidationTestDB(t)
	configMgr := NewConfigManager(db)
	cfg := configMgr.Get()

	client := NewClient(configMgr)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	t.Log("Connecting to:", cfg.Endpoint)
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("Connection failed: %v", err)
	}
	defer client.Disconnect(ctx)

	// Browse root Objects folder (i=85)
	t.Log("Browsing Objects folder (i=85)...")
	nodes, err := client.BrowseNode(ctx, "i=85")
	if err != nil {
		t.Logf("Browse Objects failed: %v", err)
	} else {
		t.Logf("Found %d nodes in Objects:", len(nodes))
		for _, n := range nodes {
			t.Logf("  - %s (%s)", n.DisplayName, n.NodeID)
		}
	}

	// Try browsing ns=1 ServerInterfaces
	t.Log("Browsing ns=1;s=ServerInterfaces...")
	nodes, err = client.BrowseNode(ctx, "ns=1;s=ServerInterfaces")
	if err != nil {
		t.Logf("Browse ServerInterfaces failed: %v", err)
	} else {
		t.Logf("Found %d nodes in ServerInterfaces:", len(nodes))
		for _, n := range nodes {
			t.Logf("  - %s (%s)", n.DisplayName, n.NodeID)
		}
	}

	// Try browsing ns=4;i=1 (Com interface - actual location per browse)
	t.Log("Browsing ns=4;i=1 (Com interface)...")
	nodes, err = client.BrowseNode(ctx, "ns=4;i=1")
	if err != nil {
		t.Logf("Browse Com failed: %v", err)
	} else {
		t.Logf("Found %d nodes in Com:", len(nodes))
		for _, n := range nodes {
			t.Logf("  - %s (%s)", n.DisplayName, n.NodeID)
		}
	}

	// Browse ns=3;s=ServerInterfaces (actual location on this PLC)
	t.Log("Browsing ns=3;s=ServerInterfaces...")
	nodes, err = client.BrowseNode(ctx, "ns=3;s=ServerInterfaces")
	if err != nil {
		t.Logf("Browse ns=3 ServerInterfaces failed: %v", err)
	} else {
		t.Logf("Found %d nodes in ns=3 ServerInterfaces:", len(nodes))
		for _, n := range nodes {
			t.Logf("  - %s (%s)", n.DisplayName, n.NodeID)
			// Browse children of each interface
			children, _ := client.BrowseNode(ctx, n.NodeID)
			for _, c := range children {
				t.Logf("      - %s (%s)", c.DisplayName, c.NodeID)
			}
		}
	}

	// Browse PLC_1
	t.Log("Browsing ns=3;s=PLC (PLC_1)...")
	nodes, err = client.BrowseNode(ctx, "ns=3;s=PLC")
	if err != nil {
		t.Logf("Browse PLC_1 failed: %v", err)
	} else {
		t.Logf("Found %d nodes in PLC_1:", len(nodes))
		for _, n := range nodes {
			t.Logf("  - %s (%s)", n.DisplayName, n.NodeID)
		}
	}
}
