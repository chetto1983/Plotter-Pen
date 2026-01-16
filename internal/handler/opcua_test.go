package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"plotter-pen/internal/persistence"
	"plotter-pen/internal/service/opcua"

	"github.com/glebarez/sqlite"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// setupOpcuaTestDB creates an in-memory test database
func setupOpcuaTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	db.AutoMigrate(&persistence.OPCUAConfig{})
	return db
}

func setupTestOpcuaServer(t *testing.T) (*gin.Engine, *OpcuaHandler) {
	gin.SetMode(gin.TestMode)
	db := setupOpcuaTestDB(t)
	r := gin.New()
	h := NewOpcuaHandler(db)
	api := r.Group("/api")
	h.RegisterRoutes(api)
	return r, h
}

func TestOpcuaHandler_GetConfig(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/config", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	// Response format: { "data": { ...config } }
	var resp struct {
		Data opcua.Config `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Check default config values exist
	if resp.Data.Endpoint == "" {
		t.Error("Expected endpoint to be set in config")
	}
}

func TestOpcuaHandler_UpdateConfig(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	newConfig := opcua.Config{
		Endpoint: "opc.tcp://test-plc:4840",
		DataNode: "ns=3;s=TestNode",
		DataType: "string",
	}
	body, _ := json.Marshal(newConfig)

	req := httptest.NewRequest(http.MethodPut, "/api/opcua/config", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	// Response format: { "data": { ...config } }
	var resp struct {
		Data opcua.Config `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Data.Endpoint != newConfig.Endpoint {
		t.Errorf("Expected endpoint %s, got %s", newConfig.Endpoint, resp.Data.Endpoint)
	}
}

func TestOpcuaHandler_UpdateConfig_InvalidJSON(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodPut, "/api/opcua/config", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestOpcuaHandler_Status(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/status", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	var status map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if _, ok := status["connected"]; !ok {
		t.Error("Expected 'connected' field in status")
	}

	// Should be disconnected by default
	if status["connected"].(bool) != false {
		t.Error("Expected connected=false by default")
	}
}

func TestOpcuaHandler_GetMachineStatus(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/machine-status", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	var status opcua.MachineStatus
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should report disconnected
	if status.Connected {
		t.Error("Expected connected=false")
	}
}

func TestOpcuaHandler_GetPosition_NotConnected(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/position", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should return 503 when not connected
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d", http.StatusServiceUnavailable, w.Code)
	}

	var errResp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if errResp["error"] == "" {
		t.Error("Expected error message")
	}
}

func TestOpcuaHandler_Send_InvalidJSON(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/send", bytes.NewReader([]byte("invalid")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestOpcuaHandler_Send_MissingData(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	// Empty JSON object - missing required 'data' field
	req := httptest.NewRequest(http.MethodPost, "/api/opcua/send", bytes.NewReader([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d: %s", http.StatusBadRequest, w.Code, w.Body.String())
	}
}

func TestOpcuaHandler_Connect_NoServer(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/connect", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should return 503 when server unavailable
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d: %s", http.StatusServiceUnavailable, w.Code, w.Body.String())
	}
}

func TestOpcuaHandler_Disconnect_NotConnected(t *testing.T) {
	r, _ := setupTestOpcuaServer(t)

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/disconnect", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should succeed even when not connected
	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp["connected"].(bool) != false {
		t.Error("Expected connected=false")
	}
}
