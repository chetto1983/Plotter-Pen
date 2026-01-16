package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestWSServer() (*gin.Engine, *OpcuaHandler) {
	r := gin.New()
	h := NewOpcuaHandler()
	api := r.Group("/api")
	h.RegisterRoutes(api)
	return r, h
}

func TestWebSocket_Upgrade(t *testing.T) {
	r, _ := setupTestWSServer()
	server := httptest.NewServer(r)
	defer server.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	// Connect to WebSocket
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer conn.Close()

	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Errorf("Expected status 101, got %d", resp.StatusCode)
	}
}

func TestWebSocket_InitialStatus(t *testing.T) {
	r, _ := setupTestWSServer()
	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Should receive initial status message
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg opcua.WSMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	if msg.Type != "status" {
		t.Errorf("Expected type 'status', got '%s'", msg.Type)
	}

	if msg.Time == 0 {
		t.Error("Expected timestamp to be set")
	}
}

func TestWebSocket_Subscribe(t *testing.T) {
	r, _ := setupTestWSServer()
	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Read initial status
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var statusMsg opcua.WSMessage
	conn.ReadJSON(&statusMsg)

	// Send subscribe message
	subscribeMsg := map[string]interface{}{
		"type": "subscribe",
		"data": map[string]int{"interval": 100},
	}
	if err := conn.WriteJSON(subscribeMsg); err != nil {
		t.Fatalf("Failed to send subscribe: %v", err)
	}

	// Should receive subscribed confirmation
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var confirmMsg opcua.WSMessage
	if err := conn.ReadJSON(&confirmMsg); err != nil {
		t.Fatalf("Failed to read confirmation: %v", err)
	}

	if confirmMsg.Type != "subscribed" {
		t.Errorf("Expected type 'subscribed', got '%s'", confirmMsg.Type)
	}
}

func TestWebSocket_Unsubscribe(t *testing.T) {
	r, _ := setupTestWSServer()
	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Read initial status
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	conn.ReadJSON(&opcua.WSMessage{})

	// Subscribe first
	conn.WriteJSON(map[string]interface{}{
		"type": "subscribe",
		"data": map[string]int{"interval": 100},
	})
	conn.ReadJSON(&opcua.WSMessage{})

	// Unsubscribe
	conn.WriteJSON(map[string]interface{}{"type": "unsubscribe"})

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg opcua.WSMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	if msg.Type != "unsubscribed" {
		t.Errorf("Expected type 'unsubscribed', got '%s'", msg.Type)
	}
}

func TestWebSocket_Ping(t *testing.T) {
	r, _ := setupTestWSServer()
	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Read initial status
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	conn.ReadJSON(&opcua.WSMessage{})

	// Send ping
	conn.WriteJSON(map[string]string{"type": "ping"})

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg opcua.WSMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	if msg.Type != "pong" {
		t.Errorf("Expected type 'pong', got '%s'", msg.Type)
	}
}

func TestWebSocket_InvalidCommand(t *testing.T) {
	r, _ := setupTestWSServer()
	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Read initial status
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	conn.ReadJSON(&opcua.WSMessage{})

	// Send invalid command
	conn.WriteJSON(map[string]interface{}{
		"type": "command",
		"data": map[string]string{"action": "invalid_action"},
	})

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg opcua.WSMessage
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	if msg.Type != "error" {
		t.Errorf("Expected type 'error', got '%s'", msg.Type)
	}
}

// Test stream service
func TestPositionStream_NewPositionStream(t *testing.T) {
	configMgr := opcua.NewConfigManager("")
	client := opcua.NewClient(configMgr)

	stream := opcua.NewPositionStream(client, 100)
	if stream == nil {
		t.Fatal("Expected stream to be created")
	}

	if stream.IsRunning() {
		t.Error("Expected stream to not be running initially")
	}
}

func TestPositionStream_IntervalBounds(t *testing.T) {
	configMgr := opcua.NewConfigManager("")
	client := opcua.NewClient(configMgr)

	// Test minimum interval (should be clamped to 50ms)
	stream := opcua.NewPositionStream(client, 10)
	if stream == nil {
		t.Fatal("Expected stream to be created")
	}

	// Test maximum interval (should be clamped to 1000ms)
	stream = opcua.NewPositionStream(client, 5000)
	if stream == nil {
		t.Fatal("Expected stream to be created")
	}
}

// Test message helpers
func TestWSMessage_Helpers(t *testing.T) {
	// Test PositionMessage
	pos := opcua.Position{X: 1.0, Y: 2.0, Z: 3.0}
	msg := opcua.PositionMessage(pos)
	if msg.Type != "position" {
		t.Errorf("Expected type 'position', got '%s'", msg.Type)
	}
	if msg.Time == 0 {
		t.Error("Expected timestamp to be set")
	}

	// Test StatusMessage
	statusMsg := opcua.StatusMessage(true, "opc.tcp://localhost:4840")
	if statusMsg.Type != "status" {
		t.Errorf("Expected type 'status', got '%s'", statusMsg.Type)
	}

	// Test AlarmMessage
	alarmMsg := opcua.AlarmMessage("E001", "Test alarm")
	if alarmMsg.Type != "alarm" {
		t.Errorf("Expected type 'alarm', got '%s'", alarmMsg.Type)
	}

	// Test AckMessage
	ackMsg := opcua.AckMessage("cmd1", true, "Success")
	if ackMsg.Type != "ack" {
		t.Errorf("Expected type 'ack', got '%s'", ackMsg.Type)
	}

	// Test ErrorMessage
	errMsg := opcua.ErrorMessage("Test error")
	if errMsg.Type != "error" {
		t.Errorf("Expected type 'error', got '%s'", errMsg.Type)
	}
}

func TestWSMessage_JSON(t *testing.T) {
	msg := opcua.PositionMessage(opcua.Position{X: 1.5, Y: 2.5, Z: 0.0})

	data, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("Failed to marshal message: %v", err)
	}

	var decoded opcua.WSMessage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal message: %v", err)
	}

	if decoded.Type != "position" {
		t.Errorf("Expected type 'position', got '%s'", decoded.Type)
	}
}
