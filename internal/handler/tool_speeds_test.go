package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
)

func toolRequest(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func createTool(t *testing.T, r *gin.Engine, body string) persistence.Tool {
	t.Helper()
	w := toolRequest(r, http.MethodPost, "/api/tools", body)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: status %d, body %s", w.Code, w.Body.String())
	}
	var tool persistence.Tool
	if err := json.Unmarshal(w.Body.Bytes(), &tool); err != nil {
		t.Fatalf("create: %v", err)
	}
	return tool
}

// listTools reads the tools the way the library window does.
func listTools(t *testing.T, r *gin.Engine) []persistence.Tool {
	t.Helper()
	w := toolRequest(r, http.MethodGet, "/api/tools", "")
	var tools []persistence.Tool
	if err := json.Unmarshal(w.Body.Bytes(), &tools); err != nil {
		t.Fatalf("list: %v, body %s", err, w.Body.String())
	}
	return tools
}

func loadTool(t *testing.T, r *gin.Engine, id int64) persistence.Tool {
	t.Helper()
	for _, tool := range listTools(t, r) {
		if tool.ID == id {
			return tool
		}
	}
	t.Fatalf("tool %d not listed", id)
	return persistence.Tool{}
}

// A tool keeps the speeds it cuts at, so the operation that uses it does not fall back on the
// global ones.
func TestCreateTool_KeepsItsSpeeds(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	created := createTool(t, r, `{"name": "Fresa 3mm", "type": "endmill", "diameter": 3, "feed": 37, "plunge": 4, "stepDown": 0.8}`)

	got := loadTool(t, r, created.ID)
	if got.Feed != 37 || got.Plunge != 4 || got.StepDown != 0.8 {
		t.Fatalf("saved feed %v, plunge %v, step-down %v; want 37, 4, 0.8", got.Feed, got.Plunge, got.StepDown)
	}
}

// A tool created without speeds takes the global ones, which is what 0 means.
func TestCreateTool_WithoutSpeedsTakesTheGlobalOnes(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	created := createTool(t, r, `{"name": "Punta 1mm", "type": "drill", "diameter": 1}`)

	if got := loadTool(t, r, created.ID); got.Feed != 0 || got.Plunge != 0 || got.StepDown != 0 {
		t.Fatalf("saved feed %v, plunge %v, step-down %v; want all 0", got.Feed, got.Plunge, got.StepDown)
	}
}

// A speed can be changed, and set back to 0 to return to the global one; a field the request does
// not carry is left as it was.
func TestUpdateTool_SetsAndClearsItsSpeeds(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()
	created := createTool(t, r, `{"name": "Fresa 6mm", "type": "endmill", "diameter": 6, "feed": 20, "plunge": 3, "stepDown": 1}`)
	path := fmt.Sprintf("/api/tools/%d", created.ID)

	if w := toolRequest(r, http.MethodPut, path, `{"feed": 37}`); w.Code != http.StatusOK {
		t.Fatalf("update: status %d, body %s", w.Code, w.Body.String())
	}
	got := loadTool(t, r, created.ID)
	if got.Feed != 37 || got.Plunge != 3 || got.StepDown != 1 || got.Name != "Fresa 6mm" || got.Diameter != 6 {
		t.Fatalf("after changing the feed: %+v", got)
	}

	if w := toolRequest(r, http.MethodPut, path, `{"feed": 0, "stepDown": 0}`); w.Code != http.StatusOK {
		t.Fatalf("clear: status %d, body %s", w.Code, w.Body.String())
	}
	got = loadTool(t, r, created.ID)
	if got.Feed != 0 || got.StepDown != 0 || got.Plunge != 3 {
		t.Fatalf("after clearing feed and step-down: feed %v, step-down %v, plunge %v; want 0, 0, 3",
			got.Feed, got.StepDown, got.Plunge)
	}
}

// A negative speed is a mistake, when creating and when changing a tool; nothing is saved.
func TestTool_RefusesNegativeSpeeds(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()
	created := createTool(t, r, `{"name": "Fresa 2mm", "type": "endmill", "diameter": 2, "feed": 10}`)
	path := fmt.Sprintf("/api/tools/%d", created.ID)
	count := len(listTools(t, r))

	for _, field := range []string{"feed", "plunge", "stepDown"} {
		body := fmt.Sprintf(`{"name": "Storta", "type": "endmill", "diameter": 2, %q: -1}`, field)
		if w := toolRequest(r, http.MethodPost, "/api/tools", body); w.Code != http.StatusBadRequest {
			t.Errorf("create with %s -1: status %d, want 400", field, w.Code)
		}
		if w := toolRequest(r, http.MethodPut, path, fmt.Sprintf(`{%q: -1}`, field)); w.Code != http.StatusBadRequest {
			t.Errorf("update with %s -1: status %d, want 400", field, w.Code)
		}
	}
	if got := loadTool(t, r, created.ID); got.Feed != 10 {
		t.Fatalf("a refused update changed the feed to %v", got.Feed)
	}
	if got := len(listTools(t, r)); got != count {
		t.Fatalf("refused creations left %d tools, want %d", got, count)
	}
}
