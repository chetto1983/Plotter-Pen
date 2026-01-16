package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
)

func setupTestOpcuaServer() (*gin.Engine, *OpcuaHandler) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewOpcuaHandler()
	api := r.Group("/api")
	h.RegisterRoutes(api)
	return r, h
}

func TestOpcuaHandler_GetConfig(t *testing.T) {
	r, _ := setupTestOpcuaServer()

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/config", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	var config opcua.Config
	if err := json.Unmarshal(w.Body.Bytes(), &config); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Check default config values exist
	if config.Endpoint == "" {
		t.Error("Expected endpoint to be set in config")
	}
}

func TestOpcuaHandler_UpdateConfig(t *testing.T) {
	r, _ := setupTestOpcuaServer()

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

	var config opcua.Config
	if err := json.Unmarshal(w.Body.Bytes(), &config); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if config.Endpoint != newConfig.Endpoint {
		t.Errorf("Expected endpoint %s, got %s", newConfig.Endpoint, config.Endpoint)
	}
}

func TestOpcuaHandler_UpdateConfig_InvalidJSON(t *testing.T) {
	r, _ := setupTestOpcuaServer()

	req := httptest.NewRequest(http.MethodPut, "/api/opcua/config", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestOpcuaHandler_Status(t *testing.T) {
	r, _ := setupTestOpcuaServer()

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
	r, _ := setupTestOpcuaServer()

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
	r, _ := setupTestOpcuaServer()

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
	r, _ := setupTestOpcuaServer()

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/send", bytes.NewReader([]byte("invalid")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestOpcuaHandler_Send_MissingData(t *testing.T) {
	r, _ := setupTestOpcuaServer()

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
	r, _ := setupTestOpcuaServer()

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/connect", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should return 503 when server unavailable
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d: %s", http.StatusServiceUnavailable, w.Code, w.Body.String())
	}
}

func TestOpcuaHandler_Disconnect_NotConnected(t *testing.T) {
	r, _ := setupTestOpcuaServer()

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
