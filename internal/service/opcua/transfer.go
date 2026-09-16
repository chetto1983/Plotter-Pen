package opcua

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// TransferProgress represents chunked transfer progress
type TransferProgress struct {
	Chunk      int     `json:"chunk"`
	Total      int     `json:"total"`
	Percent    int     `json:"percent"`
	TotalLines int     `json:"totalLines"`
	Done       bool    `json:"done"`
	Error      string  `json:"error,omitempty"`
	Duration   float64 `json:"duration,omitempty"` // seconds
}

// TransferState represents current transfer state
type TransferState int

// Transfer states from idle through completion, failure or cancellation.
const (
	TransferIdle TransferState = iota
	TransferRunning
	TransferComplete
	TransferError
	TransferCancelled
)

// ChunkedTransfer handles async chunked data transfer to PLC
type ChunkedTransfer struct {
	client       *Client
	config       Config
	state        TransferState
	stopCh       chan struct{}
	progressFunc func(TransferProgress)
	mu           sync.Mutex
	startTime    time.Time
	closeOnce    sync.Once // Prevents double-close panic
}

// NewChunkedTransfer creates a new chunked transfer service
func NewChunkedTransfer(client *Client, cfg Config) *ChunkedTransfer {
	if cfg.ChunkSize <= 0 {
		cfg.ChunkSize = 20
	}
	if cfg.AckTimeout <= 0 {
		cfg.AckTimeout = 5000
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 100
	}
	return &ChunkedTransfer{
		client: client,
		config: cfg,
		state:  TransferIdle,
	}
}

// IsRunning returns true if transfer is in progress
func (t *ChunkedTransfer) IsRunning() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.state == TransferRunning
}

// Cancel stops an ongoing transfer (safe to call multiple times)
func (t *ChunkedTransfer) Cancel() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.state == TransferRunning && t.stopCh != nil {
		t.closeOnce.Do(func() { close(t.stopCh) })
		t.state = TransferCancelled
	}
}

// SendAsync starts async chunked transfer with progress callback
func (t *ChunkedTransfer) SendAsync(ctx context.Context, data []string, progressFunc func(TransferProgress)) error {
	t.mu.Lock()
	if t.state == TransferRunning {
		t.mu.Unlock()
		return fmt.Errorf("transfer already in progress")
	}
	t.state = TransferRunning
	t.stopCh = make(chan struct{})
	t.closeOnce = sync.Once{} // Reset for new transfer
	t.progressFunc = progressFunc
	t.startTime = time.Now()
	t.mu.Unlock()

	go t.runTransfer(ctx, data)
	return nil
}

// runTransfer executes the chunked transfer
func (t *ChunkedTransfer) runTransfer(ctx context.Context, data []string) {
	totalChunks := (len(data) + t.config.ChunkSize - 1) / t.config.ChunkSize
	if totalChunks == 0 {
		totalChunks = 1
	}

	// Reset flags at start to ensure clean handshake state
	if err := t.client.WriteBoolNode(ctx, t.config.EndOfFileNode, false); err != nil {
		t.reportError(fmt.Sprintf("failed to reset EOF: %v", err), 0, totalChunks, len(data))
		return
	}
	if err := t.client.WriteBoolNode(ctx, t.config.ReadDoneNode, false); err != nil {
		t.reportError(fmt.Sprintf("failed to reset ReadDone: %v", err), 0, totalChunks, len(data))
		return
	}
	if err := t.client.WriteBoolNode(ctx, t.config.TriggerWriteNode, false); err != nil {
		t.reportError(fmt.Sprintf("failed to reset TriggerWrite: %v", err), 0, totalChunks, len(data))
		return
	}

	for chunkIdx := 0; chunkIdx < totalChunks; chunkIdx++ {
		select {
		case <-ctx.Done():
			t.reportError("context cancelled", chunkIdx, totalChunks, len(data))
			return
		case <-t.stopCh:
			t.reportError("transfer cancelled", chunkIdx, totalChunks, len(data))
			return
		default:
		}

		if err := t.sendChunk(ctx, data, chunkIdx, totalChunks); err != nil {
			t.reportError(err.Error(), chunkIdx, totalChunks, len(data))
			return
		}

		// Report progress
		t.reportProgress(chunkIdx+1, totalChunks, len(data), false)
	}

	// Set EndOfFile = TRUE
	if err := t.client.WriteBoolNode(ctx, t.config.EndOfFileNode, true); err != nil {
		t.reportError(fmt.Sprintf("failed to set EOF: %v", err), totalChunks, totalChunks, len(data))
		return
	}

	t.reportProgress(totalChunks, totalChunks, len(data), true)

	t.mu.Lock()
	t.state = TransferComplete
	t.mu.Unlock()
}

