package handler

import (
	"errors"
	"fmt"
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
	"plotter-pen/internal/service/cam"
)

// camOperations are the operations whose program the PLC output can show.
var camOperations = []string{"pen", "profile", "drill"}

// toolKinds are the kinds of tool the library holds, as the 3D view draws them.
var toolKinds = []string{"pen", "endmill", "ballnose", "vbit", "drill"}

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
	if err := checkCAMParams(&req.CAMParams); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.Model(&persistence.CAMOperation{}).Where("id = 1").Updates(camParamsColumns(req.CAMParams)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// checkCAMParams refuses a choice outside the known ones, for the operation and for every step of
// the job. The kind of tool is only drawn, never cut with: a body that does not carry it gets the
// default rather than being refused, which is why the parameters are taken by pointer.
func checkCAMParams(p *persistence.CAMParams) error {
	if !slices.Contains(camOperations, p.Operation) {
		return fmt.Errorf("operation must be one of %q", camOperations)
	}
	if p.Side != cam.SideOutside && p.Side != cam.SideInside && p.Side != cam.SideOn {
		return fmt.Errorf("side must be %q, %q or %q", cam.SideOutside, cam.SideInside, cam.SideOn)
	}
	if p.ToolType == "" {
		p.ToolType = "endmill"
	}
	if p.DrillType == "" {
		p.DrillType = "drill"
	}
	for name, kind := range map[string]string{"toolType": p.ToolType, "drillType": p.DrillType} {
		if !slices.Contains(toolKinds, kind) {
			return fmt.Errorf("%s must be one of %q", name, toolKinds)
		}
	}
	if p.ToolID < 0 || p.DrillID < 0 {
		return errors.New("toolId and drillId must not be negative, 0 is no tool")
	}
	if p.Direction != cam.CuttingConventional && p.Direction != cam.CuttingClimb {
		return fmt.Errorf("direction must be %q or %q", cam.CuttingConventional, cam.CuttingClimb)
	}
	return nil
}

// camParamsColumns are the parameters as columns. A map, so that false and 0 are written too: a
// struct would leave them to the column defaults.
func camParamsColumns(p persistence.CAMParams) map[string]any {
	return map[string]any{
		"operation":         p.Operation,
		"thickness":         p.Thickness,
		"overcut":           p.Overcut,
		"tool_diameter":     p.ToolDiameter,
		"tool_type":         p.ToolType,
		"tool_id":           p.ToolID,
		"side":              p.Side,
		"direction":         p.Direction,
		"profile_through":   p.ProfileThrough,
		"profile_depth":     p.ProfileDepth,
		"drill_diameter":    p.DrillDiameter,
		"drill_type":        p.DrillType,
		"drill_id":          p.DrillID,
		"min_hole_diameter": p.MinHoleDiameter,
		"max_hole_diameter": p.MaxHoleDiameter,
		"peck_depth":        p.PeckDepth,
		"tip_angle":         p.TipAngle,
		"tip_through":       p.TipThrough,
		"drill_through":     p.DrillThrough,
		"drill_depth":       p.DrillDepth,
	}
}
