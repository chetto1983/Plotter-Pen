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
	client   *Client
	interval time.Duration
	stopCh   chan struct{}
	mu       sync.Mutex
	running  bool
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

// Start begins streaming position updates
func (s *PositionStream) Start(ctx context.Context, send func(WSMessage)) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.stopCh = make(chan struct{})
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
			if s.client.IsConnected() {
				pos, err := s.client.ReadPosition(ctx)
				if err == nil {
					send(WSMessage{
						Type: "position",
						Data: pos,
						Time: time.Now().UnixMilli(),
					})
				} else {
					send(WSMessage{
						Type: "error",
						Data: map[string]string{"message": err.Error()},
						Time: time.Now().UnixMilli(),
					})
				}
			}
		}
	}
}

// Stop stops the position stream
func (s *PositionStream) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running && s.stopCh != nil {
		close(s.stopCh)
		s.running = false
	}
}

// IsRunning returns whether the stream is running
func (s *PositionStream) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

// SetInterval updates the polling interval
func (s *PositionStream) SetInterval(intervalMs int) {
	interval := time.Duration(intervalMs) * time.Millisecond
	if interval < 50*time.Millisecond {
		interval = 50 * time.Millisecond
	}
	if interval > 1000*time.Millisecond {
		interval = 1000 * time.Millisecond
	}
	s.mu.Lock()
	s.interval = interval
	s.mu.Unlock()
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
func AckMessage(commandID string, success bool, message string) WSMessage {
	return NewWSMessage("ack", map[string]interface{}{
		"commandId": commandID,
		"success":   success,
		"message":   message,
	})
}

// ErrorMessage creates an error message
func ErrorMessage(message string) WSMessage {
	return NewWSMessage("error", map[string]string{"message": message})
}
