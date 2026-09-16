package handler

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Default directories for certificate storage
const (
	DefaultCertsDir = "certs"
)

// OpcuaHandler handles OPC UA communication endpoints
type OpcuaHandler struct {
	configMgr *opcua.ConfigManager
	client    opcua.OPCUAClient
	// newClient builds the throwaway client TestConnection tries a configuration with,
	// so a test never touches the connection the app is working on.
	newClient func(cfg opcua.Config) opcua.OPCUAClient
}

// clientForConfig is the newClient of a handler that talks to a real server.
func clientForConfig(cfg opcua.Config) opcua.OPCUAClient {
	return opcua.NewClient(opcua.NewConfigManagerFor(cfg))
}

// NewOpcuaHandler creates a new OPC UA handler with database backing
func NewOpcuaHandler(db *gorm.DB) *OpcuaHandler {
	configMgr := opcua.NewConfigManager(db)
	client := opcua.NewClient(configMgr)

	return &OpcuaHandler{
		configMgr: configMgr,
		client:    client,
		newClient: clientForConfig,
	}
}

// NewOpcuaHandlerWithClient creates a handler with a custom client (for testing)
func NewOpcuaHandlerWithClient(db *gorm.DB, client opcua.OPCUAClient) *OpcuaHandler {
	configMgr := opcua.NewConfigManager(db)
	return &OpcuaHandler{
		configMgr: configMgr,
		client:    client,
		newClient: clientForConfig,
	}
}

// RegisterRoutes registers OPC UA routes
func (h *OpcuaHandler) RegisterRoutes(r *gin.RouterGroup) {
	opcuaGroup := r.Group("/opcua")
	{
		// Active config (current PLC)
		opcuaGroup.GET("/config", h.GetConfig)
		opcuaGroup.PUT("/config", h.UpdateConfig)

		// Multi-PLC management
		opcuaGroup.GET("/plcs", h.ListPLCs)
		opcuaGroup.POST("/plcs", h.CreatePLC)
		opcuaGroup.GET("/plcs/:id", h.GetPLC)
		opcuaGroup.DELETE("/plcs/:id", h.DeletePLC)
		opcuaGroup.POST("/plcs/:id/activate", h.ActivatePLC)

		// Certificate management
		opcuaGroup.POST("/certificates/generate", h.GenerateCertificate)
		opcuaGroup.GET("/certificates/status", h.CertificateStatus)
		opcuaGroup.GET("/certificates/download/:type", h.DownloadCertificate)

		// Connection
		opcuaGroup.POST("/send", h.Send)
		opcuaGroup.GET("/status", h.Status)
		opcuaGroup.POST("/connect", h.Connect)
		opcuaGroup.POST("/disconnect", h.Disconnect)
		opcuaGroup.GET("/position", h.GetPosition)
		opcuaGroup.GET("/variables", h.Variables)
		opcuaGroup.POST("/test", h.TestConnection)
		opcuaGroup.GET("/machine-status", h.GetMachineStatus)
		opcuaGroup.GET("/ws", h.WebSocket) // Real-time WebSocket endpoint
	}
}

// GetConfig returns current OPC UA configuration
func (h *OpcuaHandler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": h.configMgr.Get()})
}

// UpdateConfig updates OPC UA configuration
func (h *OpcuaHandler) UpdateConfig(c *gin.Context) {
	var req opcua.Config
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.configMgr.Update(req)

	if err := h.configMgr.SaveToDB(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save config"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": h.configMgr.Get()})
}

// SendRequest represents data to send to PLC
type SendRequest struct {
	Data     any           `json:"data" binding:"required"`
	Config   *opcua.Config `json:"config,omitempty"` // Per-request override
	DataType string        `json:"dataType,omitempty"`
}

// Send sends data to PLC via OPC UA
func (h *OpcuaHandler) Send(c *gin.Context) {
	var req SendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Merge config: stored config <- request override
	cfg := h.configMgr.Merge(req.Config)
	if req.DataType != "" {
		cfg.DataType = req.DataType
	}

	// Auto-connect if not connected
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if !h.client.IsConnected() {
		if err := h.client.Connect(ctx); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "failed to connect to OPC UA server",
				"details": err.Error(),
			})
			return
		}
	}

	// Send data with trigger
	if err := h.client.SendWithTrigger(ctx, req.Data, cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to send data",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"endpoint": cfg.Endpoint,
		"dataNode": cfg.DataNode,
		"message":  "Data sent successfully",
	})
}

// Connect establishes OPC UA connection
func (h *OpcuaHandler) Connect(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := h.client.Connect(ctx); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":   "failed to connect",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"connected": true,
		"endpoint":  h.configMgr.Get().Endpoint,
	})
}

// Disconnect closes OPC UA connection
func (h *OpcuaHandler) Disconnect(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	h.client.StopPositionPolling()

	if err := h.client.Disconnect(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to disconnect",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"connected": false})
}

// Status returns OPC UA connection status
func (h *OpcuaHandler) Status(c *gin.Context) {
	cfg := h.configMgr.Get()
	c.JSON(http.StatusOK, gin.H{
		"connected": h.client.IsConnected(),
		"endpoint":  cfg.Endpoint,
	})
}

// GetPosition returns current machine position
func (h *OpcuaHandler) GetPosition(c *gin.Context) {
	if !h.client.IsConnected() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "not connected to OPC UA server",
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	pos, err := h.client.ReadPosition(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to read position",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, pos)
}

// GetMachineStatus returns complete machine status
func (h *OpcuaHandler) GetMachineStatus(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	status := h.client.GetMachineStatus(ctx)
	c.JSON(http.StatusOK, status)
}

// ListPLCs returns all PLC configurations
func (h *OpcuaHandler) ListPLCs(c *gin.Context) {
	configs, err := h.configMgr.ListAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": configs})
}

// CreatePLC creates a new PLC configuration
func (h *OpcuaHandler) CreatePLC(c *gin.Context) {
	var req opcua.Config
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" || req.Endpoint == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and endpoint are required"})
		return
	}
	created, err := h.configMgr.Create(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"data": created})
}

