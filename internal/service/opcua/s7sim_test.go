//go:build s7sim

package opcua

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"plotter-pen/internal/persistence"
)

// TestChunkedTransfer_S7Sim runs the full chunked transfer against tools/s7sim/s7sim.py,
// which rejects writes carrying status/timestamps like a real S7-1500.
//
//	python tools/s7sim/s7sim.py
//	go test -tags=s7sim -run S7Sim -v ./internal/service/opcua/
func TestChunkedTransfer_S7Sim(t *testing.T) {
	endpoint := os.Getenv("S7SIM_ENDPOINT")
	if endpoint == "" {
		endpoint = "opc.tcp://127.0.0.1:4840"
	}

	db := setupTestDB(t)
	seedTestConfig(db, persistence.OPCUAConfig{
		Name:             "s7sim",
		IsActive:         true,
		Endpoint:         endpoint,
		NamespaceID:      4,
		PointArrayNode:   "ns=4;i=12",
		TriggerWriteNode: "ns=4;i=43",
		ReadDoneNode:     "ns=4;i=54",
		EndOfFileNode:    "ns=4;i=65",
		ChunkSize:        20,
		AckTimeout:       5000,
		PollInterval:     20,
		SecurityMode:     "None",
		SecurityPolicy:   "None",
	})
	cm := NewConfigManager(db)

	client := NewClient(cm)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("connect to %s: %v (is tools/s7sim/s7sim.py running?)", endpoint, err)
	}
	defer client.Disconnect(context.Background())

	// 45 commands in the pkg/plc/generator format -> 3 chunks, the last one partial
	lines := make([]string, 45)
	for i := range lines {
		lines[i] = fmt.Sprintf("L X %.3f, Y %.3f, Z %.3f, V %.3f", float64(i*2), float64(i%5), 0.0, 200.0)
	}

	result := make(chan TransferProgress, 1)
	transfer := NewChunkedTransfer(client, cm.Get())
	err := transfer.SendAsync(ctx, lines, func(p TransferProgress) {
		if p.Done || p.Error != "" {
			select {
			case result <- p:
			default:
			}
		}
	})
	if err != nil {
		t.Fatalf("SendAsync: %v", err)
	}

	select {
	case p := <-result:
		if p.Error != "" {
			t.Fatalf("transfer failed at chunk %d/%d: %s", p.Chunk, p.Total, p.Error)
		}
		if p.Chunk != 3 || p.Total != 3 {
			t.Fatalf("transfer done at chunk %d/%d, want 3/3", p.Chunk, p.Total)
		}
		t.Logf("transfer OK: %d lines in %d chunks, %.2fs", p.TotalLines, p.Total, p.Duration)
	case <-ctx.Done():
		t.Fatal("transfer did not finish within 60s")
	}

	eof, err := client.ReadBoolNode(ctx, "ns=4;i=65")
	if err != nil || !eof {
		t.Fatalf("End_Of_File = %v, err %v; want TRUE", eof, err)
	}
}
