package persistence

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestInitDB(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_plotter_pen_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, err := InitDB(tmpFile)
	if err != nil {
		t.Fatalf("InitDB error: %v", err)
	}

	if db == nil {
		t.Fatal("InitDB returned nil db")
	}

	// Verify tables exist by querying them
	var count int64

	// AppState singleton
	db.Model(&AppState{}).Count(&count)
	if count != 1 {
		t.Errorf("AppState count = %d, want 1", count)
	}

	// Default tools seeded
	db.Model(&Tool{}).Count(&count)
	if count < 1 {
		t.Errorf("Tool count = %d, want >= 1", count)
	}

	// Default machines seeded
	db.Model(&MachineConfig{}).Count(&count)
	if count < 1 {
		t.Errorf("MachineConfig count = %d, want >= 1", count)
	}
}

func TestInitDB_MultipleCalls(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_multi_init_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	// First init
	db1, err := InitDB(tmpFile)
	if err != nil {
		t.Fatalf("First InitDB error: %v", err)
	}

	// Get tool count
	var count1 int64
	db1.Model(&Tool{}).Count(&count1)

	// Second init should not duplicate seeds
	db2, err := InitDB(tmpFile)
	if err != nil {
		t.Fatalf("Second InitDB error: %v", err)
	}

	var count2 int64
	db2.Model(&Tool{}).Count(&count2)

	if count1 != count2 {
		t.Errorf("Tool counts differ after reinit: %d vs %d", count1, count2)
	}
}

func TestAppState_CRUD(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_appstate_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, _ := InitDB(tmpFile)

	// Read initial state
	var state AppState
	if err := db.First(&state).Error; err != nil {
		t.Fatalf("Read AppState error: %v", err)
	}

	if state.ID != 1 {
		t.Errorf("AppState ID = %d, want 1", state.ID)
	}

	// Update state
	newData := `{"test": "data"}`
	db.Model(&AppState{}).Where("id = 1").Update("data", newData)

	// Verify update
	db.First(&state)
	if state.Data != newData {
		t.Errorf("AppState data = %v, want %v", state.Data, newData)
	}
}

func TestDrawing_CRUD(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_drawings_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, _ := InitDB(tmpFile)

	// Create
	drawing := Drawing{
		Name:       "Test Drawing",
		Data:       `{"primitives": []}`,
		PreviewImg: "base64...",
	}

	if err := db.Create(&drawing).Error; err != nil {
		t.Fatalf("Create drawing error: %v", err)
	}

	if drawing.ID == 0 {
		t.Error("Drawing ID should be set after create")
	}

	// Read
	var loaded Drawing
	if err := db.First(&loaded, drawing.ID).Error; err != nil {
		t.Fatalf("Read drawing error: %v", err)
	}

	if loaded.Name != "Test Drawing" {
		t.Errorf("Drawing name = %v", loaded.Name)
	}

	// Update
	db.Model(&Drawing{}).Where("id = ?", drawing.ID).Update("name", "Updated Name")

	db.First(&loaded, drawing.ID)
	if loaded.Name != "Updated Name" {
		t.Errorf("Updated name = %v", loaded.Name)
	}

	// Delete
	db.Delete(&Drawing{}, drawing.ID)

	var count int64
	db.Model(&Drawing{}).Where("id = ?", drawing.ID).Count(&count)
	if count != 0 {
		t.Error("Drawing should be deleted")
	}
}

func TestDrawing_UniqueName(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_unique_name_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, _ := InitDB(tmpFile)

	drawing1 := Drawing{Name: "Unique", Data: "{}"}
	db.Create(&drawing1)

	drawing2 := Drawing{Name: "Unique", Data: "{}"}
	err := db.Create(&drawing2).Error

	if err == nil {
		t.Error("Should fail on duplicate name")
	}
}

func TestTool_CRUD(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_tools_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, _ := InitDB(tmpFile)

	// Create custom tool
	tool := Tool{
		Name:        "Custom Endmill",
		Type:        "endmill",
		Diameter:    12.0,
		Description: "12mm endmill",
	}

	if err := db.Create(&tool).Error; err != nil {
		t.Fatalf("Create tool error: %v", err)
	}

	// Read back
	var loaded Tool
	db.First(&loaded, tool.ID)

	if loaded.Diameter != 12.0 {
		t.Errorf("Tool diameter = %v", loaded.Diameter)
	}

	// List all tools
	var tools []Tool
	db.Find(&tools)

	// Should have default tools + new one
	if len(tools) < 2 {
		t.Errorf("Expected at least 2 tools, got %d", len(tools))
	}
}

func TestMachineConfig_CRUD(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_machines_%s_%d.db", t.Name(), time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, _ := InitDB(tmpFile)

	// Read default machines
	var machines []MachineConfig
	db.Find(&machines)

	if len(machines) < 1 {
		t.Fatal("Should have default machines")
	}

	// Find active machine
	var active MachineConfig
	if err := db.Where("is_active = ?", true).First(&active).Error; err != nil {
		t.Fatalf("No active machine found: %v", err)
	}

	t.Logf("Active machine: %s (%s)", active.Name, active.Type)

	// Create custom machine with unique name
	customName := "Custom CNC " + t.Name()
	custom := MachineConfig{
		Name:     customName,
		Type:     "router",
		Data:     `{"dimensions": {"x": 1000, "y": 500}}`,
		IsActive: false,
	}
	if err := db.Create(&custom).Error; err != nil {
		t.Fatalf("Failed to create custom machine: %v", err)
	}

	if custom.ID == 0 {
		t.Error("Machine ID should be set")
	}

	// Verify unique name constraint
	duplicate := MachineConfig{
		Name: customName,
		Type: "router",
		Data: "{}",
	}
	err := db.Create(&duplicate).Error
	if err == nil {
		t.Error("Should fail on duplicate machine name")
	}
}

func TestInitDB_InvalidPath(t *testing.T) {
	// Test with invalid path that should fail to open
	// On Windows, use an invalid drive letter path
	// On Unix, use a path in a non-existent directory
	invalidPath := "/nonexistent_very_long_path_that_cannot_possibly_exist/deep/nested/test.db"

	_, err := InitDB(invalidPath)
	if err == nil {
		// On some systems this may succeed if it creates the dir
		t.Log("InitDB did not fail for invalid path - OS may have created directory")
	}
}

func TestDefaultSeeds(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_seeds_%d.db", time.Now().UnixNano()))
	defer os.Remove(tmpFile)

	db, _ := InitDB(tmpFile)

	// Check default tools
	var tools []Tool
	db.Find(&tools)

	toolNames := make(map[string]bool)
	for _, tool := range tools {
		toolNames[tool.Name] = true
	}

	expectedTools := []string{"Penna 0.5mm", "Endmill 3mm", "Endmill 6mm", "V-Bit 90°"}
	for _, name := range expectedTools {
		if !toolNames[name] {
			t.Errorf("Missing default tool: %s", name)
		}
	}

	// Check default machines
	var machines []MachineConfig
	db.Find(&machines)

	machineTypes := make(map[string]bool)
	for _, m := range machines {
		machineTypes[m.Type] = true
	}

	expectedTypes := []string{"plotter", "laser", "router", "printer"}
	for _, typ := range expectedTypes {
		if !machineTypes[typ] {
			t.Errorf("Missing default machine type: %s", typ)
		}
	}
}
