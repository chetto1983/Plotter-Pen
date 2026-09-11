package opcua

import (
	"context"
	"sync"
	"time"
)

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type string      `json:"type"` // position, status, alarm, ack, error
	Data interface{} `json:"data"`
	Time int64       `json:"time"` // Unix timestamp milliseconds
}

// SubscribeRequest represents a subscription request from client
type SubscribeRequest struct {
	Interval int `json:"interval"` // Polling interval in milliseconds
}

// CommandRequest represents a command request from client
type CommandRequest struct {
	Action   string   `json:"action"`   // send, connect, disconnect
	Commands []string `json:"commands"` // For send action
}

// PositionStream handles real-time position streaming to WebSocket clients
type PositionStream struct {
	client       *Client
	interval     time.Duration
	stopCh       chan struct{}
	stopOnce     sync.Once // protects stopCh close
	mu           sync.Mutex
	running      bool
	lastNotified bool // last connection state sent to frontend
}

// NewPositionStream creates a new position stream
func NewPositionStream(client *Client, intervalMs int) *PositionStream {
	interval := time.Duration(intervalMs) * time.Millisecond
	if interval < 50*time.Millisecond {
		interval = 100 * time.Millisecond
	}
	if interval > 1000*time.Millisecond {
		interval = 1000 * time.Millisecond
	}

	return &PositionStream{
		client:   client,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

// Start begins streaming position updates. A stream runs once: after Stop, even a Stop that came
// before Start, it returns at once.
// Connection recovery is handled by gopcua's AutoReconnect — we just monitor state.
func (s *PositionStream) Start(ctx context.Context, send func(WSMessage)) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.lastNotified = true // assume connected at start
	s.mu.Unlock()

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.setRunning(false)
			return
		case <-s.stopCh:
			s.setRunning(false)
			return
		case <-ticker.C:
			connected := s.client.IsConnected()

			// Notify frontend on state change
			s.mu.Lock()
			changed := connected != s.lastNotified
			s.lastNotified = connected
			s.mu.Unlock()

			if changed {
				send(WSMessage{
					Type: "status",
					Data: map[string]interface{}{"connected": connected, "reconnected": connected},
					Time: time.Now().UnixMilli(),
				})
			}

			if !connected {
				continue // library auto-reconnects, just wait
			}

			readCtx, readCancel := context.WithTimeout(ctx, 3*time.Second)
			pos, err := s.client.ReadPosition(readCtx)
			readCancel()
			if err == nil {
				send(WSMessage{
					Type: "position",
					Data: pos,
					Time: time.Now().UnixMilli(),
				})
			}
		}
	}
}

// Stop stops the position stream. It also works before Start has run: the WebSocket handler
// launches Start in a goroutine and may stop the stream on disconnect before it begins.
func (s *PositionStream) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopCh)
	})
	s.setRunning(false)
}

// IsRunning returns whether the stream is running
func (s *PositionStream) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *PositionStream) setRunning(running bool) {
	s.mu.Lock()
	s.running = running
	s.mu.Unlock()
}

// NewWSMessage creates a new WebSocket message with current timestamp
func NewWSMessage(msgType string, data interface{}) WSMessage {
	return WSMessage{
		Type: msgType,
		Data: data,
		Time: time.Now().UnixMilli(),
	}
}

// PositionMessage creates a position message
func PositionMessage(pos Position) WSMessage {
	return NewWSMessage("position", pos)
}

// StatusMessage creates a status message
func StatusMessage(connected bool, endpoint string) WSMessage {
	return NewWSMessage("status", map[string]interface{}{
		"connected": connected,
		"endpoint":  endpoint,
	})
}

// AlarmMessage creates an alarm message
func AlarmMessage(code, message string) WSMessage {
	return NewWSMessage("alarm", map[string]string{
		"code":    code,
		"message": message,
	})
}

// AckMessage creates an acknowledgment message
func AckMessage(action string, success bool, message string) WSMessage {
	return NewWSMessage("ack", map[string]interface{}{
		"action":  action,
		"success": success,
		"message": message,
	})
}

// ErrorMessage creates an error message
func ErrorMessage(message string) WSMessage {
	return NewWSMessage("error", map[string]string{"message": message})
}
