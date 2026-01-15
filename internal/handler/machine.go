package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"plotter-pen/internal/persistence"
)

// MachineHandler handles machine configuration endpoints
type MachineHandler struct {
	db *gorm.DB
}

// NewMachineHandler creates a new machine handler
func NewMachineHandler(db *gorm.DB) *MachineHandler {
	return &MachineHandler{db: db}
}

// RegisterRoutes registers machine routes
func (h *MachineHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/machines", h.ListMachines)
	r.GET("/machines/active", h.GetActiveMachine)
	r.PUT("/machines/active", h.SetActiveMachine)
	r.GET("/machines/:id", h.GetMachine)
	r.POST("/machines", h.CreateMachine)
	r.PUT("/machines/:id", h.UpdateMachine)
	r.DELETE("/machines/:id", h.DeleteMachine)
}

// ListMachines returns all machine configurations
func (h *MachineHandler) ListMachines(c *gin.Context) {
	var machines []persistence.MachineConfig
	if err := h.db.Order("type, name").Find(&machines).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, machines)
}

// GetActiveMachine returns the currently active machine
func (h *MachineHandler) GetActiveMachine(c *gin.Context) {
	var machine persistence.MachineConfig
	if err := h.db.Where("is_active = ?", true).First(&machine).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active machine"})
		return
	}
	c.JSON(http.StatusOK, machine)
}

// SetActiveMachine sets the active machine by ID
func (h *MachineHandler) SetActiveMachine(c *gin.Context) {
	var req struct {
		ID int64 `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify machine exists
	var machine persistence.MachineConfig
	if err := h.db.First(&machine, req.ID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}

	// Deactivate all machines
	h.db.Model(&persistence.MachineConfig{}).Where("1 = 1").Update("is_active", false)

	// Activate selected machine
	h.db.Model(&machine).Update("is_active", true)

	c.JSON(http.StatusOK, machine)
}

// GetMachine returns a machine by ID
func (h *MachineHandler) GetMachine(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var machine persistence.MachineConfig
	if err := h.db.First(&machine, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "machine not found"})
		return
	}
	c.JSON(http.StatusOK, machine)
}

// CreateMachine creates a new machine configuration
func (h *MachineHandler) CreateMachine(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		Type string `json:"type" binding:"required"`
		Data string `json:"data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate type
	validTypes := map[string]bool{"plotter": true, "laser": true, "router": true, "printer": true}
	if !validTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid type: must be plotter, laser, router, or printer"})
		return
	}

	machine := persistence.MachineConfig{
		Name: req.Name,
		Type: req.Type,
		Data: req.Data,
	}

	if err := h.db.Create(&machine).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, machine)
}

// UpdateMachine updates a machine configuration
func (h *MachineHandler) UpdateMachine(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var req struct {
		Name string `json:"name"`
		Type string `json:"type"`
		Data string `json:"data"`
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
		validTypes := map[string]bool{"plotter": true, "laser": true, "router": true, "printer": true}
		if !validTypes[req.Type] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid type"})
			return
		}
		updates["type"] = req.Type
	}
	if req.Data != "" {
		updates["data"] = req.Data
	}

	if err := h.db.Model(&persistence.MachineConfig{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// DeleteMachine deletes a machine configuration
func (h *MachineHandler) DeleteMachine(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.db.Delete(&persistence.MachineConfig{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
