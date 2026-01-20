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

// Tool represents a drawing tool (pen, marker, etc.)
type Tool struct {
	ID          int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name        string    `gorm:"not null" json:"name"`
	Type        string    `gorm:"default:'pen'" json:"type"`
	Diameter    float64   `gorm:"not null" json:"diameter"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

// PLCSimulationSettings stores PLC simulation parameters (singleton)
type PLCSimulationSettings struct {
	ID         int64     `gorm:"primaryKey;check:id = 1" json:"id"`
	WorkSpeed  float64   `gorm:"default:100" json:"workSpeed"`
	RapidSpeed float64   `gorm:"default:1000" json:"rapidSpeed"`
	SafeZ      float64   `gorm:"default:5" json:"safeZ"`
	WorkZ      float64   `gorm:"default:0" json:"workZ"`
	WaitTime   int       `gorm:"default:0" json:"waitTime"`
	UpdatedAt  time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
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

// OPCUAConfig stores OPC UA connection settings (supports multiple PLCs)
type OPCUAConfig struct {
	ID                   int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	Name                 string    `gorm:"uniqueIndex;not null" json:"name"`
	IsActive             bool      `gorm:"default:false" json:"isActive"`
	Endpoint             string    `gorm:"not null" json:"endpoint"`
	NamespaceID          int       `gorm:"default:2" json:"namespaceId"`
	TriggerNode          string    `json:"triggerNode"`
	ResetNode            string    `json:"resetNode"`
	DataNode             string    `json:"dataNode"`
	DataType             string    `gorm:"default:'string_array'" json:"dataType"`
	PositionXNode        string    `json:"positionXNode"`
	PositionYNode        string    `json:"positionYNode"`
	PositionZNode        string    `json:"positionZNode"`
	StatusNode           string    `json:"statusNode"`
	AlarmNode            string    `json:"alarmNode"`
	ProgressNode         string    `json:"progressNode"`
	PointArrayNode       string    `json:"pointArrayNode"`
	TriggerWriteNode     string    `json:"triggerWriteNode"`
	ReadDoneNode         string    `json:"readDoneNode"`
	EndOfFileNode        string    `json:"endOfFileNode"`
	ChunkSize            int       `gorm:"default:20" json:"chunkSize"`
	AckTimeout           int       `gorm:"default:5000" json:"ackTimeout"`
	PollInterval         int       `gorm:"default:100" json:"pollInterval"`
	SubscriptionInterval int       `gorm:"default:100" json:"subscriptionInterval"`
	SecurityMode         string    `gorm:"default:'None'" json:"securityMode"`
	SecurityPolicy       string    `gorm:"default:'None'" json:"securityPolicy"`
	CertFile             string    `json:"certFile"`
	KeyFile              string    `json:"keyFile"`
	ServerCertFile       string    `json:"serverCertFile"`
	Username             string    `json:"username"`
	Password             string    `json:"password"`
	UpdatedAt            time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// DBConfig holds database configuration
type DBConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// DefaultDBConfig returns default database configuration
func DefaultDBConfig() DBConfig {
	return DBConfig{
		MaxOpenConns:    25,
		MaxIdleConns:    5,
		ConnMaxLifetime: 5 * time.Minute,
		ConnMaxIdleTime: 5 * time.Minute,
	}
}

// InitDB initializes the SQLite database with GORM
func InitDB(dbPath string) (*gorm.DB, error) {
	return InitDBWithConfig(dbPath, DefaultDBConfig())
}

// InitDBWithConfig initializes the database with custom configuration
func InitDBWithConfig(dbPath string, cfg DBConfig) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	// Configure connection pool
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(cfg.ConnMaxIdleTime)

	// Auto-migrate schema
	err = db.AutoMigrate(
		&AppState{},
		&Drawing{},
		&Tool{},
		&PLCSimulationSettings{},
		&MachineConfig{},
		&OPCUAConfig{},
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

	// Seed OPC UA config if not exists
	seedOPCUAConfig(db)

	return db, nil
}

func initSingletons(db *gorm.DB) {
	// AppState singleton
	var appState AppState
	if db.First(&appState).Error != nil {
		db.Create(&AppState{ID: 1, Data: "{}"})
	}

	// PLCSimulationSettings singleton with defaults
	var plcSettings PLCSimulationSettings
	if db.First(&plcSettings).Error != nil {
		db.Create(&PLCSimulationSettings{
			ID:         1,
			WorkSpeed:  100,
			RapidSpeed: 1000,
			SafeZ:      5,
			WorkZ:      0,
			WaitTime:   0,
		})
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

func seedOPCUAConfig(db *gorm.DB) {
	var count int64
	db.Model(&OPCUAConfig{}).Count(&count)
	if count > 0 {
		return // Already has configs
	}

	// Default config with correct namespace (ns=4) from OPC Ua Interface.xml
	// XML NodeIDs: TriggerWrite=12, ReadDone=23, EOF=34, PointArr=93, Pos.X=80, Pos.Y=81, Pos.Z=82
	defaultCfg := OPCUAConfig{
		Name:                 "Siemens S7-1500 Default",
		IsActive:             true,
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
	db.Create(&defaultCfg)
}
