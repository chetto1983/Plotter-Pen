package persistence

import (
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// AppState stores the application state (singleton)
type AppState struct {
	ID        int64     `gorm:"primaryKey;check:id = 1" json:"id"`
	Data      string    `gorm:"type:text;not null" json:"data"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// Drawing represents a saved drawing
type Drawing struct {
	ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name       string    `gorm:"uniqueIndex;not null" json:"name"`
	Data       string    `gorm:"type:text;not null" json:"data"`
	PreviewImg string    `gorm:"type:text" json:"previewImg,omitempty"`
	CreatedAt  time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// Tool represents a CAM tool
type Tool struct {
	ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name        string    `gorm:"not null" json:"name"`
	Type        string    `gorm:"default:'endmill'" json:"type"`
	Diameter    float64   `gorm:"not null" json:"diameter"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

// CAMSettings stores CAM configuration (singleton)
type CAMSettings struct {
	ID        int64     `gorm:"primaryKey;check:id = 1" json:"id"`
	Data      string    `gorm:"type:text;not null" json:"data"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// MachineConfig stores machine configuration
type MachineConfig struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string    `gorm:"uniqueIndex;not null" json:"name"`
	Type      string    `gorm:"not null" json:"type"` // plotter, laser, router, printer
	Data      string    `gorm:"type:text;not null" json:"data"`
	IsActive  bool      `gorm:"default:false" json:"isActive"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// InitDB initializes the SQLite database with GORM
func InitDB(dbPath string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	// Auto-migrate schema
	err = db.AutoMigrate(
		&AppState{},
		&Drawing{},
		&Tool{},
		&CAMSettings{},
		&MachineConfig{},
	)
	if err != nil {
		return nil, err
	}

	// Initialize singleton records if not exist
	initSingletons(db)

	// Seed default tools if empty
	seedDefaultTools(db)

	// Seed default machines if empty
	seedDefaultMachines(db)

	return db, nil
}

func initSingletons(db *gorm.DB) {
	// AppState singleton
	var appState AppState
	if db.First(&appState).Error != nil {
		db.Create(&AppState{ID: 1, Data: "{}"})
	}

	// CAMSettings singleton
	var camSettings CAMSettings
	if db.First(&camSettings).Error != nil {
		db.Create(&CAMSettings{ID: 1, Data: "{}"})
	}
}

func seedDefaultTools(db *gorm.DB) {
	var count int64
	db.Model(&Tool{}).Count(&count)
	if count > 0 {
		return
	}

	defaultTools := []Tool{
		{Name: "Penna 0.5mm", Type: "pen", Diameter: 0.5, Description: "Penna a sfera standard"},
		{Name: "Endmill 3mm", Type: "endmill", Diameter: 3.0, Description: "Fresa a candela 3mm"},
		{Name: "Endmill 6mm", Type: "endmill", Diameter: 6.0, Description: "Fresa a candela 6mm"},
		{Name: "V-Bit 90°", Type: "vbit", Diameter: 6.0, Description: "Punta a V 90 gradi"},
	}

	for _, tool := range defaultTools {
		db.Create(&tool)
	}
}

func seedDefaultMachines(db *gorm.DB) {
	var count int64
	db.Model(&MachineConfig{}).Count(&count)
	if count > 0 {
		return
	}

	defaultMachines := []MachineConfig{
		{
			Name:     "Pen Plotter A3",
			Type:     "plotter",
			IsActive: true,
			Data: `{
				"dimensions": {"x": 420, "y": 297, "z": 10},
				"speeds": {"rapidXY": 5000, "feedXY": 1000},
				"tool": {"type": "pen", "diameter": 0.5},
				"output": {"format": "plc"}
			}`,
		},
		{
			Name: "Laser 40W",
			Type: "laser",
			Data: `{
				"dimensions": {"x": 600, "y": 400, "z": 0},
				"speeds": {"rapidXY": 10000, "feedXY": 3000},
				"tool": {"type": "laser", "power": 40},
				"output": {"format": "gcode", "postproc": "grbl"}
			}`,
		},
		{
			Name: "CNC Router",
			Type: "router",
			Data: `{
				"dimensions": {"x": 500, "y": 300, "z": 80},
				"speeds": {"rapidXY": 3000, "feedXY": 800, "feedZ": 200, "maxRPM": 24000},
				"tool": {"type": "endmill", "diameter": 6},
				"output": {"format": "gcode", "postproc": "grbl"}
			}`,
		},
		{
			Name: "3D Printer",
			Type: "printer",
			Data: `{
				"dimensions": {"x": 220, "y": 220, "z": 250},
				"speeds": {"rapidXY": 6000, "feedXY": 1500, "feedZ": 300},
				"tool": {"type": "nozzle", "diameter": 0.4, "layerHeight": 0.2},
				"output": {"format": "gcode", "postproc": "marlin"}
			}`,
		},
	}

	for _, machine := range defaultMachines {
		db.Create(&machine)
	}
}
