package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"plotter-pen/internal/i18n"
	"plotter-pen/internal/persistence"
)

// PersistenceHandler handles state and drawing CRUD operations
type PersistenceHandler struct {
	db *gorm.DB
}

// NewPersistenceHandler creates a new persistence handler
func NewPersistenceHandler(db *gorm.DB) *PersistenceHandler {
	return &PersistenceHandler{db: db}
}

// RegisterRoutes registers persistence routes
func (h *PersistenceHandler) RegisterRoutes(r *gin.RouterGroup) {
	// App State
	r.GET("/state", h.GetState)
	r.POST("/state", h.SaveState)

	// Drawings
	r.GET("/drawings", h.ListDrawings)
	r.GET("/drawings/:id", h.GetDrawing)
	r.POST("/drawings", h.CreateDrawing)
	r.PUT("/drawings/:id", h.UpdateDrawing)
	r.DELETE("/drawings/:id", h.DeleteDrawing)

	// Tools
	r.GET("/tools", h.ListTools)
	r.POST("/tools", h.CreateTool)
	r.PUT("/tools/:id", h.UpdateTool)
	r.DELETE("/tools/:id", h.DeleteTool)

	// PLC Simulation Settings
	r.GET("/plc/settings", h.GetPLCSimSettings)
	r.POST("/plc/settings", h.SavePLCSimSettings)

	// Operation shown in the PLC output (cam_operation.go)
	r.GET("/cam/operation", h.GetCAMOperation)
	r.POST("/cam/operation", h.SaveCAMOperation)

	// The job: the steps cut one after the other (cam_job.go)
	r.GET("/cam/job", h.GetCAMJob)
	r.POST("/cam/job", h.SaveCAMJob)
}

// === App State ===

// GetState returns the autosaved drawing state.
func (h *PersistenceHandler) GetState(c *gin.Context) {
	var state persistence.AppState
	if err := h.db.First(&state).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to load the state: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": state.Data})
}

// SaveState replaces the autosaved drawing state.
func (h *PersistenceHandler) SaveState(c *gin.Context) {
	var req struct {
		Data string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	if err := h.db.Model(&persistence.AppState{}).Where("id = 1").Update("data", req.Data).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to save the state: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === Drawings ===

// ListDrawings returns saved drawings, most recently updated first.
func (h *PersistenceHandler) ListDrawings(c *gin.Context) {
	var drawings []persistence.Drawing
	if err := h.db.Order("updated_at DESC").Find(&drawings).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to list the drawings: %w", err))
		return
	}
	c.JSON(http.StatusOK, drawings)
}

// GetDrawing returns the drawing with the requested ID.
func (h *PersistenceHandler) GetDrawing(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, i18n.Errorf("invalid id"))
		return
	}

	var drawing persistence.Drawing
	if err := h.db.First(&drawing, id).Error; err != nil {
		respondError(c, http.StatusNotFound, i18n.Errorf("drawing not found"))
		return
	}
	c.JSON(http.StatusOK, drawing)
}

