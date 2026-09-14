package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/service/cam"
)

// CAMHandler handles the machining endpoints.
type CAMHandler struct{}

// NewCAMHandler creates a new CAM handler
func NewCAMHandler() *CAMHandler {
	return &CAMHandler{}
}

// RegisterRoutes registers CAM routes
func (h *CAMHandler) RegisterRoutes(rg *gin.RouterGroup) {
	g := rg.Group("/cam")
	g.POST("/profile", h.Profile)
}

// Profile handles POST /api/cam/profile: the PLC program of a profile cut, in the response shape
// of /api/plc/extract. A drawing or settings that cannot be cut is a bad request.
func (h *CAMHandler) Profile(c *gin.Context) {
	var req cam.ProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := cam.Profile(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
