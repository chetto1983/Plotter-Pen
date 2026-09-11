package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"plotter-pen/internal/service/opcua"

	"github.com/gorilla/websocket"
	"go.uber.org/goleak"
)

// When a client goes away, every goroutine the server started for it must end: a writer left
// behind on the closed send channel spins at full CPU for the life of the process.
func TestWebSocket_DisconnectEndsServerGoroutines(t *testing.T) {
	// the in-memory test database stays open, with its connection opener, until the test ends
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent(),
		goleak.IgnoreTopFunction("database/sql.(*DB).connectionOpener"))

	r, _ := setupTestWSServer(t)
	server := httptest.NewServer(r)
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	// on disconnect the writer wakes on one of two ready channels chosen at random, so a single
	// disconnect can miss the faulty path; twenty make that practically impossible
	for range 20 {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var msg opcua.WSMessage
		if err := conn.ReadJSON(&msg); err != nil { // the handler is running once status arrives
			t.Fatalf("read initial status: %v", err)
		}
		conn.Close()
	}
}

// A subscribed client that leaves: the position stream started for it must stop too. The case
// of a disconnect handled before the stream goroutine begins is TestPositionStream_StopBeforeStartEndsStream.
func TestWebSocket_DisconnectAfterSubscribeEndsStream(t *testing.T) {
	// the in-memory test database stays open, with its connection opener, until the test ends
	defer goleak.VerifyNone(t, goleak.IgnoreCurrent(),
		goleak.IgnoreTopFunction("database/sql.(*DB).connectionOpener"))

	r, _ := setupTestWSServer(t)
	server := httptest.NewServer(r)
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/opcua/ws"

	for range 20 {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("dial: %v", err)
		}
		if err := conn.WriteJSON(map[string]any{"type": "subscribe", "data": map[string]int{"interval": 100}}); err != nil {
			t.Fatalf("subscribe: %v", err)
		}
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		for msg := (opcua.WSMessage{}); msg.Type != "subscribed"; {
			if err := conn.ReadJSON(&msg); err != nil {
				t.Fatalf("waiting for subscribed: %v", err)
			}
		}
		conn.Close()
	}
}
