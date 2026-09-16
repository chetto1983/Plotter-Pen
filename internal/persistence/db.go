package persistence

import (
	"log"
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
	ID       int64   `gorm:"primaryKey;autoIncrement" json:"id"`
	Name     string  `gorm:"not null" json:"name"`
	Type     string  `gorm:"default:'pen'" json:"type"`
	Diameter float64 `gorm:"not null" json:"diameter"`
	// The speeds the tool cuts at, in mm/s like V, and how deep it goes in one pass, in mm. 0 is
	// no speed of its own: the operation takes the global one from PLCSimulationSettings.
	Feed        float64   `gorm:"default:0" json:"feed"`
	Plunge      float64   `gorm:"default:0" json:"plunge"`
	StepDown    float64   `gorm:"default:0" json:"stepDown"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

// PLCSimulationSettings stores PLC simulation parameters (singleton). Speeds are in mm/s like V.
// WorkZ is where the pen touches the paper, and the bed under the piece for profiles and drilling.
// StepDown, PlungeSpeed and RampAngle (degrees) are for profile cuts; drilling uses PlungeSpeed
// too, and RetractClearance, the height of its retract plane above the piece. How deep they go
// belongs to the piece, in CAMOperation. The column defaults also fill the row of databases created
// before them; the depth column those databases may still have is no longer read.
type PLCSimulationSettings struct {
	ID               int64     `gorm:"primaryKey;check:id = 1" json:"id"`
	WorkSpeed        float64   `gorm:"default:100" json:"workSpeed"`
	RapidSpeed       float64   `gorm:"default:1000" json:"rapidSpeed"`
	SafeZ            float64   `gorm:"default:5" json:"safeZ"`
	WorkZ            float64   `gorm:"default:0" json:"workZ"`
	WaitTime         int       `gorm:"default:0" json:"waitTime"`
	StepDown         float64   `gorm:"default:0.5" json:"stepDown"`
	PlungeSpeed      float64   `gorm:"default:5" json:"plungeSpeed"`
	RampAngle        float64   `gorm:"default:3" json:"rampAngle"`
	RetractClearance float64   `gorm:"default:1" json:"retractClearance"`
	UpdatedAt        time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// CAMParams are the parameters of one operation: Operation is "pen", "profile" or "drill", with the
// piece both cut and the parameters of the profile and of the drilling. Each cuts through the piece,
// Overcut into the bed, or goes its depth below the top of the piece. The PLC never receives the
// diameters, so they live apart from PLCSimulationSettings. Embedded, they keep their own column
// names, so the operation and the steps of the job share them.
//
// The column defaults fill the rows of older databases; they also replace a zero value on Create,
// so rows are written from a map (a false or a 0 is a choice here, not a missing value).
type CAMParams struct {
	Operation    string  `gorm:"default:'pen'" json:"operation"`
	Thickness    float64 `gorm:"default:1.6" json:"thickness"`
	Overcut      float64 `gorm:"default:0.2" json:"overcut"`
	ToolDiameter float64 `gorm:"default:2" json:"toolDiameter"`
	// ToolType and DrillType are the kind of tool chosen in the library, so the 3D view can draw
	// the tool that is cutting; the program does not depend on them.
	ToolType string `gorm:"default:'endmill'" json:"toolType"`
	// ToolID and DrillID are the tools of the library the profile and the drilling were given, 0
	// when none was: the operation reads their speeds, and a tool deleted since falls back on the
	// global ones.
	ToolID          int64   `gorm:"default:0" json:"toolId"`
	Side            string  `gorm:"default:'outside'" json:"side"`
	Direction       string  `gorm:"default:'conventional'" json:"direction"`
	ProfileThrough  bool    `gorm:"default:true" json:"profileThrough"`
	ProfileDepth    float64 `gorm:"default:1" json:"profileDepth"`
	DrillDiameter   float64 `gorm:"default:1" json:"drillDiameter"`
	DrillType       string  `gorm:"default:'drill'" json:"drillType"`
	DrillID         int64   `gorm:"default:0" json:"drillId"`
	MinHoleDiameter float64 `gorm:"default:0.4" json:"minHoleDiameter"`
	MaxHoleDiameter float64 `gorm:"default:1.2" json:"maxHoleDiameter"`
	PeckDepth       float64 `gorm:"default:0" json:"peckDepth"`
	TipAngle        float64 `gorm:"default:118" json:"tipAngle"`
	TipThrough      bool    `gorm:"default:false" json:"tipThrough"`
	DrillThrough    bool    `gorm:"default:true" json:"drillThrough"`
	DrillDepth      float64 `gorm:"default:1" json:"drillDepth"`
}

// CAMOperation stores the operation whose program the PLC output shows (singleton).
type CAMOperation struct {
	ID int64 `gorm:"primaryKey;check:id = 1" json:"id"`
	CAMParams
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

// JobStep is one step of the job: an operation with its tool and parameters, on one layer of the
// drawing. The job is the list of the steps in Position order; there is one, for the drawing on
// screen, and a save replaces it whole, so neither the row id nor the position is part of the
// JSON — the order of the list is the position.
type JobStep struct {
	ID       int64 `gorm:"primaryKey;autoIncrement" json:"-"`
	Position int   `gorm:"not null;index" json:"-"`
	// Layer is the id of the layer the step works on — for a DXF, the name of its layer — and
	// empty for the whole drawing.
	Layer string `gorm:"not null;default:''" json:"layer"`
	CAMParams
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
		&CAMOperation{},
		&JobStep{},
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
		if err := db.Create(&AppState{ID: 1, Data: "{}"}).Error; err != nil {
			log.Printf("Failed to create AppState singleton: %v", err)
		}
	}

	// PLCSimulationSettings singleton with defaults
	var plcSettings PLCSimulationSettings
	if db.First(&plcSettings).Error != nil {
		if err := db.Create(&PLCSimulationSettings{
			ID:               1,
			WorkSpeed:        100,
			RapidSpeed:       1000,
			SafeZ:            5,
			WorkZ:            0,
			WaitTime:         0,
			StepDown:         0.5,
			PlungeSpeed:      5,
			RampAngle:        3,
			RetractClearance: 1,
		}).Error; err != nil {
			log.Printf("Failed to create PLCSimulationSettings singleton: %v", err)
		}
	}

	// CAMOperation singleton: the pen, with usable profile and drilling parameters
	var camOperation CAMOperation
	if db.First(&camOperation).Error != nil {
		if err := db.Create(&CAMOperation{
			ID:              1,
			Operation:       "pen",
			Thickness:       1.6,
			Overcut:         0.2,
			ToolDiameter:    2,
			ToolType:        "endmill",
			Side:            "outside",
			Direction:       "conventional",
			ProfileThrough:  true,
			ProfileDepth:    1,
			DrillDiameter:   1,
			DrillType:       "drill",
			MinHoleDiameter: 0.4,
			MaxHoleDiameter: 1.2,
			TipAngle:        118,
			DrillThrough:    true,
			DrillDepth:      1,
		}).Error; err != nil {
			log.Printf("Failed to create CAMOperation singleton: %v", err)
		}
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
		if err := db.Create(&tool).Error; err != nil {
			log.Printf("Failed to seed tool %s: %v", tool.Name, err)
		}
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
		if err := db.Create(&machine).Error; err != nil {
			log.Printf("Failed to seed machine %s: %v", machine.Name, err)
		}
	}
}

func seedOPCUAConfig(db *gorm.DB) {
	var count int64
	db.Model(&OPCUAConfig{}).Count(&count)
	if count > 0 {
		return // Already has configs
	}

	// Default config with the nodes addressed by the names of the PLC variables, as read from
	// the machine: the app resolves them on the server it is connected to, so the same
	// configuration fits the PLC and the simulator whatever numbers they give their nodes.
	defaultCfg := OPCUAConfig{
		Name:                 "Siemens S7-1500 Default",
		IsActive:             true,
		Endpoint:             "opc.tcp://192.168.0.1:4840",
		NamespaceID:          4,
		TriggerNode:          "ServerInterfaces/Com/TriggerWrite",
		ResetNode:            "ServerInterfaces/Com/TriggerWrite",
		DataNode:             "ServerInterfaces/Com/Point",
		DataType:             "string_array",
		PositionXNode:        "ServerInterfaces/Com/Pos/X",
		PositionYNode:        "ServerInterfaces/Com/Pos/Y",
		PositionZNode:        "ServerInterfaces/Com/Pos/Z",
		PointArrayNode:       "ServerInterfaces/Com/Point",
		TriggerWriteNode:     "ServerInterfaces/Com/TriggerWrite",
		ReadDoneNode:         "ServerInterfaces/Com/ReadDone",
		EndOfFileNode:        "ServerInterfaces/Com/EndOfFile",
		ChunkSize:            20,
		AckTimeout:           5000,
		PollInterval:         100,
		SubscriptionInterval: 100,
		SecurityMode:         "SignAndEncrypt",
		SecurityPolicy:       "Basic256Sha256",
	}
	if err := db.Create(&defaultCfg).Error; err != nil {
		log.Printf("Failed to seed OPC UA config: %v", err)
	}
}
