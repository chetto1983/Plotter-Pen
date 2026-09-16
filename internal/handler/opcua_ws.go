package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"plotter-pen/internal/i18n"
	"plotter-pen/internal/service/opcua"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WebSocket connection rate limiting
var (
	wsConnections   = make(map[string]int) // IP -> connection count
	wsConnectionsMu sync.Mutex
	wsMaxPerIP      = 5 // Max WebSocket connections per IP
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow localhost and same-origin by default
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // No origin header = same-origin
		}
		// Allow localhost variants
		if strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1") {
			return true
		}
		// Allow configured origins via ALLOWED_ORIGINS env var
		allowed := os.Getenv("ALLOWED_ORIGINS")
		if allowed != "" {
			for a := range strings.SplitSeq(allowed, ",") {
				if strings.TrimSpace(a) == origin {
					return true
				}
			}
		}
		// Industrial use: allow if not explicitly restricted
		return os.Getenv("WS_STRICT_ORIGIN") == ""
	},
}

// WSClient represents a WebSocket client connection
type WSClient struct {
	conn      *websocket.Conn
	send      chan opcua.WSMessage
	done      chan struct{} // signals shutdown to writePump
	closeOnce sync.Once     // ensures send channel is closed only once
	stream    *opcua.PositionStream
	transfer  *opcua.ChunkedTransfer
	mu        sync.Mutex
}

func (wc *WSClient) safeSend(msg opcua.WSMessage) {
	if wc == nil || wc.send == nil {
		return
	}
	defer func() {
		_ = recover()
	}()
	wc.send <- msg
}

func (wc *WSClient) safeTrySend(msg opcua.WSMessage) {
	if wc == nil || wc.send == nil {
		return
	}
	defer func() {
		_ = recover()
	}()
	select {
	case wc.send <- msg:
	default:
	}
}

// InboundMessage represents messages from client
type InboundMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// WebSocket handles WebSocket connections for real-time position updates
func (h *OpcuaHandler) WebSocket(c *gin.Context) {
	// Rate limiting: check connection count per IP
	clientIP := c.ClientIP()
	wsConnectionsMu.Lock()
	if wsConnections[clientIP] >= wsMaxPerIP {
		wsConnectionsMu.Unlock()
		respondError(c, http.StatusTooManyRequests, i18n.Errorf("too many WebSocket connections from this address"))
		return
	}
	wsConnections[clientIP]++
	wsConnectionsMu.Unlock()

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		wsConnectionsMu.Lock()
		wsConnections[clientIP]--
		wsConnectionsMu.Unlock()
		return
	}

	client := &WSClient{
		conn: conn,
		send: make(chan opcua.WSMessage, 256),
		done: make(chan struct{}),
	}

	// Start write pump
	go client.writePump()

	// Handle incoming messages and position streaming
	// Decrement connection count on disconnect
	defer func() {
		wsConnectionsMu.Lock()
		wsConnections[clientIP]--
		if wsConnections[clientIP] <= 0 {
			delete(wsConnections, clientIP)
		}
		wsConnectionsMu.Unlock()
	}()
	client.readPump(h)
}

// writePump sends messages to WebSocket client
func (wc *WSClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		wc.closeConnection()
	}()

	for {
		select {
		case <-wc.done:
			// Shutdown signal received, drain remaining messages. readPump closes send right
			// after done: a receive from the closed channel never blocks, so without the ok
			// check this loop would spin forever.
			for {
				select {
				case msg, ok := <-wc.send:
					if !ok {
						wc.writeClose()
						return
					}
					if err := wc.conn.SetWriteDeadline(time.Now().Add(time.Second)); err != nil {
						return
					}
					if err := wc.conn.WriteJSON(msg); err != nil {
						return
					}
				default:
					wc.writeClose()
					return
				}
			}
		case msg, ok := <-wc.send:
			if !ok {
				wc.writeClose()
				return
			}
			if err := wc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
				return
			}
			if err := wc.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ticker.C:
			if err := wc.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second)); err != nil {
				return
			}
		}
	}
}

func (wc *WSClient) closeConnection() {
	// Both pumps close the connection to wake the other on I/O failure.
	if err := wc.conn.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
		log.Printf("WebSocket close failed: %v", err)
	}
}

func (wc *WSClient) writeClose() {
	// A control-frame deadline also bounds shutdown before any data has been written.
	if err := wc.conn.WriteControl(websocket.CloseMessage, nil, time.Now().Add(time.Second)); err != nil {
		wc.closeConnection()
	}
}

