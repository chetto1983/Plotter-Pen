package handler

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/i18n"
)

// The page reads the error in Italian; the request log keeps it in English.
func TestRespondError_ItalianToThePageEnglishToTheLog(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	respondError(c, http.StatusBadRequest, i18n.Errorf("invalid request: %w", errors.New("unexpected EOF")))

	if w.Code != http.StatusBadRequest || w.Body.String() != `{"error":"richiesta non valida: unexpected EOF"}` {
		t.Errorf("status %d, body %s", w.Code, w.Body.String())
	}
	if got := c.Errors.String(); got != "Error #01: invalid request: unexpected EOF\n" {
		t.Errorf("log %q, want the English", got)
	}
}
