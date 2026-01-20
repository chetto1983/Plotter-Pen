package main

import (
	"fmt"
	"log"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"plotter-pen/internal/handler"
	"plotter-pen/internal/middleware"
	"plotter-pen/internal/persistence"
	"plotter-pen/internal/system"
)

func main() {
	// Load configuration from environment
	cfg := system.LoadServerConfig()

	// Set Gin mode
	gin.SetMode(cfg.GinMode)

	// Initialize database with connection pooling
	db, err := persistence.InitDB(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Create Gin router without default middleware
	r := gin.New()

	// Add production middleware
	r.Use(middleware.Recovery())  // Panic recovery
	r.Use(middleware.Logger())    // Structured logging
	r.Use(middleware.CORS())      // CORS headers
	r.Use(middleware.Security())  // Security headers
	r.Use(middleware.RateLimit()) // Rate limiting

	// Health check endpoints (no /api prefix)
	healthHandler := handler.NewHealthHandler(db)
	healthHandler.RegisterRoutes(r)

	// Serve static files with correct MIME types
	staticGroup := r.Group("/")
	staticGroup.Use(middleware.MIMEType())
	staticGroup.Static("/src", cfg.StaticDir+"/src")
	staticGroup.Static("/styles", cfg.StaticDir+"/styles")
	staticGroup.Static("/assets", cfg.StaticDir+"/assets")
	r.StaticFile("/", cfg.StaticDir+"/plotter_pen.html")
	r.StaticFile("/plotter_pen.html", cfg.StaticDir+"/plotter_pen.html")

	// API routes with Gzip compression (70-90% payload reduction)
	api := r.Group("/api")
	api.Use(gzip.Gzip(gzip.BestSpeed))
	registerHandlers(api, db)

	// Find available port
	portCfg := system.PortConfig{
		StartPort: cfg.Port,
		MaxTries:  cfg.MaxPortTries,
	}

	port, err := system.FindAvailablePort(portCfg)
	if err != nil {
		log.Fatalf("Failed to find available port: %v", err)
	}

	// Format server URL
	url := system.FormatServerURL(port, false)
	log.Printf("Starting server on %s", url)

	// Open browser if enabled
	if cfg.OpenBrowser {
		browserCfg := system.BrowserConfig{
			Enabled: true,
			Delay:   cfg.BrowserDelay,
		}
		go system.OpenBrowserWithConfig(url, browserCfg)
	}

	// Start server
	addr := fmt.Sprintf("%s:%d", cfg.Host, port)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// registerHandlers registers all API handlers
func registerHandlers(api *gin.RouterGroup, db *gorm.DB) {
	// Persistence handlers
	persistHandler := handler.NewPersistenceHandler(db)
	persistHandler.RegisterRoutes(api)

	// Machine handlers
	machineHandler := handler.NewMachineHandler(db)
	machineHandler.RegisterRoutes(api)

	// CAM handlers
	camHandler := handler.NewCAMHandler()
	camHandler.RegisterRoutes(api)

	// PLC handlers
	plcHandler := handler.NewPLCHandler()
	plcHandler.RegisterRoutes(api)

	// OPC UA handlers (database-backed config)
	opcuaHandler := handler.NewOpcuaHandler(db)
	opcuaHandler.RegisterRoutes(api)

	// DXF/STL handlers
	dxfHandler := handler.NewDXFHandler()
	dxfHandler.RegisterRoutes(api)
}
