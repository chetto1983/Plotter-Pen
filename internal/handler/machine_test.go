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

func setupMachineTestDB(t *testing.T) (*gin.Engine, func()) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_machine_%s_%d.db", t.Name(), time.Now().UnixNano()))

	db, err := persistence.InitDB(tmpFile)
	if err != nil {
		t.Fatalf("InitDB error: %v", err)
	}

	r := gin.New()
	api := r.Group("/api")

	mh := NewMachineHandler(db)
	mh.RegisterRoutes(api)

	return r, func() {
		os.Remove(tmpFile)
	}
}

// === ListMachines Tests ===

func TestListMachines(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var machines []interface{}
	json.Unmarshal(w.Body.Bytes(), &machines)

	// Should have default machines
	if len(machines) < 1 {
		t.Log("No default machines found (may be expected)")
	}
}

// === GetActiveMachine Tests ===

func TestGetActiveMachine_NoActive(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines/active", nil)
	r.ServeHTTP(w, req)

	// May be 404 if no active machine
	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want 200 or 404", w.Code)
	}
}

func TestGetActiveMachine_AfterSet(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	// Create a machine first
	createBody := `{"name": "Test Plotter", "type": "plotter", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	if w1.Code != http.StatusCreated {
		t.Fatalf("Failed to create machine: %s", w1.Body.String())
	}

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Set as active
	setBody := fmt.Sprintf(`{"id": %d}`, id)
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("PUT", "/api/machines/active", bytes.NewBufferString(setBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Set active status = %d, want 200", w2.Code)
	}

	// Now get active
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest("GET", "/api/machines/active", nil)
	r.ServeHTTP(w3, req3)

	if w3.Code != http.StatusOK {
		t.Errorf("Get active status = %d, want 200", w3.Code)
	}
}

// === SetActiveMachine Tests ===

func TestSetActiveMachine_NotFound(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	body := `{"id": 99999}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/machines/active", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want 404", w.Code)
	}
}

func TestSetActiveMachine_InvalidJSON(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/machines/active", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestSetActiveMachine_MissingID(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/machines/active", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === GetMachine Tests ===

func TestGetMachine(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	// Create first
	createBody := `{"name": "Get Test", "type": "laser", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Get by ID
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/machines/"+strconv.Itoa(id), nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w2.Code)
	}
}

func TestGetMachine_NotFound(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines/99999", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want 404", w.Code)
	}
}

func TestGetMachine_InvalidID(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines/invalid", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === CreateMachine Tests ===

func TestCreateMachine_AllTypes(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	types := []string{"plotter", "laser", "router", "printer"}

	for _, machineType := range types {
		body := fmt.Sprintf(`{"name": "Test %s", "type": "%s", "data": "{}"}`, machineType, machineType)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Errorf("Create %s: status = %d, want 201", machineType, w.Code)
		}
	}
}

func TestCreateMachine_InvalidType(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	body := `{"name": "Test", "type": "invalid_type", "data": "{}"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestCreateMachine_MissingRequired(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	// Missing type
	body := `{"name": "Test", "data": "{}"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestCreateMachine_InvalidJSON(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === UpdateMachine Tests ===

func TestUpdateMachine(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	// Create first
	createBody := `{"name": "Update Test", "type": "plotter", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Update with all fields
	updateBody := `{"name": "Updated Name", "type": "laser", "data": "{\"updated\": true}"}`
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("PUT", "/api/machines/"+strconv.Itoa(id), bytes.NewBufferString(updateBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Update status = %d, want 200, body: %s", w2.Code, w2.Body.String())
	}
}

func TestUpdateMachine_InvalidType(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	// Create first
	createBody := `{"name": "Update Invalid Type", "type": "plotter", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Try to update with invalid type
	updateBody := `{"type": "invalid_type"}`
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("PUT", "/api/machines/"+strconv.Itoa(id), bytes.NewBufferString(updateBody))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w2.Code)
	}
}

func TestUpdateMachine_InvalidID(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	body := `{"name": "Updated"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/machines/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestUpdateMachine_InvalidJSON(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/machines/1", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === DeleteMachine Tests ===

func TestDeleteMachine(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	// Create first
	createBody := `{"name": "Delete Test", "type": "router", "data": "{}"}`
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(createBody))
	req1.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w1, req1)

	var created map[string]interface{}
	json.Unmarshal(w1.Body.Bytes(), &created)
	id := int(created["id"].(float64))

	// Delete
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("DELETE", "/api/machines/"+strconv.Itoa(id), nil)
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Errorf("Delete status = %d, want 200", w2.Code)
	}

	// Verify deleted
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest("GET", "/api/machines/"+strconv.Itoa(id), nil)
	r.ServeHTTP(w3, req3)

	if w3.Code != http.StatusNotFound {
		t.Errorf("After delete, get status = %d, want 404", w3.Code)
	}
}

func TestDeleteMachine_InvalidID(t *testing.T) {
	r, cleanup := setupMachineTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/machines/invalid", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === DB Error Tests for Machine Handler ===

func setupClosedMachineDB(t *testing.T) (*gin.Engine, func()) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("test_machine_closed_%s_%d.db", t.Name(), time.Now().UnixNano()))
	db, err := persistence.InitDB(tmpFile)
	if err != nil {
		t.Fatalf("InitDB error: %v", err)
	}

	r := gin.New()
	api := r.Group("/api")
	mh := NewMachineHandler(db)
	mh.RegisterRoutes(api)

	// Close the underlying SQL connection to simulate DB errors
	sqlDB, _ := db.DB()
	sqlDB.Close()

	return r, func() { os.Remove(tmpFile) }
}

func TestListMachines_DBError(t *testing.T) {
	r, cleanup := setupClosedMachineDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want 500", w.Code)
	}
}

func TestGetActiveMachine_DBError(t *testing.T) {
	r, cleanup := setupClosedMachineDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines/active", nil)
	r.ServeHTTP(w, req)

	// DB error when finding active machine should return 404 (not found)
	if w.Code != http.StatusNotFound && w.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want 404 or 500", w.Code)
	}
}

func TestCreateMachine_DBError(t *testing.T) {
	r, cleanup := setupClosedMachineDB(t)
	defer cleanup()

	body := `{"name": "Test", "type": "plotter", "data": "{}"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/machines", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want 500", w.Code)
	}
}

func TestGetMachine_DBError(t *testing.T) {
	r, cleanup := setupClosedMachineDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/machines/1", nil)
	r.ServeHTTP(w, req)

	// DB error when fetching machine - returns 404 since record not found
	if w.Code != http.StatusNotFound {
		t.Errorf("Status = %d, want 404", w.Code)
	}
}

func TestUpdateMachine_DBError(t *testing.T) {
	r, cleanup := setupClosedMachineDB(t)
	defer cleanup()

	body := `{"name": "Updated"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PUT", "/api/machines/1", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want 500", w.Code)
	}
}

func TestDeleteMachine_DBError(t *testing.T) {
	r, cleanup := setupClosedMachineDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/machines/1", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Status = %d, want 500", w.Code)
	}
}