// sendChunk sends a single chunk and waits for PLC acknowledgment
func (t *ChunkedTransfer) sendChunk(ctx context.Context, data []string, chunkIdx, totalChunks int) error {
	start := chunkIdx * t.config.ChunkSize
	end := min(start+t.config.ChunkSize, len(data))

	chunk := data[start:end]
	paddedChunk := padToSize(chunk, t.config.ChunkSize)

	// 1. Write chunk to Point
	if err := t.client.WriteStringArray(ctx, t.config.PointArrayNode, paddedChunk); err != nil {
		return fmt.Errorf("failed to write chunk %d: %w", chunkIdx, err)
	}

	// 2. Set TriggerWrite = TRUE
	if err := t.client.WriteBoolNode(ctx, t.config.TriggerWriteNode, true); err != nil {
		return fmt.Errorf("failed to set trigger: %w", err)
	}

	// 3. Wait for Trigger_Read_Done = TRUE
	if err := t.waitForAck(ctx); err != nil {
		return fmt.Errorf("ack timeout on chunk %d: %w", chunkIdx, err)
	}

	// 4. Reset ReadDone = FALSE to prevent race condition on next chunk
	if err := t.client.WriteBoolNode(ctx, t.config.ReadDoneNode, false); err != nil {
		return fmt.Errorf("failed to reset ReadDone: %w", err)
	}

	// 5. Reset TriggerWrite = FALSE
	if err := t.client.WriteBoolNode(ctx, t.config.TriggerWriteNode, false); err != nil {
		return fmt.Errorf("failed to reset trigger: %w", err)
	}

	return nil
}

// waitForAck polls ReadDoneNode until TRUE or timeout
func (t *ChunkedTransfer) waitForAck(ctx context.Context) error {
	timeout := time.Duration(t.config.AckTimeout) * time.Millisecond
	pollInterval := time.Duration(t.config.PollInterval) * time.Millisecond

	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.stopCh:
			return fmt.Errorf("cancelled")
		case <-ticker.C:
			if time.Now().After(deadline) {
				return fmt.Errorf("timeout waiting for PLC ack")
			}

			done, err := t.client.ReadBoolNode(ctx, t.config.ReadDoneNode)
			if err != nil {
				return fmt.Errorf("failed to read ack: %w", err)
			}
			if done {
				return nil
			}
		}
	}
}

// reportProgress sends progress update to callback
func (t *ChunkedTransfer) reportProgress(chunk, total, totalLines int, done bool) {
	if t.progressFunc == nil {
		return
	}
	percent := 0
	if total > 0 {
		percent = chunk * 100 / total
	}
	t.progressFunc(TransferProgress{
		Chunk:      chunk,
		Total:      total,
		Percent:    percent,
		TotalLines: totalLines,
		Done:       done,
		Duration:   time.Since(t.startTime).Seconds(),
	})
}

// reportError sends error update to callback
func (t *ChunkedTransfer) reportError(errMsg string, chunk, total, totalLines int) {
	t.mu.Lock()
	t.state = TransferError
	t.mu.Unlock()

	if t.progressFunc != nil {
		t.progressFunc(TransferProgress{
			Chunk:      chunk,
			Total:      total,
			TotalLines: totalLines,
			Error:      errMsg,
			Duration:   time.Since(t.startTime).Seconds(),
		})
	}
}

// padToSize pads slice to specified size with empty strings
func padToSize(data []string, size int) []string {
	if len(data) >= size {
		return data[:size]
	}
	result := make([]string, size)
	copy(result, data)
	return result
}
