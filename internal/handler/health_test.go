package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupHealthTest(t *testing.T) (*gin.Engine, *HealthHandler, func()) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("health_test_%s_%d.db", t.Name(), time.Now().UnixNano()))
	db, err := persistence.InitDB(tmpFile)
	if err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}

	r := gin.New()
	h := NewHealthHandler(db)
	h.RegisterRoutes(r)

	return r, h, func() { os.Remove(tmpFile) }
}

func TestHealthz(t *testing.T) {
	r, _, cleanup := setupHealthTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/healthz", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["status"] != "ok" {
		t.Errorf("Expected status 'ok', got '%v'", resp["status"])
	}
}

// The Docker HEALTHCHECK uses `wget --spider`, which sends HEAD
func TestHealthz_HEAD(t *testing.T) {
	r, _, cleanup := setupHealthTest(t)
	defer cleanup()

	for _, path := range []string{"/healthz", "/readyz", "/health"} {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("HEAD", path, nil)
		r.ServeHTTP(w, req)

		if w.Code != 200 {
			t.Errorf("HEAD %s: expected status 200, got %d", path, w.Code)
		}
	}
}

func TestReadyz_Healthy(t *testing.T) {
	r, _, cleanup := setupHealthTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/readyz", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["status"] != "ready" {
		t.Errorf("Expected status 'ready', got '%v'", resp["status"])
	}

	checks := resp["checks"].(map[string]any)
	if checks["database"] != "ok" {
		t.Errorf("Expected database 'ok', got '%v'", checks["database"])
	}
}

func TestHealth_DetailedInfo(t *testing.T) {
	r, _, cleanup := setupHealthTest(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/health", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)

	// Check status
	if resp["status"] != "ok" {
		t.Errorf("Expected status 'ok', got '%v'", resp["status"])
	}

	// Check uptime exists
	if _, exists := resp["uptime"]; !exists {
		t.Error("Expected uptime field")
	}

	// Check system info
	system := resp["system"].(map[string]any)
	if _, exists := system["goroutines"]; !exists {
		t.Error("Expected goroutines in system info")
	}
	if _, exists := system["memory_alloc"]; !exists {
		t.Error("Expected memory_alloc in system info")
	}

	// Check version info
	version := resp["version"].(map[string]any)
	if _, exists := version["go"]; !exists {
		t.Error("Expected go version in version info")
	}
}

func TestReadyz_DBClosed(t *testing.T) {
	tmpFile := filepath.Join(os.TempDir(), fmt.Sprintf("health_closed_%s_%d.db", t.Name(), time.Now().UnixNano()))
	db, err := persistence.InitDB(tmpFile)
	if err != nil {
		t.Fatalf("Failed to init test DB: %v", err)
	}
	defer os.Remove(tmpFile)

	// Close the database
	sqlDB, _ := db.DB()
	sqlDB.Close()

	r := gin.New()
	h := NewHealthHandler(db)
	h.RegisterRoutes(r)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/readyz", nil)
	r.ServeHTTP(w, req)

	if w.Code != 503 {
		t.Errorf("Expected status 503 for closed DB, got %d", w.Code)
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["status"] != "not ready" {
		t.Errorf("Expected status 'not ready', got '%v'", resp["status"])
	}
}

func TestHealthHandler_NilDB(t *testing.T) {
	r := gin.New()
	h := NewHealthHandler(nil)
	h.RegisterRoutes(r)

	// /healthz should still work
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/healthz", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200 for healthz, got %d", w.Code)
	}

	// /readyz should fail
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/readyz", nil)
	r.ServeHTTP(w, req)

	if w.Code != 503 {
		t.Errorf("Expected status 503 for readyz with nil DB, got %d", w.Code)
	}
}

func TestStatusString(t *testing.T) {
	tests := []struct {
		input    bool
		expected string
	}{
		{true, "ok"},
		{false, "error"},
	}

	for _, tt := range tests {
		result := statusString(tt.input)
		if result != tt.expected {
			t.Errorf("statusString(%v): expected '%s', got '%s'", tt.input, tt.expected, result)
		}
	}
}
