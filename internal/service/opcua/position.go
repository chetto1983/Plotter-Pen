package opcua

import (
	"context"
	"fmt"
	"time"

	"plotter-pen/internal/i18n"
)

// Position represents current machine position
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// MachineStatus represents current machine state
type MachineStatus struct {
	Position  Position `json:"position"`
	Status    string   `json:"status"`
	Alarm     string   `json:"alarm"`
	Progress  float64  `json:"progress"`
	Connected bool     `json:"connected"`
}

// PositionCallback is called when position updates
type PositionCallback func(pos Position)

// ReadPosition reads current X, Y, Z position from configured nodes
func (c *Client) ReadPosition(ctx context.Context) (Position, error) {
	cfg := c.config.Get()
	pos := Position{}

	// Read X
	if cfg.PositionXNode != "" {
		val, err := c.ReadNode(ctx, cfg.PositionXNode)
		if err != nil {
			return pos, i18n.Errorf("failed to read the position %s: %w", "X", err)
		}
		pos.X = toFloat64(val)
	}

	// Read Y
	if cfg.PositionYNode != "" {
		val, err := c.ReadNode(ctx, cfg.PositionYNode)
		if err != nil {
			return pos, i18n.Errorf("failed to read the position %s: %w", "Y", err)
		}
		pos.Y = toFloat64(val)
	}

	// Read Z
	if cfg.PositionZNode != "" {
		val, err := c.ReadNode(ctx, cfg.PositionZNode)
		if err != nil {
			return pos, i18n.Errorf("failed to read the position %s: %w", "Z", err)
		}
		pos.Z = toFloat64(val)
	}

	return pos, nil
}

// GetMachineStatus reads complete machine status
func (c *Client) GetMachineStatus(ctx context.Context) MachineStatus {
	cfg := c.config.Get()
	status := MachineStatus{
		Connected: c.IsConnected(),
	}

	if !status.Connected {
		return status
	}

	// Read position
	status.Position, _ = c.ReadPosition(ctx)

	// Read status node
	if cfg.StatusNode != "" {
		if val, err := c.ReadNode(ctx, cfg.StatusNode); err == nil {
			status.Status = fmt.Sprintf("%v", val)
		}
	}

	// Read alarm node
	if cfg.AlarmNode != "" {
		if val, err := c.ReadNode(ctx, cfg.AlarmNode); err == nil {
			status.Alarm = fmt.Sprintf("%v", val)
		}
	}

	// Read progress node
	if cfg.ProgressNode != "" {
		if val, err := c.ReadNode(ctx, cfg.ProgressNode); err == nil {
			status.Progress = toFloat64(val)
		}
	}

	return status
}

// SetPositionCallback sets callback for position updates
func (c *Client) SetPositionCallback(cb PositionCallback) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.posCallback = cb
}

// StartPositionPolling starts polling position at configured interval
func (c *Client) StartPositionPolling(ctx context.Context) {
	cfg := c.config.Get()
	interval := time.Duration(cfg.SubscriptionInterval) * time.Millisecond
	if interval < 50*time.Millisecond {
		interval = 100 * time.Millisecond
	}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-c.stopCh:
				return
			case <-ticker.C:
				if c.IsConnected() && c.posCallback != nil {
					if pos, err := c.ReadPosition(ctx); err == nil {
						c.posCallback(pos)
					}
				}
			}
		}
	}()
}

// StopPositionPolling stops position polling
func (c *Client) StopPositionPolling() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.stopCh != nil {
		c.stopOnce.Do(func() {
			close(c.stopCh)
		})
		c.stopCh = nil
	}
}

// toFloat64 converts interface to float64
func toFloat64(v any) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int32:
		return float64(val)
	case int64:
		return float64(val)
	default:
		return 0
	}
}