// GetPLC returns a specific PLC configuration
func (h *OpcuaHandler) GetPLC(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	cfg, err := h.configMgr.GetByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "PLC not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cfg})
}

// DeletePLC deletes a PLC configuration
func (h *OpcuaHandler) DeletePLC(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.configMgr.Delete(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete active PLC"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ActivatePLC sets a PLC as the active configuration
func (h *OpcuaHandler) ActivatePLC(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	// Disconnect current PLC before switching
	if h.client.IsConnected() {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		if err := h.client.Disconnect(ctx); err != nil {
			log.Printf("Warning: failed to disconnect previous PLC: %v", err)
		}
		cancel()
	}
	if err := h.configMgr.SetActive(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": h.configMgr.Get()})
}

// CertRequest represents certificate generation request
type CertRequest struct {
	// OutputDir defaults to certs and must remain within that directory.
	OutputDir string `json:"outputDir"`
}

// GenerateCertificate generates OPC UA client certificates
func (h *OpcuaHandler) GenerateCertificate(c *gin.Context) {
	var req CertRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.OutputDir = DefaultCertsDir
	}
	if req.OutputDir == "" {
		req.OutputDir = DefaultCertsDir
	}
	dir, err := filepath.Rel(DefaultCertsDir, req.OutputDir)
	if err != nil || !filepath.IsLocal(dir) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "outputDir must be within certs"})
		return
	}
	if err := os.MkdirAll(DefaultCertsDir, 0700); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	root, err := os.OpenRoot(DefaultCertsDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer func() {
		if err := root.Close(); err != nil {
			log.Printf("Failed to close certificate directory: %v", err)
		}
	}()
	certPath := req.OutputDir + "/client.pem"
	keyPath := req.OutputDir + "/client.key"
	if err := opcua.GenerateAndSaveCertInDir(root, dir); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"certFile": certPath,
		"keyFile":  keyPath,
		"derFile":  req.OutputDir + "/client.der",
		"message":  "Certificates generated. Import .der file to PLC trust list.",
	})
}

// CertificateStatus checks if certificates exist
func (h *OpcuaHandler) CertificateStatus(c *gin.Context) {
	certDir := DefaultCertsDir
	pemPath := certDir + "/client.pem"
	keyPath := certDir + "/client.key"
	derPath := certDir + "/client.der"

	pemExists := fileExists(pemPath)
	keyExists := fileExists(keyPath)
	derExists := fileExists(derPath)

	c.JSON(http.StatusOK, gin.H{
		"exists": pemExists && keyExists && derExists,
		"pem":    pemExists,
		"key":    keyExists,
		"der":    derExists,
	})
}

// DownloadCertificate serves certificate files for download
func (h *OpcuaHandler) DownloadCertificate(c *gin.Context) {
	certType := c.Param("type")
	certDir := "certs"

	var filePath, filename, contentType string
	switch certType {
	case "pem":
		filePath = certDir + "/client.pem"
		filename = "client.pem"
		contentType = "application/x-pem-file"
	case "key":
		filePath = certDir + "/client.key"
		filename = "client.key"
		contentType = "application/x-pem-file"
	case "der":
		filePath = certDir + "/client.der"
		filename = "client.der"
		contentType = "application/x-x509-ca-cert"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid certificate type"})
		return
	}

	if !fileExists(filePath) {
		c.JSON(http.StatusNotFound, gin.H{"error": "certificate not found"})
		return
	}

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", contentType)
	c.File(filePath)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// Variables lists the variables the connected PLC exposes under its server interfaces, so the
// settings window can offer them. It never opens a connection by itself: a window that is
// merely looking at a configuration must not reach for the machine.
func (h *OpcuaHandler) Variables(c *gin.Context) {
	if !h.client.IsConnected() {
		c.JSON(http.StatusOK, gin.H{"connected": false, "variables": []opcua.NodeVariable{}})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	variables, err := h.client.Variables(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"connected": true, "variables": []opcua.NodeVariable{}, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"connected": true, "endpoint": h.configMgr.Get().Endpoint, "variables": variables})
}

// TestConnection tries the configuration in the request, the one the settings window has on
// screen and has not saved yet, and lists what it finds. A failed connection is the answer to
// the question asked, not a server error, so it comes back with 200 and a message.
func (h *OpcuaHandler) TestConnection(c *gin.Context) {
	cfg := h.configMgr.Get()
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&cfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	client := h.newClient(cfg)
	if err := client.Connect(ctx); err != nil {
		c.JSON(http.StatusOK, gin.H{"connected": false, "endpoint": cfg.Endpoint, "variables": []opcua.NodeVariable{}, "error": err.Error()})
		return
	}
	defer func() {
		if err := client.Disconnect(context.Background()); err != nil {
			log.Printf("OPC UA: closing the test connection to %s: %v", cfg.Endpoint, err)
		}
	}()

	variables, err := client.Variables(ctx)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"connected": true, "endpoint": cfg.Endpoint, "variables": []opcua.NodeVariable{}, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"connected": true, "endpoint": cfg.Endpoint, "variables": variables})
}
