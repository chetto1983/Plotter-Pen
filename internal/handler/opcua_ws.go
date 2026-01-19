package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

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
			for _, a := range strings.Split(allowed, ",") {
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
	conn     *websocket.Conn
	send     chan opcua.WSMessage
	stream   *opcua.PositionStream
	transfer *opcua.ChunkedTransfer
	mu       sync.Mutex
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
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many WebSocket connections"})
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
		wc.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-wc.send:
			wc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				wc.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := wc.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ticker.C:
			wc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := wc.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readPump reads messages from WebSocket client
func (wc *WSClient) readPump(h *OpcuaHandler) {
	defer func() {
		wc.stopStream()
		wc.cancelTransfer()
		close(wc.send)
		wc.conn.Close()
	}()

	wc.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	wc.conn.SetPongHandler(func(string) error {
		wc.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Send initial status
	wc.send <- opcua.StatusMessage(h.client.IsConnected(), h.configMgr.Get().Endpoint)

	for {
		var msg InboundMessage
		if err := wc.conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				// Log error if needed
			}
			return
		}

		wc.handleMessage(h, msg)
	}
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
		json.Unmarshal(data, &req)
	}
	if req.Interval == 0 {
		req.Interval = 100 // Default 100ms
	}

	// Stop existing stream if any
	wc.stopStream()

	// Create new stream
	wc.mu.Lock()
	wc.stream = opcua.NewPositionStream(h.client, req.Interval)
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
		wc.send <- opcua.ErrorMessage("invalid command request")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch req.Action {
	case "connect":
		if err := h.client.Connect(ctx); err != nil {
			wc.send <- opcua.AckMessage("connect", false, err.Error())
		} else {
			wc.send <- opcua.AckMessage("connect", true, "connected")
			wc.send <- opcua.StatusMessage(true, h.configMgr.Get().Endpoint)
		}

	case "disconnect":
		if err := h.client.Disconnect(ctx); err != nil {
			wc.send <- opcua.AckMessage("disconnect", false, err.Error())
		} else {
			wc.send <- opcua.AckMessage("disconnect", true, "disconnected")
			wc.send <- opcua.StatusMessage(false, "")
		}

	case "send":
		if len(req.Commands) == 0 {
			wc.send <- opcua.AckMessage("send", false, "no commands provided")
			return
		}

		// Auto-connect if needed
		if !h.client.IsConnected() {
			if err := h.client.Connect(ctx); err != nil {
				wc.send <- opcua.AckMessage("send", false, "connection failed: "+err.Error())
				return
			}
		}

		cfg := h.configMgr.Get()
		if err := h.client.SendWithTrigger(ctx, req.Commands, cfg); err != nil {
			wc.send <- opcua.AckMessage("send", false, err.Error())
		} else {
			wc.send <- opcua.AckMessage("send", true, "commands sent")
		}

	default:
		wc.send <- opcua.ErrorMessage("unknown action: " + req.Action)
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
		wc.send <- opcua.ErrorMessage("invalid transfer request")
		return
	}

	if len(req.Commands) == 0 {
		wc.send <- opcua.ErrorMessage("no commands to transfer")
		return
	}

	// Check if transfer already running
	wc.mu.Lock()
	if wc.transfer != nil && wc.transfer.IsRunning() {
		wc.mu.Unlock()
		wc.send <- opcua.ErrorMessage("transfer already in progress")
		return
	}

	// Auto-connect if needed
	ctx := context.Background()
	if !h.client.IsConnected() {
		connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		if err := h.client.Connect(connectCtx); err != nil {
			cancel()
			wc.mu.Unlock()
			wc.send <- opcua.ErrorMessage("connection failed: " + err.Error())
			return
		}
		cancel()
	}

	// Create transfer
	cfg := h.configMgr.Get()
	wc.transfer = opcua.NewChunkedTransfer(h.client, cfg)
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
		if progress.Error != "" {
			msg = opcua.NewWSMessage("transfer_error", progress)
		} else if progress.Done {
			msg = opcua.NewWSMessage("transfer_complete", progress)
		} else {
			msg = opcua.NewWSMessage("transfer_progress", progress)
		}
		wc.safeTrySend(msg)
	})

	if err != nil {
		wc.send <- opcua.ErrorMessage(err.Error())
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
		wc.send <- opcua.ErrorMessage("no transfer in progress")
	}
}
