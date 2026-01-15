package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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

	// CAM Settings
	r.GET("/cam/settings", h.GetCAMSettings)
	r.POST("/cam/settings", h.SaveCAMSettings)
}

// === App State ===

func (h *PersistenceHandler) GetState(c *gin.Context) {
	var state persistence.AppState
	if err := h.db.First(&state).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": state.Data})
}

func (h *PersistenceHandler) SaveState(c *gin.Context) {
	var req struct {
		Data string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.db.Model(&persistence.AppState{}).Where("id = 1").Update("data", req.Data).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === Drawings ===

func (h *PersistenceHandler) ListDrawings(c *gin.Context) {
	var drawings []persistence.Drawing
	if err := h.db.Order("updated_at DESC").Find(&drawings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, drawings)
}

func (h *PersistenceHandler) GetDrawing(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var drawing persistence.Drawing
	if err := h.db.First(&drawing, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "drawing not found"})
		return
	}
	c.JSON(http.StatusOK, drawing)
}

func (h *PersistenceHandler) CreateDrawing(c *gin.Context) {
	var req struct {
		Name       string `json:"name" binding:"required"`
		Data       string `json:"data" binding:"required"`
		PreviewImg string `json:"previewImg"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	drawing := persistence.Drawing{
		Name:       req.Name,
		Data:       req.Data,
		PreviewImg: req.PreviewImg,
	}

	if err := h.db.Create(&drawing).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, drawing)
}

func (h *PersistenceHandler) UpdateDrawing(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name       string `json:"name"`
		Data       string `json:"data"`
		PreviewImg string `json:"previewImg"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *PersistenceHandler) DeleteDrawing(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.db.Delete(&persistence.Drawing{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === Tools ===

func (h *PersistenceHandler) ListTools(c *gin.Context) {
	var tools []persistence.Tool
	if err := h.db.Find(&tools).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tools)
}

func (h *PersistenceHandler) CreateTool(c *gin.Context) {
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Type        string  `json:"type"`
		Diameter    float64 `json:"diameter" binding:"required"`
		Description string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tool := persistence.Tool{
		Name:        req.Name,
		Type:        req.Type,
		Diameter:    req.Diameter,
		Description: req.Description,
	}
	if tool.Type == "" {
		tool.Type = "endmill"
	}

	if err := h.db.Create(&tool).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tool)
}

func (h *PersistenceHandler) UpdateTool(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name        string  `json:"name"`
		Type        string  `json:"type"`
		Diameter    float64 `json:"diameter"`
		Description string  `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
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

	if err := h.db.Model(&persistence.Tool{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *PersistenceHandler) DeleteTool(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.db.Delete(&persistence.Tool{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// === CAM Settings ===

func (h *PersistenceHandler) GetCAMSettings(c *gin.Context) {
	var settings persistence.CAMSettings
	if err := h.db.First(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": settings.Data})
}

func (h *PersistenceHandler) SaveCAMSettings(c *gin.Context) {
	var req struct {
		Data string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.db.Model(&persistence.CAMSettings{}).Where("id = 1").Update("data", req.Data).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
