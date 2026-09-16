package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/i18n"
)

// respondError answers with the error in Italian, which the page shows, and hands it to the request
// log in English.
func respondError(c *gin.Context, status int, err error) {
	_ = c.Error(err)
	c.JSON(status, gin.H{"error": i18n.Italian(err)})
}

// badRequest answers a body the server cannot read.
func badRequest(c *gin.Context, err error) {
	respondError(c, http.StatusBadRequest, i18n.Errorf("invalid request: %w", err))
}