// CreateDrawing saves a new named drawing.
func (h *PersistenceHandler) CreateDrawing(c *gin.Context) {
	var req struct {
		Name       string `json:"name" binding:"required"`
		Data       string `json:"data" binding:"required"`
		PreviewImg string `json:"previewImg"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	drawing := persistence.Drawing{
		Name:       req.Name,
		Data:       req.Data,
		PreviewImg: req.PreviewImg,
	}

	if err := h.db.Create(&drawing).Error; err != nil {
		respondError(c, http.StatusInternalServerError, drawingSaveError(req.Name, err))
		return
	}
	c.JSON(http.StatusCreated, drawing)
}

// UpdateDrawing updates the nonempty fields of a saved drawing.
func (h *PersistenceHandler) UpdateDrawing(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, i18n.Errorf("invalid id"))
		return
	}

	var req struct {
		Name       string `json:"name"`
		Data       string `json:"data"`
		PreviewImg string `json:"previewImg"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	updates := map[string]any{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Data != "" {
		updates["data"] = req.Data
	}
	if req.PreviewImg != "" {
		updates["preview_img"] = req.PreviewImg
	}

	if err := h.db.Model(&persistence.Drawing{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, drawingSaveError(req.Name, err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteDrawing deletes the drawing with the requested ID.
func (h *PersistenceHandler) DeleteDrawing(c *gin.Context) {
	h.deleteRecord(c, &persistence.Drawing{})
}

// drawingSaveError says a name already taken as such: the name of a drawing is unique, and the
// database error names only the column.
func drawingSaveError(name string, err error) error {
	if strings.Contains(err.Error(), "UNIQUE constraint failed") {
		return i18n.Errorf("a drawing named %q already exists", name)
	}
	return i18n.Errorf("failed to save the drawing: %w", err)
}

// === Tools ===

// ListTools returns the tool library.
func (h *PersistenceHandler) ListTools(c *gin.Context) {
	var tools []persistence.Tool
	if err := h.db.Find(&tools).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to list the tools: %w", err))
		return
	}
	c.JSON(http.StatusOK, tools)
}

// CreateTool adds a tool to the library.
func (h *PersistenceHandler) CreateTool(c *gin.Context) {
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Type        string  `json:"type"`
		Diameter    float64 `json:"diameter" binding:"required"`
		Feed        float64 `json:"feed"`
		Plunge      float64 `json:"plunge"`
		StepDown    float64 `json:"stepDown"`
		Description string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}
	if err := checkToolSpeeds(&req.Feed, &req.Plunge, &req.StepDown); err != nil {
		respondError(c, http.StatusBadRequest, err)
		return
	}

	tool := persistence.Tool{
		Name:        req.Name,
		Type:        req.Type,
		Diameter:    req.Diameter,
		Feed:        req.Feed,
		Plunge:      req.Plunge,
		StepDown:    req.StepDown,
		Description: req.Description,
	}
	if tool.Type == "" {
		tool.Type = "endmill"
	}

	if err := h.db.Create(&tool).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to save the tool: %w", err))
		return
	}
	c.JSON(http.StatusCreated, tool)
}

// checkToolSpeeds refuses a negative speed or step-down; a missing one (nil) is fine, and so is
// 0, which means the global setting.
func checkToolSpeeds(feed, plunge, stepDown *float64) error {
	switch {
	case feed != nil && *feed < 0:
		return i18n.Errorf("feed must not be negative, 0 takes the global setting")
	case plunge != nil && *plunge < 0:
		return i18n.Errorf("plunge must not be negative, 0 takes the global setting")
	case stepDown != nil && *stepDown < 0:
		return i18n.Errorf("stepDown must not be negative, 0 takes the global setting")
	}
	return nil
}

// UpdateTool updates the supplied nonempty fields and positive diameter of a tool, and every speed
// the request carries, 0 included.
func (h *PersistenceHandler) UpdateTool(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, i18n.Errorf("invalid id"))
		return
	}

	// The speeds are pointers: 0 is a value here, the way back to the global speed, and must be
	// told apart from a field the request does not carry.
	var req struct {
		Name        string   `json:"name"`
		Type        string   `json:"type"`
		Diameter    float64  `json:"diameter"`
		Feed        *float64 `json:"feed"`
		Plunge      *float64 `json:"plunge"`
		StepDown    *float64 `json:"stepDown"`
		Description string   `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}
	if err := checkToolSpeeds(req.Feed, req.Plunge, req.StepDown); err != nil {
		respondError(c, http.StatusBadRequest, err)
		return
	}

	updates := map[string]any{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Type != "" {
		updates["type"] = req.Type
	}
	if req.Diameter > 0 {
		updates["diameter"] = req.Diameter
	}
	if req.Description != "" {
		updates["description"] = req.Description
	}
	for column, speed := range map[string]*float64{"feed": req.Feed, "plunge": req.Plunge, "step_down": req.StepDown} {
		if speed != nil {
			updates[column] = *speed
		}
	}

	if err := h.db.Model(&persistence.Tool{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to save the tool: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteTool deletes the tool with the requested ID.
func (h *PersistenceHandler) DeleteTool(c *gin.Context) {
	h.deleteRecord(c, &persistence.Tool{})
}

func (h *PersistenceHandler) deleteRecord(c *gin.Context, model any) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		respondError(c, http.StatusBadRequest, i18n.Errorf("invalid id"))
		return
	}

	if err := h.db.Delete(model, id).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to delete: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === PLC Simulation Settings ===

// GetPLCSimSettings returns the stored PLC simulation settings.
func (h *PersistenceHandler) GetPLCSimSettings(c *gin.Context) {
	var settings persistence.PLCSimulationSettings
	if err := h.db.First(&settings).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to load the PLC settings: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": settings})
}

// SavePLCSimSettings replaces the stored PLC simulation settings.
func (h *PersistenceHandler) SavePLCSimSettings(c *gin.Context) {
	var req struct {
		WorkSpeed        float64 `json:"workSpeed"`
		RapidSpeed       float64 `json:"rapidSpeed"`
		SafeZ            float64 `json:"safeZ"`
		WorkZ            float64 `json:"workZ"`
		WaitTime         int     `json:"waitTime"`
		StepDown         float64 `json:"stepDown"`
		PlungeSpeed      float64 `json:"plungeSpeed"`
		RampAngle        float64 `json:"rampAngle"`
		RetractClearance float64 `json:"retractClearance"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	updates := map[string]any{
		"work_speed":        req.WorkSpeed,
		"rapid_speed":       req.RapidSpeed,
		"safe_z":            req.SafeZ,
		"work_z":            req.WorkZ,
		"wait_time":         req.WaitTime,
		"step_down":         req.StepDown,
		"plunge_speed":      req.PlungeSpeed,
		"ramp_angle":        req.RampAngle,
		"retract_clearance": req.RetractClearance,
	}

	if err := h.db.Model(&persistence.PLCSimulationSettings{}).Where("id = 1").Updates(updates).Error; err != nil {
		respondError(c, http.StatusInternalServerError, i18n.Errorf("failed to save the PLC settings: %w", err))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
