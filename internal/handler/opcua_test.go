package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"plotter-pen/internal/persistence"
	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
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

// setupTestOpcuaServerWithMock creates a test server with a mock client
func setupTestOpcuaServerWithMock(t *testing.T, mockClient *opcua.MockClient) (*gin.Engine, *OpcuaHandler) {
	gin.SetMode(gin.TestMode)
	db := setupOpcuaTestDB(t)
	r := gin.New()
	h := NewOpcuaHandlerWithClient(db, mockClient)
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

	var status map[string]any
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
	// Use mock client with simulated connection failure
	mockClient := opcua.NewMockClient()
	mockClient.SetConnectError(errors.New("connection refused: no OPC UA server available"))

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/connect", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should return 503 when server unavailable
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d: %s", http.StatusServiceUnavailable, w.Code, w.Body.String())
	}

	var errResp map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if errResp["error"] == "" {
		t.Error("Expected error message in response")
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

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp["connected"].(bool) != false {
		t.Error("Expected connected=false")
	}
}

// === Mock-Based Tests for Industrial-Grade Coverage ===

func TestOpcuaHandler_Connect_Success_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	// No error set - connection will succeed

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/connect", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp["connected"].(bool) != true {
		t.Error("Expected connected=true after successful connection")
	}
}

func TestOpcuaHandler_Disconnect_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	mockClient.SetConnected(true) // Start connected

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodPost, "/api/opcua/disconnect", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp["connected"].(bool) != false {
		t.Error("Expected connected=false after disconnect")
	}
}

func TestOpcuaHandler_Send_ConnectionFailed_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	// Not connected and auto-connect will fail
	mockClient.SetConnectError(errors.New("connection refused"))

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	body := []byte(`{"data": ["L X 10, Y 20, Z 0, V 100"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/opcua/send", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	// Should fail when auto-connect fails
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected status %d, got %d: %s", http.StatusServiceUnavailable, w.Code, w.Body.String())
	}
}

func TestOpcuaHandler_Send_Success_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	mockClient.SetConnected(true)

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	body := []byte(`{"data": ["L X 10, Y 20, Z 0, V 100"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/opcua/send", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}
}

func TestOpcuaHandler_Send_Error_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	mockClient.SetConnected(true)
	mockClient.SetSendError(errors.New("write timeout"))

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	body := []byte(`{"data": ["L X 10, Y 20, Z 0, V 100"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/opcua/send", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("Expected status %d, got %d: %s", http.StatusInternalServerError, w.Code, w.Body.String())
	}
}

func TestOpcuaHandler_GetPosition_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	mockClient.SetConnected(true)
	mockClient.SetPosition(opcua.Position{X: 100.5, Y: 200.3, Z: 5.0}, nil)

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/position", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var pos opcua.Position
	if err := json.Unmarshal(w.Body.Bytes(), &pos); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if pos.X != 100.5 || pos.Y != 200.3 || pos.Z != 5.0 {
		t.Errorf("Position mismatch: got X=%.1f Y=%.1f Z=%.1f", pos.X, pos.Y, pos.Z)
	}
}

func TestOpcuaHandler_GetMachineStatus_Mock(t *testing.T) {
	mockClient := opcua.NewMockClient()
	mockClient.SetConnected(true)
	mockClient.SetMachineStatus(opcua.MachineStatus{
		Connected: true,
		Status:    "running",
		Position:  opcua.Position{X: 50, Y: 75, Z: 0},
	})

	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/machine-status", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}

	var status opcua.MachineStatus
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if !status.Connected {
		t.Error("Expected connected=true")
	}
	if status.Status != "running" {
		t.Errorf("Expected status=running, got %s", status.Status)
	}
}

func TestOpcuaHandler_Variables_NotConnected(t *testing.T) {
	mockClient := opcua.NewMockClient()
	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/variables", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}
	var resp struct {
		Connected bool                 `json:"connected"`
		Variables []opcua.NodeVariable `json:"variables"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if resp.Connected || len(resp.Variables) != 0 {
		t.Errorf("Expected no variables while disconnected, got %+v", resp)
	}
	if mockClient.VariablesCalls() != 0 {
		t.Error("Expected no browse while disconnected")
	}
}

func TestOpcuaHandler_Variables_Connected(t *testing.T) {
	mockClient := opcua.NewMockClient()
	mockClient.SetConnected(true)
	mockClient.SetVariables([]opcua.NodeVariable{
		{Path: "ServerInterfaces/Com/Point", NodeID: "ns=4;i=12"},
		{Path: "ServerInterfaces/Com/Pos/X", NodeID: "ns=4;i=79"},
	})
	r, _ := setupTestOpcuaServerWithMock(t, mockClient)

	req := httptest.NewRequest(http.MethodGet, "/api/opcua/variables", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}
	var resp struct {
		Connected bool                 `json:"connected"`
		Variables []opcua.NodeVariable `json:"variables"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if !resp.Connected || len(resp.Variables) != 2 || resp.Variables[0].Path != "ServerInterfaces/Com/Point" ||
		resp.Variables[1].NodeID != "ns=4;i=79" {
		t.Errorf("Expected the two variables of the interface, got %+v", resp)
	}
}

func TestOpcuaHandler_TestConnection_TriesTheSettingsInTheRequest(t *testing.T) {
	live := opcua.NewMockClient()
	tried := opcua.NewMockClient()
	tried.SetVariables([]opcua.NodeVariable{{Path: "ServerInterfaces/Com/Point", NodeID: "ns=4;i=12"}})

	r, h := setupTestOpcuaServerWithMock(t, live)
	var used opcua.Config
	h.newClient = func(cfg opcua.Config) opcua.OPCUAClient {
		used = cfg
		return tried
	}

	body, _ := json.Marshal(opcua.Config{Endpoint: "opc.tcp://127.0.0.1:4840", SecurityMode: "None"})
	req := httptest.NewRequest(http.MethodPost, "/api/opcua/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}
	var resp struct {
		Connected bool                 `json:"connected"`
		Endpoint  string               `json:"endpoint"`
		Variables []opcua.NodeVariable `json:"variables"`
		Error     string               `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if used.Endpoint != "opc.tcp://127.0.0.1:4840" {
		t.Errorf("Tried %q, want the endpoint of the request", used.Endpoint)
	}
	if !resp.Connected || resp.Endpoint != "opc.tcp://127.0.0.1:4840" || len(resp.Variables) != 1 || resp.Error != "" {
		t.Errorf("Expected a successful test with one variable, got %+v", resp)
	}
	if !tried.DisconnectCalled() {
		t.Error("Expected the client of the test to be disconnected again")
	}
	if live.ConnectCalls() != 0 {
		t.Error("Expected the live connection to be left alone")
	}
}

func TestOpcuaHandler_TestConnection_ReportsTheFailure(t *testing.T) {
	live := opcua.NewMockClient()
	tried := opcua.NewMockClient()
	tried.SetConnectError(errors.New("connection refused"))

	r, h := setupTestOpcuaServerWithMock(t, live)
	h.newClient = func(opcua.Config) opcua.OPCUAClient { return tried }

	body, _ := json.Marshal(opcua.Config{Endpoint: "opc.tcp://192.0.2.1:4840"})
	req := httptest.NewRequest(http.MethodPost, "/api/opcua/test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status %d, got %d: %s", http.StatusOK, w.Code, w.Body.String())
	}
	var resp struct {
		Connected bool   `json:"connected"`
		Error     string `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}
	if resp.Connected || resp.Error == "" {
		t.Errorf("Expected the failure to be reported, got %+v", resp)
	}
}
