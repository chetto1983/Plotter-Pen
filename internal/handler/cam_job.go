package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"plotter-pen/internal/persistence"
)

// GetCAMJob handles GET /api/cam/job: the steps of the job, in the order they are cut. A job with
// no steps is an empty list, never null.
func (h *PersistenceHandler) GetCAMJob(c *gin.Context) {
	steps := []persistence.JobStep{}
	if err := h.db.Order("position").Find(&steps).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"steps": steps}})
}

// SaveCAMJob handles POST /api/cam/job: the steps sent are the whole job, in their order, so adding,
// removing and moving a step are all the same save. Every step is checked as the operation is; one
// wrong step refuses the lot, and the job saved before stays as it was.
func (h *PersistenceHandler) SaveCAMJob(c *gin.Context) {
	var req struct {
		// required refuses a body without the list; an empty list is an empty job
		Steps []persistence.JobStep `json:"steps" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for i := range req.Steps {
		if err := checkCAMParams(&req.Steps[i].CAMParams); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("step %d: %v", i+1, err)})
			return
		}
	}

	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("1 = 1").Delete(&persistence.JobStep{}).Error; err != nil {
			return err
		}
		for i, step := range req.Steps {
			row := camParamsColumns(step.CAMParams)
			row["position"] = i
			row["layer"] = step.Layer
			if err := tx.Model(&persistence.JobStep{}).Create(row).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
