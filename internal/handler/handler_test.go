package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestDB(t *testing.T) (*gin.Engine, func()) {
	// Use timestamp to ensure unique DB file each run
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_handler_%s_%d.db", t.Name(), time.Now().UnixNano()))

	db, err := persistence.InitDB(tmpFile)
	if err != nil {
		t.Fatalf("InitDB error: %v", err)
	}

	r := gin.New()
	api := r.Group("/api")

	ph := NewPersistenceHandler(db)
	ph.RegisterRoutes(api)

	return r, func() {
		os.Remove(tmpFile)
	}
}

// === State Tests ===

func TestGetState(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/state", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if _, ok := resp["data"]; !ok {
		t.Error("Response should have 'data' field")
	}
}

func TestSaveState(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"data": "{\"test\": 123}"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/state", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}

	// Verify saved
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/state", nil)
	r.ServeHTTP(w2, req2)

	var resp map[string]interface{}
	json.Unmarshal(w2.Body.Bytes(), &resp)

	if resp["data"] != `{"test": 123}` {
		t.Errorf("State not saved correctly: %v", resp["data"])
	}
}

func TestSaveState_Invalid(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"invalid": "no data field"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/state", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === Drawing Tests ===

func TestListDrawings(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/drawings", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var drawings []interface{}
	json.Unmarshal(w.Body.Bytes(), &drawings)

	// Initially empty
	if len(drawings) != 0 {
		t.Logf("Found %d existing drawings", len(drawings))
	}
}

func TestCreateDrawing(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Use unique name per test run
	name := "Test Drawing " + t.Name()
	body := `{"name": "` + name + `", "data": "{}", "previewImg": "base64..."}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/drawings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Status = %d, want 201, body: %s", w.Code, w.Body.String())
	}

	var drawing map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &drawing)

	if drawing["name"] != name {
		t.Errorf("Name = %v", drawing["name"])
	}
	if drawing["id"] == nil || drawing["id"].(float64) == 0 {
		t.Error("ID should be set")
	}
}

func TestGetDrawing(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Create first with unique name
	name := "Get Test " + t.Name()
	body := `{"name": "` + name + `", "data": "{\"test\": true}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/drawings", bytes.NewBufferString(body))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Failed to create drawing: %s", w1.Body.String())
	}

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)

	idVal, ok := created["id"]
	if !ok || idVal == nil {
		t.Fatalf("ID not returned in create response")
	}
	id := int(idVal.(float64))

	// Get by ID
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/drawings/"+strconv.Itoa(id), nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w2.Code)
	}
}

func TestGetDrawing_NotFound(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/drawings/99999", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want 404", w.Code)
	}
}

func TestGetDrawing_InvalidID(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/drawings/invalid", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestDeleteDrawing(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Create first with unique name
	name := "Delete Test " + t.Name()
	body := `{"name": "` + name + `", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/drawings", bytes.NewBufferString(body))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Failed to create drawing: %s", w1.Body.String())
	}

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Delete
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("DELETE", "/api/drawings/"+strconv.Itoa(id), nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Delete status = %d, want 200", w2.Code)
	}
}

// === Tool Tests ===

func TestListTools(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/tools", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var tools []interface{}
	json.Unmarshal(w.Body.Bytes(), &tools)

	// Should have default tools
	if len(tools) < 1 {
		t.Error("Should have default tools")
	}
}

func TestCreateTool(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"name": "Test Tool", "diameter": 8.0, "type": "endmill"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/tools", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Status = %d, want 201, body: %s", w.Code, w.Body.String())
	}
}

func TestCreateTool_DefaultType(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// No type specified
	body := `{"name": "No Type Tool", "diameter": 5.0}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/tools", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Status = %d, want 201", w.Code)
	}

	var tool map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &tool)

	if tool["type"] != "endmill" {
		t.Errorf("Type should default to endmill, got %v", tool["type"])
	}
}

// === CAM Settings Tests ===

func TestGetCAMSettings(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/cam/settings", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestSaveCAMSettings(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"data": "{\"feedXY\": 1000}"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/settings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestSaveCAMSettings_Invalid(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"invalid": "no data field"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/settings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === UpdateDrawing Tests ===

func TestUpdateDrawing(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Create drawing first
	createBody := `{"name": "Update Test", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/drawings", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Failed to create drawing: %s", w1.Body.String())
	}

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Update the drawing
	updateBody := `{"name": "Updated Name", "data": "{\"updated\": true}", "previewImg": "newImg"}`
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("PUT", "/api/drawings/"+strconv.Itoa(id), bytes.NewBufferString(updateBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Update status = %d, want 200, body: %s", w2.Code, w2.Body.String())
	}
}

func TestUpdateDrawing_InvalidID(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"name": "Updated"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/drawings/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestUpdateDrawing_InvalidJSON(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Create drawing first
	createBody := `{"name": "InvalidJSON Test", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/drawings", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Send invalid JSON
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("PUT", "/api/drawings/"+strconv.Itoa(id), bytes.NewBufferString("{invalid"))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w2.Code)
	}
}

func TestDeleteDrawing_InvalidID(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/drawings/invalid", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === UpdateTool Tests ===

func TestUpdateTool(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Create tool first
	createBody := `{"name": "Update Tool Test", "diameter": 6.0}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/tools", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Failed to create tool: %s", w1.Body.String())
	}

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Update the tool - with all fields
	updateBody := `{"name": "Updated Tool", "type": "ballnose", "diameter": 8.0, "description": "Updated desc"}`
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("PUT", "/api/tools/"+strconv.Itoa(id), bytes.NewBufferString(updateBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Update status = %d, want 200, body: %s", w2.Code, w2.Body.String())
	}
}

func TestUpdateTool_InvalidID(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	body := `{"name": "Updated"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/tools/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestUpdateTool_InvalidJSON(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/tools/1", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === DeleteTool Tests ===

func TestDeleteTool(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Create tool first
	createBody := `{"name": "Delete Tool Test", "diameter": 6.0}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/tools", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Failed to create tool: %s", w1.Body.String())
	}

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Delete
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("DELETE", "/api/tools/"+strconv.Itoa(id), nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Delete status = %d, want 200, body: %s", w2.Code, w2.Body.String())
	}
}

func TestDeleteTool_InvalidID(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/tools/invalid", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === CreateDrawing Error Cases ===

func TestCreateDrawing_Invalid(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Missing required fields
	body := `{"name": "no data field"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/drawings", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === CreateTool Error Cases ===

func TestCreateTool_Invalid(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	// Missing required diameter
	body := `{"name": "no diameter"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/tools", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}
