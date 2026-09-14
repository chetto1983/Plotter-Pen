package handler

import (
	"fmt"
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
	"plotter-pen/internal/service/cam"
)

// camOperations are the operations whose program the PLC output can show.
var camOperations = []string{"pen", "profile", "drill"}

// GetCAMOperation handles GET /api/cam/operation: the operation shown in the PLC output and the
// parameters of the profile and of the drilling.
func (h *PersistenceHandler) GetCAMOperation(c *gin.Context) {
	var op persistence.CAMOperation
	if err := h.db.First(&op).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": op})
}

// SaveCAMOperation handles POST /api/cam/operation. Only the choices are checked here: the numbers
// are checked when the program is generated, where the PLC output shows the error.
func (h *PersistenceHandler) SaveCAMOperation(c *gin.Context) {
	var req persistence.CAMOperation
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !slices.Contains(camOperations, req.Operation) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("operation must be one of %q", camOperations)})
		return
	}
	if req.Side != cam.SideOutside && req.Side != cam.SideInside {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("side must be %q or %q", cam.SideOutside, cam.SideInside)})
		return
	}
	if req.Direction != cam.CuttingConventional && req.Direction != cam.CuttingClimb {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("direction must be %q or %q", cam.CuttingConventional, cam.CuttingClimb)})
		return
	}

	// a map, so that false and 0 are written too
	updates := map[string]any{
		"operation":         req.Operation,
		"tool_diameter":     req.ToolDiameter,
		"side":              req.Side,
		"direction":         req.Direction,
		"drill_diameter":    req.DrillDiameter,
		"min_hole_diameter": req.MinHoleDiameter,
		"max_hole_diameter": req.MaxHoleDiameter,
		"peck_depth":        req.PeckDepth,
		"tip_angle":         req.TipAngle,
		"tip_through":       req.TipThrough,
	}
	if err := h.db.Model(&persistence.CAMOperation{}).Where("id = 1").Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
