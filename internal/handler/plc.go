package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/service/plc"
)

// PLCHandler handles PLC extraction endpoints
type PLCHandler struct{}

// NewPLCHandler creates a new PLC handler
func NewPLCHandler() *PLCHandler {
	return &PLCHandler{}
}

// RegisterRoutes registers PLC routes
func (h *PLCHandler) RegisterRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/plc")
	g.POST("/extract", h.Extract)
}

// Extract handles POST /api/plc/extract
// Extracts PLC commands from primitives using 3D interpolation format
func (h *PLCHandler) Extract(c *gin.Context) {
	var req plc.ExtractRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	extractor := plc.NewExtractor(req)
	result := extractor.Extract(req.Primitives)

	c.JSON(http.StatusOK, result)
}
