package handler

import (
	"errors"
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
	g.POST("/drill", h.Drill)
}

// Profile handles POST /api/cam/profile: the PLC program of a profile cut, in the response shape
// of /api/plc/extract. A drawing or settings that cannot be cut is a bad request, except a drawing
// whose contours are all open: that is unprocessable, and the answer lists the contours with the
// gap that closes them, so the panel can offer to close them.
func (h *CAMHandler) Profile(c *gin.Context) {
	var req cam.ProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := cam.Profile(req)
	if open, ok := errors.AsType[*cam.OpenContoursError](err); ok {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error(), "open": open.Open})
		return
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// Drill handles POST /api/cam/drill: the PLC program that drills the circles in a diameter range,
// in the response shape of /api/plc/extract. Settings or a drawing with nothing to drill are a bad
// request.
func (h *CAMHandler) Drill(c *gin.Context) {
	var req cam.DrillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := cam.Drill(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}
