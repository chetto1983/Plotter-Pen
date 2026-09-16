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
// Extracts PLC commands using 3D interpolation with Z coordinates and WAITs.
func (h *PLCHandler) Extract(c *gin.Context) {
	var req plc.ExtractRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	extractor := plc.NewExtractor(req)
	result := extractor.Extract(req.Primitives)

	c.JSON(http.StatusOK, result)
}
