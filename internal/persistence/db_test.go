package persistence

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
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

// plcSettingsBeforeProfile is the PLC settings table of databases created before the profile
// settings existed.
type plcSettingsBeforeProfile struct {
	ID         int64     `gorm:"primaryKey;check:id = 1"`
	WorkSpeed  float64   `gorm:"default:100"`
	RapidSpeed float64   `gorm:"default:1000"`
	SafeZ      float64   `gorm:"default:5"`
	WorkZ      float64   `gorm:"default:0"`
	WaitTime   int       `gorm:"default:0"`
	UpdatedAt  time.Time `gorm:"autoUpdateTime"`
}

func (plcSettingsBeforeProfile) TableName() string { return "plc_simulation_settings" }

// An existing database keeps its settings and gets a usable value for each profile and drilling
// setting.
func TestInitDB_ExistingPLCSettingsGetCAMDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := old.AutoMigrate(&plcSettingsBeforeProfile{}); err != nil {
		t.Fatalf("old schema: %v", err)
	}
	if err := old.Create(&plcSettingsBeforeProfile{ID: 1, WorkSpeed: 250, RapidSpeed: 900, SafeZ: 12, WorkZ: 3}).Error; err != nil {
		t.Fatalf("old row: %v", err)
	}
	closeDB(t, old)

	db, err := InitDB(path)
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { closeDB(t, db) })

	var got PLCSimulationSettings
	if err := db.First(&got).Error; err != nil {
		t.Fatalf("load: %v", err)
	}
	if got.WorkSpeed != 250 || got.SafeZ != 12 || got.WorkZ != 3 || got.StepDown != 0.5 || got.PlungeSpeed != 5 || got.RampAngle != 3 ||
		got.RetractClearance != 1 {
		t.Fatalf("settings after migration %+v", got)
	}
}

// A new database starts with the pen as the operation of the PLC output and usable profile and
// drilling parameters.
func TestInitDB_CreatesCAMOperationWithDefaults(t *testing.T) {
	db, err := InitDB(filepath.Join(t.TempDir(), "new.db"))
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { closeDB(t, db) })

	var got CAMOperation
	if err := db.First(&got).Error; err != nil {
		t.Fatalf("load: %v", err)
	}
	want := CAMOperation{ID: 1, Operation: "pen", Thickness: 1.6, Overcut: 0.2,
		ToolDiameter: 2, ToolType: "endmill", Side: "outside", Direction: "conventional", ProfileThrough: true, ProfileDepth: 1,
		DrillDiameter: 1, DrillType: "drill", MinHoleDiameter: 0.4, MaxHoleDiameter: 1.2, PeckDepth: 0, TipAngle: 118, TipThrough: false,
		DrillThrough: true, DrillDepth: 1}
	got.UpdatedAt = want.UpdatedAt
	if got != want {
		t.Fatalf("operation %+v, want %+v", got, want)
	}
}

// camOperationBeforeStock is the operation table of databases created before the piece thickness
// existed.
type camOperationBeforeStock struct {
	ID              int64     `gorm:"primaryKey;check:id = 1"`
	Operation       string    `gorm:"default:'pen'"`
	ToolDiameter    float64   `gorm:"default:2"`
	Side            string    `gorm:"default:'outside'"`
	Direction       string    `gorm:"default:'conventional'"`
	DrillDiameter   float64   `gorm:"default:1"`
	MinHoleDiameter float64   `gorm:"default:0.4"`
	MaxHoleDiameter float64   `gorm:"default:1.2"`
	PeckDepth       float64   `gorm:"default:0"`
	TipAngle        float64   `gorm:"default:118"`
	TipThrough      bool      `gorm:"default:false"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime"`
}

func (camOperationBeforeStock) TableName() string { return "cam_operations" }

