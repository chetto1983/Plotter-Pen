package handler

import (
	"context"
	"net/http"
	"time"

	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
)

// OpcuaHandler handles OPC UA communication endpoints
type OpcuaHandler struct {
	configMgr *opcua.ConfigManager
	client    *opcua.Client
}

// NewOpcuaHandler creates a new OPC UA handler
func NewOpcuaHandler() *OpcuaHandler {
	configMgr := opcua.NewConfigManager("opcua_config.json")
	client := opcua.NewClient(configMgr)

	return &OpcuaHandler{
		configMgr: configMgr,
		client:    client,
	}
}

// RegisterRoutes registers OPC UA routes
func (h *OpcuaHandler) RegisterRoutes(r *gin.RouterGroup) {
	opcuaGroup := r.Group("/opcua")
	{
		opcuaGroup.GET("/config", h.GetConfig)
		opcuaGroup.PUT("/config", h.UpdateConfig)
		opcuaGroup.POST("/send", h.Send)
		opcuaGroup.GET("/status", h.Status)
		opcuaGroup.POST("/connect", h.Connect)
		opcuaGroup.POST("/disconnect", h.Disconnect)
		opcuaGroup.GET("/position", h.GetPosition)
		opcuaGroup.GET("/machine-status", h.GetMachineStatus)
		opcuaGroup.GET("/ws", h.WebSocket) // Real-time WebSocket endpoint
	}
}

// GetConfig returns current OPC UA configuration
func (h *OpcuaHandler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, h.configMgr.Get())
}

// UpdateConfig updates OPC UA configuration
func (h *OpcuaHandler) UpdateConfig(c *gin.Context) {
	var req opcua.Config
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.configMgr.Update(req)

	if err := h.configMgr.SaveToFile(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save config"})
		return
	}

	c.JSON(http.StatusOK, h.configMgr.Get())
}

// SendRequest represents data to send to PLC
type SendRequest struct {
	Data     interface{}   `json:"data" binding:"required"`
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