// readPump reads messages from WebSocket client
func (wc *WSClient) readPump(h *OpcuaHandler) {
	defer func() {
		wc.stopStream()
		wc.cancelTransfer()
		// Signal writePump to shutdown, then safely close send channel
		wc.closeOnce.Do(func() {
			close(wc.done)
			close(wc.send)
		})
		wc.closeConnection()
	}()

	if err := wc.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
		return
	}
	wc.conn.SetPongHandler(func(string) error {
		return wc.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	// Send initial status
	wc.send <- opcua.StatusMessage(h.client.IsConnected(), h.configMgr.Get().Endpoint)

	for {
		var msg InboundMessage
		if err := wc.conn.ReadJSON(&msg); err != nil {
			return
		}

		wc.handleMessage(h, msg)
	}
}

// wsFailure hands a failure to the log in English and returns the Italian the page shows.
func wsFailure(err error) string {
	log.Printf("OPC UA WebSocket: %v", err)
	return i18n.Italian(err)
}

// handleMessage processes incoming WebSocket messages
func (wc *WSClient) handleMessage(h *OpcuaHandler, msg InboundMessage) {
	switch msg.Type {
	case "subscribe":
		wc.handleSubscribe(h, msg.Data)
	case "unsubscribe":
		wc.handleUnsubscribe()
	case "command":
		wc.handleCommand(h, msg.Data)
	case "transfer":
		wc.handleTransfer(h, msg.Data)
	case "cancel_transfer":
		wc.handleCancelTransfer()
	case "ping":
		wc.send <- opcua.NewWSMessage("pong", nil)
	}
}

// handleSubscribe starts position streaming
func (wc *WSClient) handleSubscribe(h *OpcuaHandler, data json.RawMessage) {
	var req opcua.SubscribeRequest
	if data != nil {
		if err := json.Unmarshal(data, &req); err != nil {
			wc.safeSend(opcua.ErrorMessage(i18n.Notef("invalid subscribe request").Italian()))
			return
		}
	}
	if req.Interval == 0 {
		req.Interval = 100 // Default 100ms
	}

	// Stop existing stream if any
	wc.stopStream()

	// Require concrete client for streaming (type assertion)
	client, ok := h.client.(*opcua.Client)
	if !ok {
		wc.safeSend(opcua.ErrorMessage(i18n.Notef("position streaming is not available with this client").Italian()))
		return
	}

	// Create new stream
	wc.mu.Lock()
	wc.stream = opcua.NewPositionStream(client, req.Interval)
	wc.mu.Unlock()

	// Start streaming in background
	ctx := context.Background()
	go wc.stream.Start(ctx, func(m opcua.WSMessage) {
		wc.safeTrySend(m)
	})

	wc.safeSend(opcua.NewWSMessage("subscribed", map[string]int{"interval": req.Interval}))
}

// handleUnsubscribe stops position streaming
func (wc *WSClient) handleUnsubscribe() {
	wc.stopStream()
	wc.send <- opcua.NewWSMessage("unsubscribed", nil)
}

// handleCommand handles command requests
func (wc *WSClient) handleCommand(h *OpcuaHandler, data json.RawMessage) {
	var req opcua.CommandRequest
	if err := json.Unmarshal(data, &req); err != nil {
		wc.send <- opcua.ErrorMessage(i18n.Notef("invalid command request").Italian())
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch req.Action {
	case "connect":
		if err := h.client.Connect(ctx); err != nil {
			wc.send <- opcua.AckMessage("connect", false, wsFailure(i18n.Errorf("failed to connect to the PLC: %w", err)))
		} else {
			wc.send <- opcua.AckMessage("connect", true, i18n.Notef("connected").Italian())
			wc.send <- opcua.StatusMessage(true, h.configMgr.Get().Endpoint)
		}

	case "disconnect":
		if err := h.client.Disconnect(ctx); err != nil {
			wc.send <- opcua.AckMessage("disconnect", false, wsFailure(i18n.Errorf("failed to disconnect from the PLC: %w", err)))
		} else {
			wc.send <- opcua.AckMessage("disconnect", true, i18n.Notef("disconnected").Italian())
			wc.send <- opcua.StatusMessage(false, "")
		}

	case "send":
		if len(req.Commands) == 0 {
			wc.send <- opcua.AckMessage("send", false, i18n.Notef("no commands to send").Italian())
			return
		}

		// Auto-connect if needed
		if !h.client.IsConnected() {
			if err := h.client.Connect(ctx); err != nil {
				wc.send <- opcua.AckMessage("send", false, wsFailure(i18n.Errorf("failed to connect to the PLC: %w", err)))
				return
			}
		}

		cfg := h.configMgr.Get()
		if err := h.client.SendWithTrigger(ctx, req.Commands, cfg); err != nil {
			wc.send <- opcua.AckMessage("send", false, wsFailure(i18n.Errorf("failed to send the data: %w", err)))
		} else {
			wc.send <- opcua.AckMessage("send", true, i18n.Notef("commands sent").Italian())
		}

	default:
		wc.send <- opcua.ErrorMessage(i18n.Notef("unknown action: %s", req.Action).Italian())
	}
}

// stopStream stops the position stream
func (wc *WSClient) stopStream() {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	if wc.stream != nil {
		wc.stream.Stop()
		wc.stream = nil
	}
}

// cancelTransfer cancels any ongoing transfer
func (wc *WSClient) cancelTransfer() {
	wc.mu.Lock()
	defer wc.mu.Unlock()
	if wc.transfer != nil && wc.transfer.IsRunning() {
		wc.transfer.Cancel()
		wc.transfer = nil
	}
}

// TransferRequest represents a chunked transfer request
type TransferRequest struct {
	Commands []string `json:"commands"`
}

// handleTransfer starts async chunked transfer to PLC
func (wc *WSClient) handleTransfer(h *OpcuaHandler, data json.RawMessage) {
	var req TransferRequest
	if err := json.Unmarshal(data, &req); err != nil {
		wc.send <- opcua.ErrorMessage(i18n.Notef("invalid transfer request").Italian())
		return
	}

	if len(req.Commands) == 0 {
		wc.send <- opcua.ErrorMessage(i18n.Notef("no commands to transfer").Italian())
		return
	}

	// Require concrete client for chunked transfer (type assertion)
	client, ok := h.client.(*opcua.Client)
	if !ok {
		wc.send <- opcua.ErrorMessage(i18n.Notef("chunked transfer is not available with this client").Italian())
		return
	}

	// Check if transfer already running
	wc.mu.Lock()
	if wc.transfer != nil && wc.transfer.IsRunning() {
		wc.mu.Unlock()
		wc.send <- opcua.ErrorMessage(i18n.Notef("a transfer is already in progress").Italian())
		return
	}

	// Auto-connect if needed
	ctx := context.Background()
	if !h.client.IsConnected() {
		connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		if err := h.client.Connect(connectCtx); err != nil {
			cancel()
			wc.mu.Unlock()
			wc.send <- opcua.ErrorMessage(wsFailure(i18n.Errorf("failed to connect to the PLC: %w", err)))
			return
		}
		cancel()
	}

	// Create transfer
	cfg := h.configMgr.Get()
	wc.transfer = opcua.NewChunkedTransfer(client, cfg)
	wc.mu.Unlock()

	// Send start message
	totalChunks := (len(req.Commands) + cfg.ChunkSize - 1) / cfg.ChunkSize
	wc.send <- opcua.NewWSMessage("transfer_start", map[string]int{
		"totalChunks": totalChunks,
		"totalLines":  len(req.Commands),
	})

	// Start async transfer with progress callback
	// Use safeTrySend to prevent panic on closed channel if client disconnects
	err := wc.transfer.SendAsync(ctx, req.Commands, func(progress opcua.TransferProgress) {
		var msg opcua.WSMessage
		if progress.Err != nil {
			progress.Error = wsFailure(progress.Err)
			msg = opcua.NewWSMessage("transfer_error", progress)
		} else if progress.Done {
			msg = opcua.NewWSMessage("transfer_complete", progress)
		} else {
			msg = opcua.NewWSMessage("transfer_progress", progress)
		}
		wc.safeTrySend(msg)
	})

	if err != nil {
		wc.send <- opcua.ErrorMessage(wsFailure(err))
	}
}

// handleCancelTransfer cancels an ongoing transfer
func (wc *WSClient) handleCancelTransfer() {
	wc.mu.Lock()
	defer wc.mu.Unlock()

	if wc.transfer != nil && wc.transfer.IsRunning() {
		wc.transfer.Cancel()
		wc.send <- opcua.NewWSMessage("transfer_cancelled", nil)
	} else {
		wc.send <- opcua.ErrorMessage(i18n.Notef("no transfer in progress").Italian())
	}
}
