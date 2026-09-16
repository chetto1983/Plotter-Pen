package handler

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
)

// opcuaRouter serves the OPC UA routes and keeps what the last request handed to the log.
func opcuaRouter(t *testing.T, client opcua.OPCUAClient, logged *string) (*gin.Engine, *OpcuaHandler) {
	t.Helper()
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Next()
		*logged = c.Errors.String()
	})
	h := NewOpcuaHandlerWithClient(setupOpcuaTestDB(t), client)
	h.RegisterRoutes(r.Group("/api"))
	return r, h
}

// The connection and the PLC settings: the page reads Italian.
func TestOpcua_ErrorsInItalian(t *testing.T) {
	var logged string
	client := opcua.NewMockClient()
	client.SetConnectError(errors.New("connection refused"))
	r, _ := opcuaRouter(t, client, &logged)

	expectError(t, send(r, http.MethodGet, "/api/opcua/position", ""),
		http.StatusServiceUnavailable, "non c'è collegamento con il server OPC UA")
	expectError(t, send(r, http.MethodPost, "/api/opcua/connect", ""),
		http.StatusServiceUnavailable, "collegamento al PLC non riuscito: connection refused")
	if !strings.Contains(logged, "failed to connect to the PLC: connection refused") {
		t.Errorf("the log has %q, want the English", logged)
	}
	expectError(t, send(r, http.MethodPost, "/api/opcua/send", `{"data": ["J X 0"]}`),
		http.StatusServiceUnavailable, "collegamento al PLC non riuscito: connection refused")
	expectError(t, send(r, http.MethodPost, "/api/opcua/send", `{}`),
		http.StatusBadRequest, "il campo data è obbligatorio")

	expectError(t, send(r, http.MethodPost, "/api/opcua/plcs", `{"name": "Banco"}`),
		http.StatusBadRequest, "nome ed endpoint sono obbligatori")
	expectError(t, send(r, http.MethodGet, "/api/opcua/plcs/abc", ""), http.StatusBadRequest, "id non valido")
	expectError(t, send(r, http.MethodGet, "/api/opcua/plcs/999", ""), http.StatusNotFound, "il PLC 999 non esiste")
	expectError(t, send(r, http.MethodPost, "/api/opcua/plcs/999/activate", ""), http.StatusNotFound, "il PLC 999 non esiste")

	expectError(t, send(r, http.MethodGet, "/api/opcua/certificates/download/zip", ""),
		http.StatusBadRequest, "tipo di certificato non valido")
	expectError(t, send(r, http.MethodPost, "/api/opcua/certificates/generate", `{"outputDir": "../fuori"}`),
		http.StatusBadRequest, "la cartella dei certificati deve stare dentro certs")
}

// The active PLC cannot be deleted, and the page is told so rather than that it does not exist.
func TestOpcua_ActivePLCIsNotDeleted(t *testing.T) {
	var logged string
	r, _ := opcuaRouter(t, opcua.NewMockClient(), &logged)

	created := send(r, http.MethodPost, "/api/opcua/plcs", `{"name": "Banco", "endpoint": "opc.tcp://127.0.0.1:4840"}`)
	var plc struct {
		Data opcua.Config `json:"data"`
	}
	if created.Code != http.StatusCreated || json.Unmarshal(created.Body.Bytes(), &plc) != nil {
		t.Fatalf("create: status %d, body %s", created.Code, created.Body.String())
	}
	path := "/api/opcua/plcs/" + strconv.FormatInt(plc.Data.ID, 10)
	if w := send(r, http.MethodPost, path+"/activate", ""); w.Code != http.StatusOK {
		t.Fatalf("activate: status %d, body %s", w.Code, w.Body.String())
	}

	expectError(t, send(r, http.MethodDelete, path, ""), http.StatusBadRequest, "il PLC attivo non si può eliminare")
}

// A test of the settings that cannot reach the server answers 200 with the reason in Italian,
// and the English goes to the log.
func TestOpcua_FailedTestConnectionIsItalian(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	closed := ln.Addr().String()
	if err := ln.Close(); err != nil {
		t.Fatal(err)
	}

	var logged string
	r, _ := opcuaRouter(t, opcua.NewMockClient(), &logged)
	w := send(r, http.MethodPost, "/api/opcua/test", `{"endpoint": "opc.tcp://`+closed+`", "securityMode": "None"}`)

	var resp struct {
		Connected bool   `json:"connected"`
		Error     string `json:"error"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &resp) != nil {
		t.Fatalf("status %d, body %s", w.Code, w.Body.String())
	}
	if resp.Connected || !strings.HasPrefix(resp.Error, "gli endpoint del server non si possono leggere: ") {
		t.Errorf("the page reads %+v", resp)
	}
	if !strings.Contains(logged, "failed to get endpoints: ") {
		t.Errorf("the log has %q, want the English", logged)
	}
}

// Variables the connected PLC cannot list: the reason is said in Italian beside the 200.
func TestOpcua_VariablesErrorIsItalian(t *testing.T) {
	var logged string
	client := opcua.NewMockClient()
	client.SetConnected(true)
	client.SetVariablesError(errors.New("Bad_NodeIdUnknown"))
	r, _ := opcuaRouter(t, client, &logged)

	w := send(r, http.MethodGet, "/api/opcua/variables", "")
	var resp struct {
		Error string `json:"error"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &resp) != nil {
		t.Fatalf("status %d, body %s", w.Code, w.Body.String())
	}
	if resp.Error != "errore imprevisto: Bad_NodeIdUnknown" {
		t.Errorf("the page reads %q", resp.Error)
	}
	if !strings.Contains(logged, "Bad_NodeIdUnknown") {
		t.Errorf("the log has %q", logged)
	}
}