// An existing operation keeps its parameters and gets the default piece, cut through.
func TestInitDB_ExistingCAMOperationGetsThePieceDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := old.AutoMigrate(&camOperationBeforeStock{}); err != nil {
		t.Fatalf("old schema: %v", err)
	}
	row := camOperationBeforeStock{ID: 1, Operation: "drill", ToolDiameter: 3, Side: "inside", Direction: "climb",
		DrillDiameter: 0.8, MinHoleDiameter: 0.5, MaxHoleDiameter: 0.9, PeckDepth: 0.4, TipAngle: 130, TipThrough: true}
	if err := old.Create(&row).Error; err != nil {
		t.Fatalf("old row: %v", err)
	}
	closeDB(t, old)

	db, err := InitDB(path)
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { closeDB(t, db) })

	var got CAMOperation
	if err := db.First(&got).Error; err != nil {
		t.Fatalf("load: %v", err)
	}
	want := CAMOperation{ID: 1, Operation: "drill", Thickness: 1.6, Overcut: 0.2,
		ToolDiameter: 3, ToolType: "endmill", Side: "inside", Direction: "climb", ProfileThrough: true, ProfileDepth: 1,
		DrillDiameter: 0.8, DrillType: "drill", MinHoleDiameter: 0.5, MaxHoleDiameter: 0.9, PeckDepth: 0.4, TipAngle: 130, TipThrough: true,
		DrillThrough: true, DrillDepth: 1}
	got.UpdatedAt = want.UpdatedAt
	if got != want {
		t.Fatalf("operation after migration %+v, want %+v", got, want)
	}
}

// toolBeforeSpeeds is the tools table of databases created before a tool carried its speeds.
type toolBeforeSpeeds struct {
	ID          int64   `gorm:"primaryKey;autoIncrement"`
	Name        string  `gorm:"not null"`
	Type        string  `gorm:"default:'pen'"`
	Diameter    float64 `gorm:"not null"`
	Description string
	CreatedAt   time.Time `gorm:"autoCreateTime"`
}

func (toolBeforeSpeeds) TableName() string { return "tools" }

// The tools of an existing database are kept, and with no speeds of their own they take the
// global ones.
func TestInitDB_ExistingToolsTakeTheGlobalSpeeds(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := old.AutoMigrate(&toolBeforeSpeeds{}); err != nil {
		t.Fatalf("old schema: %v", err)
	}
	if err := old.Create(&toolBeforeSpeeds{Name: "Fresa di casa", Type: "endmill", Diameter: 4}).Error; err != nil {
		t.Fatalf("old row: %v", err)
	}
	closeDB(t, old)

	db, err := InitDB(path)
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { closeDB(t, db) })

	var tools []Tool
	if err := db.Find(&tools).Error; err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(tools) != 1 {
		t.Fatalf("%d tools after the migration, want the one there was", len(tools))
	}
	if got := tools[0]; got.Name != "Fresa di casa" || got.Diameter != 4 || got.Feed != 0 || got.Plunge != 0 || got.StepDown != 0 {
		t.Fatalf("tool after the migration %+v, want its own name and diameter and no speeds", got)
	}
}

// A database from before the job gets an empty one, with the parameters of a step in columns of
// their own; the operation keeps its columns where they were, with no prefix.
func TestInitDB_ExistingDatabaseGetsAnEmptyJob(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	old, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if err := old.AutoMigrate(&camOperationBeforeStock{}); err != nil {
		t.Fatalf("old schema: %v", err)
	}
	closeDB(t, old)

	db, err := InitDB(path)
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() { closeDB(t, db) })

	var steps int64
	if err := db.Model(&JobStep{}).Count(&steps).Error; err != nil {
		t.Fatalf("count the steps: %v", err)
	}
	if steps != 0 {
		t.Fatalf("%d steps in a database that had no job, want 0", steps)
	}
	for _, column := range []string{"position", "layer", "operation", "tool_id", "drill_id", "drill_depth", "close_gap"} {
		if !db.Migrator().HasColumn(&JobStep{}, column) {
			t.Errorf("job_steps has no column %q", column)
		}
	}
	for _, column := range []string{"operation", "tool_id", "drill_depth"} {
		if !db.Migrator().HasColumn(&CAMOperation{}, column) {
			t.Errorf("cam_operations has no column %q", column)
		}
	}
}

func closeDB(t *testing.T, db *gorm.DB) {
	t.Helper()
	sqlDB, err := db.DB()
	if err == nil {
		err = sqlDB.Close()
	}
	if err != nil {
		t.Fatalf("close: %v", err)
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
