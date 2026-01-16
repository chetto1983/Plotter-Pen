//go:build integration

package opcua

import (
	"context"
	"testing"
	"time"

	"github.com/gopcua/opcua"
)

// TestPLCEndpointDiscovery discovers available OPC UA endpoints
func TestPLCEndpointDiscovery(t *testing.T) {
	endpoint := "opc.tcp://192.168.0.1:4840"

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	t.Logf("Discovering endpoints at: %s", endpoint)

	endpoints, err := opcua.GetEndpoints(ctx, endpoint)
	if err != nil {
		t.Fatalf("Failed to get endpoints: %v", err)
	}

	t.Logf("Found %d endpoints:", len(endpoints))
	for i, ep := range endpoints {
		t.Logf("  [%d] URL: %s", i, ep.EndpointURL)
		t.Logf("      Security Mode: %v", ep.SecurityMode)
		t.Logf("      Security Policy: %s", ep.SecurityPolicyURI)
		t.Logf("      User Identity: %v", ep.UserIdentityTokens)
	}
}

// TestPLCConnection tests real PLC connection
// Run with: go test -tags=integration ./internal/service/opcua/...
func TestPLCConnection(t *testing.T) {
	configFile := "../../../opcua_config.json"
	configMgr := NewConfigManager(configFile)
	cfg := configMgr.Get()

	t.Logf("Testing connection to: %s", cfg.Endpoint)
	t.Logf("Data node: %s", cfg.DataNode)
	t.Logf("Trigger node: %s", cfg.TriggerNode)
	t.Logf("Position X: %s", cfg.PositionXNode)
	t.Logf("Position Y: %s", cfg.PositionYNode)
	t.Logf("Position Z: %s", cfg.PositionZNode)

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Test connection
	err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(ctx)

	t.Log("✓ Connected successfully")

	// Test reading position X
	posX, err := client.ReadNode(ctx, cfg.PositionXNode)
	if err != nil {
		t.Logf("⚠ Could not read Position X: %v", err)
	} else {
		t.Logf("✓ Position X: %v", posX)
	}

	// Test reading position Y
	posY, err := client.ReadNode(ctx, cfg.PositionYNode)
	if err != nil {
		t.Logf("⚠ Could not read Position Y: %v", err)
	} else {
		t.Logf("✓ Position Y: %v", posY)
	}

	// Test reading position Z
	posZ, err := client.ReadNode(ctx, cfg.PositionZNode)
	if err != nil {
		t.Logf("⚠ Could not read Position Z: %v", err)
	} else {
		t.Logf("✓ Position Z: %v", posZ)
	}
}

// TestPLCReadDataNode tests reading the data node
func TestPLCReadDataNode(t *testing.T) {
	configFile := "../../../opcua_config.json"
	configMgr := NewConfigManager(configFile)
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(ctx)

	// Test reading data node
	data, err := client.ReadNode(ctx, cfg.DataNode)
	if err != nil {
		t.Logf("⚠ Could not read data node: %v", err)
	} else {
		t.Logf("✓ Data node value: %v", data)
	}
}

// TestPLCWriteSimple tests writing a simple value (CAUTION: writes to PLC!)
func TestPLCWriteSimple(t *testing.T) {
	t.Skip("Skipping write test - uncomment to run manually")

	configFile := "../../../opcua_config.json"
	configMgr := NewConfigManager(configFile)
	cfg := configMgr.Get()

	client := NewClient(configMgr)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := client.Connect(ctx)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer client.Disconnect(ctx)

	// Test writing string array
	testData := []string{"G0 X0 Y0", "G1 X100 Y100 F1000", "G0 X0 Y0"}
	err = client.WriteData(ctx, testData, cfg)
	if err != nil {
		t.Fatalf("Failed to write data: %v", err)
	}

	t.Log("✓ Data written successfully")
}
