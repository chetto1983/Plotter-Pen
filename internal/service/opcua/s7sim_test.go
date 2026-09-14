//go:build s7sim

package opcua

import (
	"context"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"plotter-pen/internal/persistence"
	"plotter-pen/internal/service/cam"
	"plotter-pen/internal/service/plc"
)

// connectS7Sim connects to tools/s7sim/s7sim.py at S7SIM_ENDPOINT (default
// opc.tcp://127.0.0.1:4840) with the simulator's node IDs, never the PLC configured in a database.
func connectS7Sim(ctx context.Context, t *testing.T) (*Client, Config) {
	t.Helper()
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
		PositionXNode:    "ns=4;i=79",
		PositionYNode:    "ns=4;i=80",
		PositionZNode:    "ns=4;i=81",
		ChunkSize:        20,
		AckTimeout:       5000,
		PollInterval:     20,
		SecurityMode:     "None",
		SecurityPolicy:   "None",
	})
	cm := NewConfigManager(db)

	client := NewClient(cm)
	if err := client.Connect(ctx); err != nil {
		t.Fatalf("connect to %s: %v (is tools/s7sim/s7sim.py running?)", endpoint, err)
	}
	t.Cleanup(func() { client.Disconnect(context.Background()) })
	return client, cm.Get()
}

// sendS7Sim runs a chunked transfer and waits for it to finish, returning its last progress.
func sendS7Sim(ctx context.Context, t *testing.T, client *Client, cfg Config, lines []string) TransferProgress {
	t.Helper()
	result := make(chan TransferProgress, 1)
	transfer := NewChunkedTransfer(client, cfg)
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
		t.Logf("transfer OK: %d lines in %d chunks, %.2fs", p.TotalLines, p.Total, p.Duration)
		eof, err := client.ReadBoolNode(ctx, cfg.EndOfFileNode)
		if err != nil || !eof {
			t.Fatalf("End_Of_File = %v, err %v; want TRUE", eof, err)
		}
		return p
	case <-ctx.Done():
		t.Fatal("transfer did not finish in time")
	}
	return TransferProgress{}
}

// TestChunkedTransfer_S7Sim runs the full chunked transfer against tools/s7sim/s7sim.py,
// which rejects writes carrying status/timestamps like a real S7-1500.
//
//	python tools/s7sim/s7sim.py
//	go test -tags=s7sim -run S7Sim -v ./internal/service/opcua/
func TestChunkedTransfer_S7Sim(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, cfg := connectS7Sim(ctx, t)

	// 45 commands in the pkg/plc/generator format -> 3 chunks, the last one partial
	lines := make([]string, 45)
	for i := range lines {
		lines[i] = fmt.Sprintf("L X %.3f, Y %.3f, Z %.3f, V %.3f", float64(i*2), float64(i%5), 0.0, 200.0)
	}

	if p := sendS7Sim(ctx, t, client, cfg, lines); p.Chunk != 3 || p.Total != 3 {
		t.Fatalf("transfer done at chunk %d/%d, want 3/3", p.Chunk, p.Total)
	}
}

// TestProfileProgram_S7Sim sends the profile of a plate with a round hole to the simulator and
// waits for the program to run: the tool must reach the full depth and stop where the last
// command ends.
func TestProfileProgram_S7Sim(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, cfg := connectS7Sim(ctx, t)

	res, err := cam.Profile(cam.ProfileRequest{
		Primitives: []plc.Primitive{
			{Type: plc.PrimitiveRectangle, X: new(0.0), Y: new(0.0), Width: new(30.0), Height: new(20.0)},
			{Type: plc.PrimitiveCircle, Cx: new(15.0), Cy: new(10.0), Radius: new(5.0)},
		},
		DefaultSpeed: 200, RapidSpeed: 1000, SafeZ: 5, WorkZ: 0,
		ToolDiameter: 3, Side: cam.SideOutside, Depth: 1, StepDown: 0.5, PlungeSpeed: 20,
	})
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	last := res.Output[len(res.Output)-1]
	var want Position
	if _, err := fmt.Sscanf(last, "J X %f, Y %f, Z %f", &want.X, &want.Y, &want.Z); err != nil {
		t.Fatalf("last command %q: %v", last, err)
	}

	sendS7Sim(ctx, t, client, cfg, res.Output)

	// The axes may already rest at the final position from an earlier run: only a position seen
	// after the tool went down to the full depth proves that the program ran to its end.
	lowest := math.Inf(1)
	for {
		pos, err := client.ReadPosition(ctx)
		if err != nil {
			t.Fatalf("read position: %v", err)
		}
		lowest = math.Min(lowest, pos.Z)
		if lowest <= -1+1e-3 && math.Abs(pos.X-want.X) < 1e-3 && math.Abs(pos.Y-want.Y) < 1e-3 && math.Abs(pos.Z-want.Z) < 1e-3 {
			t.Logf("program of %d commands ran: lowest Z %.3f, stopped at %+v", res.Count, lowest, pos)
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("program did not end at %+v: position %+v, lowest Z %.3f", want, pos, lowest)
		case <-time.After(20 * time.Millisecond):
		}
	}
}
