package handler

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"plotter-pen/internal/service/opcua"

	"github.com/gorilla/websocket"
)

// dialOpcuaWS opens the OPC UA WebSocket of a handler on the client and reads the initial status.
func dialOpcuaWS(t *testing.T, client opcua.OPCUAClient) *websocket.Conn {
	t.Helper()
	var logged string
	r, _ := opcuaRouter(t, client, &logged)
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/api/opcua/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if msg := askWS(t, conn, ""); msg.Type != "status" {
		t.Fatalf("initial message %q, want status", msg.Type)
	}
	return conn
}

// askWS sends the message, when there is one, and reads the answer with its data as raw JSON.
func askWS(t *testing.T, conn *websocket.Conn, message string) (answer struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}) {
	t.Helper()
	if message != "" {
		if err := conn.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
			t.Fatal(err)
		}
	}
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := conn.ReadJSON(&answer); err != nil {
		t.Fatalf("answer to %s: %v", message, err)
	}
	return answer
}

type wsExchange struct{ send, wantType, wantData string }

func expectWS(t *testing.T, conn *websocket.Conn, exchanges []wsExchange) {
	t.Helper()
	for _, x := range exchanges {
		got := askWS(t, conn, x.send)
		if got.Type != x.wantType || string(got.Data) != x.wantData {
			t.Errorf("%s: got %s %s, want %s %s", x.send, got.Type, got.Data, x.wantType, x.wantData)
		}
	}
}

// What the WebSocket refuses, and the answers to the commands, are Italian.
func TestWebSocket_ErrorsInItalian(t *testing.T) {
	client := opcua.NewMockClient()
	client.SetConnectError(errors.New("connection refused"))
	expectWS(t, dialOpcuaWS(t, client), []wsExchange{
		{`{"type":"command","data":{"action":"jump"}}`, "error", `{"message":"azione sconosciuta: jump"}`},
		{`{"type":"command","data":"x"}`, "error", `{"message":"richiesta di comando non valida"}`},
		{`{"type":"command","data":{"action":"connect"}}`, "ack",
			`{"action":"connect","message":"collegamento al PLC non riuscito: connection refused","success":false}`},
		{`{"type":"command","data":{"action":"send"}}`, "ack",
			`{"action":"send","message":"nessun comando da inviare","success":false}`},
		{`{"type":"command","data":{"action":"send","commands":["J X 0"]}}`, "ack",
			`{"action":"send","message":"collegamento al PLC non riuscito: connection refused","success":false}`},
		{`{"type":"transfer","data":"x"}`, "error", `{"message":"richiesta di trasferimento non valida"}`},
		{`{"type":"transfer","data":{"commands":[]}}`, "error", `{"message":"nessun comando da trasferire"}`},
		{`{"type":"transfer","data":{"commands":["J X 0"]}}`, "error",
			`{"message":"il trasferimento a blocchi non è disponibile con questo client"}`},
		{`{"type":"cancel_transfer"}`, "error", `{"message":"nessun trasferimento in corso"}`},
		{`{"type":"subscribe","data":{"interval":"bad"}}`, "error",
			`{"message":"richiesta di lettura della posizione non valida"}`},
		{`{"type":"subscribe","data":{"interval":100}}`, "error",
			`{"message":"la lettura continua della posizione non è disponibile con questo client"}`},
	})
}

// The commands that work are answered in Italian too.
func TestWebSocket_AnswersInItalian(t *testing.T) {
	client := opcua.NewMockClient()
	client.SetConnected(true)
	expectWS(t, dialOpcuaWS(t, client), []wsExchange{
		{`{"type":"command","data":{"action":"send","commands":["J X 0"]}}`, "ack",
			`{"action":"send","message":"comandi inviati","success":true}`},
		{`{"type":"command","data":{"action":"disconnect"}}`, "ack",
			`{"action":"disconnect","message":"scollegato","success":true}`},
		{"", "status", `{"connected":false,"endpoint":""}`},
		{`{"type":"command","data":{"action":"connect"}}`, "ack",
			`{"action":"connect","message":"collegato","success":true}`},
	})
}
