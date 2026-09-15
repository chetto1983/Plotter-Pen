package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"plotter-pen/internal/service/opcua"

	"github.com/gorilla/websocket"
)

func TestWebSocketRejectsInvalidSubscribeAndKeepsConnection(t *testing.T) {
	r, _ := setupTestWSServer(t)
	server := httptest.NewServer(r)
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/api/opcua/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var msg opcua.WSMessage
	if err := conn.ReadJSON(&msg); err != nil || msg.Type != "status" {
		t.Fatalf("initial status: type %q, error %v", msg.Type, err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"subscribe","data":{"interval":"bad"}}`)); err != nil {
		t.Fatal(err)
	}
	if err := conn.ReadJSON(&msg); err != nil || msg.Type != "error" {
		t.Fatalf("invalid subscribe: type %q, error %v", msg.Type, err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"ping"}`)); err != nil {
		t.Fatal(err)
	}
	if err := conn.ReadJSON(&msg); err != nil || msg.Type != "pong" {
		t.Fatalf("ping after invalid subscribe: type %q, error %v", msg.Type, err)
	}
}
