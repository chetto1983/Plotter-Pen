package opcua

import (
	"context"
	"sync"
	"testing"
	"time"
)

// silentPLC keeps the handshake flags of a PLC that never acknowledges a chunk.
// Like the real client, it refuses to write once the request's context is over.
type silentPLC struct {
	mu    sync.Mutex
	flags map[string]bool
}

func (p *silentPLC) WriteBoolNode(ctx context.Context, node string, value bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.flags[node] = value
	return nil
}

func (p *silentPLC) ReadBoolNode(ctx context.Context, node string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.flags[node], nil
}

func (p *silentPLC) WriteStringArray(ctx context.Context, _ string, _ []string) error {
	return ctx.Err()
}

func (p *silentPLC) flag(node string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.flags[node]
}

// waitFor polls the condition, which the transfer's goroutine makes true.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("%s did not happen", what)
		}
		time.Sleep(time.Millisecond)
	}
}

// A chunk the PLC does not acknowledge leaves the trigger down, whatever ended the wait:
// a trigger left up would tell the PLC a chunk is pending until the next program resets it.
func TestChunkedTransfer_UnacknowledgedChunkLowersTheTrigger(t *testing.T) {
	cases := []struct {
		name       string
		ackTimeout int
		stop       func(transfer *ChunkedTransfer, cancel context.CancelFunc)
	}{
		{name: "ack timeout", ackTimeout: 30, stop: func(*ChunkedTransfer, context.CancelFunc) {}},
		{name: "transfer cancelled", ackTimeout: 5000, stop: func(tr *ChunkedTransfer, _ context.CancelFunc) { tr.Cancel() }},
		{name: "context cancelled", ackTimeout: 5000, stop: func(_ *ChunkedTransfer, cancel context.CancelFunc) { cancel() }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			plc := &silentPLC{flags: map[string]bool{}}
			transfer := NewChunkedTransfer(plc, Config{
				PointArrayNode:   "point",
				TriggerWriteNode: "trigger",
				ReadDoneNode:     "done",
				EndOfFileNode:    "eof",
				AckTimeout:       tc.ackTimeout,
				PollInterval:     5,
			})
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			failed := make(chan TransferProgress, 1)
			err := transfer.SendAsync(ctx, []string{"J X 0.000, Y 0.000, Z 5.000, V 1000.000"}, func(p TransferProgress) {
				if p.Error != "" {
					failed <- p
				}
			})
			if err != nil {
				t.Fatal(err)
			}
			waitFor(t, "the trigger going up", func() bool { return plc.flag("trigger") })
			tc.stop(transfer, cancel)

			select {
			case p := <-failed:
				if p.Done {
					t.Errorf("a failed transfer is not done: %+v", p)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("the transfer did not report the failure")
			}
			if plc.flag("trigger") {
				t.Error("TriggerWrite is still TRUE after the failed chunk")
			}
			if plc.flag("eof") {
				t.Error("EndOfFile is TRUE after a failed transfer")
			}
		})
	}
}
