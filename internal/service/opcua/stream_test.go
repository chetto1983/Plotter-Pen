package opcua

import (
	"context"
	"testing"
	"time"
)

// The WebSocket handler launches the stream with `go Start` and its reader may call Stop, on a
// disconnect, before that goroutine has run: Start must then return instead of streaming for
// the life of the process.
func TestPositionStream_StopBeforeStartEndsStream(t *testing.T) {
	s := NewPositionStream(&Client{}, 100)
	s.Stop()

	done := make(chan struct{})
	go func() {
		s.Start(context.Background(), func(WSMessage) {})
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Start kept streaming after Stop")
	}
}
