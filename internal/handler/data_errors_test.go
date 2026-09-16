package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func send(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func expectError(t *testing.T, w *httptest.ResponseRecorder, status int, message string) {
	t.Helper()
	want := `{"error":"` + message + `"}`
	if w.Code != status || w.Body.String() != want {
		t.Errorf("status %d, body %s; want %d, %s", w.Code, w.Body.String(), status, want)
	}
}

// The drawings: a name already taken is said as such, not as the database error.
func TestDrawings_ErrorsInItalian(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	if w := send(r, http.MethodPost, "/api/drawings", `{"name": "Uno", "data": "{}"}`); w.Code != http.StatusCreated {
		t.Fatalf("first save: status %d, body %s", w.Code, w.Body.String())
	}
	expectError(t, send(r, http.MethodPost, "/api/drawings", `{"name": "Uno", "data": "{}"}`),
		http.StatusInternalServerError, `esiste già un disegno chiamato \"Uno\"`)
	expectError(t, send(r, http.MethodPost, "/api/drawings", `{"data": "{}"}`),
		http.StatusBadRequest, "il campo name è obbligatorio")
	expectError(t, send(r, http.MethodGet, "/api/drawings/999", ""), http.StatusNotFound, "disegno non trovato")
	expectError(t, send(r, http.MethodGet, "/api/drawings/abc", ""), http.StatusBadRequest, "id non valido")
	expectError(t, send(r, http.MethodDelete, "/api/drawings/abc", ""), http.StatusBadRequest, "id non valido")
}

// The tool library: every missing field is named, and a negative speed says which one.
func TestTools_ErrorsInItalian(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	expectError(t, send(r, http.MethodPost, "/api/tools", `{"type": "drill"}`),
		http.StatusBadRequest, "il campo name è obbligatorio; il campo diameter è obbligatorio")
	expectError(t, send(r, http.MethodPost, "/api/tools", `{"name": "Punta", "diameter": 1, "feed": -1}`),
		http.StatusBadRequest, "l'avanzamento non può essere negativo: 0 usa quello globale")
	expectError(t, send(r, http.MethodPut, "/api/tools/1", `{"plunge": -1}`),
		http.StatusBadRequest, "la velocità di affondo non può essere negativa: 0 usa quella globale")
	expectError(t, send(r, http.MethodPut, "/api/tools/1", `{"stepDown": -1}`),
		http.StatusBadRequest, "la passata non può essere negativa: 0 usa quella globale")
	expectError(t, send(r, http.MethodPut, "/api/tools/x", `{}`), http.StatusBadRequest, "id non valido")
}

// A body that is not JSON keeps the detail of the parser behind an Italian lead.
func TestState_ErrorsInItalian(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	expectError(t, send(r, http.MethodPost, "/api/state", `{}`), http.StatusBadRequest, "il campo data è obbligatorio")
	w := send(r, http.MethodPost, "/api/plc/settings", `{"safeZ": "high"}`)
	if w.Code != http.StatusBadRequest || !strings.HasPrefix(w.Body.String(), `{"error":"richiesta non valida: json: cannot unmarshal`) {
		t.Errorf("status %d, body %s; want 400 with the Italian lead and the parser's detail", w.Code, w.Body.String())
	}
}
