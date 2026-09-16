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

// s7simNodeIDs are the node IDs of tools/s7sim/s7sim.py, different from the PLC's on purpose.
func s7simNodeIDs() persistence.OPCUAConfig {
	return persistence.OPCUAConfig{
		PointArrayNode:   "ns=4;i=12",
		TriggerWriteNode: "ns=4;i=43",
		ReadDoneNode:     "ns=4;i=54",
		EndOfFileNode:    "ns=4;i=65",
		PositionXNode:    "ns=4;i=79",
		PositionYNode:    "ns=4;i=80",
		PositionZNode:    "ns=4;i=81",
	}
}

// connectS7Sim connects to tools/s7sim/s7sim.py at S7SIM_ENDPOINT (default
// opc.tcp://127.0.0.1:4840) with the simulator's node IDs, never the PLC configured in a database.
func connectS7Sim(ctx context.Context, t *testing.T) (*Client, Config) {
	t.Helper()
	return connectS7SimNodes(ctx, t, s7simNodeIDs())
}

// connectS7SimNodes connects to the simulator with the given node addresses.
func connectS7SimNodes(ctx context.Context, t *testing.T, nodes persistence.OPCUAConfig) (*Client, Config) {
	t.Helper()
	endpoint := os.Getenv("S7SIM_ENDPOINT")
	if endpoint == "" {
		endpoint = "opc.tcp://127.0.0.1:4840"
	}

	nodes.Name = "s7sim"
	nodes.IsActive = true
	nodes.Endpoint = endpoint
	nodes.NamespaceID = 4
	nodes.ChunkSize = 20
	nodes.AckTimeout = 5000
	nodes.PollInterval = 20
	nodes.SecurityMode = "None"
	nodes.SecurityPolicy = "None"

	db := setupTestDB(t)
	seedTestConfig(db, nodes)
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
			t.Fatalf("EndOfFile = %v, err %v; want TRUE", eof, err)
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

// TestProfileProgram_S7Sim sends the profile of a plate with a round hole, entered along 3° ramps,
// to the simulator and waits for the program to run: the tool must reach the bottom of the cut and
// stop where the last command ends.
func TestProfileProgram_S7Sim(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, cfg := connectS7Sim(ctx, t)

	res, err := cam.Profile(cam.ProfileRequest{
		Primitives: []plc.Primitive{
			{Type: plc.PrimitiveRectangle, X: new(0.0), Y: new(0.0), Width: new(30.0), Height: new(20.0)},
			{Type: plc.PrimitiveCircle, Cx: new(15.0), Cy: new(10.0), Radius: new(5.0)},
		},
		// through a 0.8 mm piece on the bed at Z 0 and 0.2 mm into it
		DefaultSpeed: 200, RapidSpeed: 1000, SafeZ: 5, WorkZ: 0, Thickness: 0.8, Through: true, Overcut: 0.2,
		ToolDiameter: 3, Side: cam.SideOutside, StepDown: 0.5, PlungeSpeed: 20, RampAngle: 3,
	})
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}

	sendS7Sim(ctx, t, client, cfg, res.Output)
	waitForProgramEnd(ctx, t, client, res.Output, -0.2)
}

// TestDrillProgram_S7Sim sends a pecked drilling program to the simulator and checks that it runs
// to its last command, through the bottom of the holes.
func TestDrillProgram_S7Sim(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, cfg := connectS7Sim(ctx, t)

	res, err := cam.Drill(cam.DrillRequest{
		Primitives: []plc.Primitive{
			{Type: plc.PrimitiveCircle, Cx: new(10.0), Cy: new(5.0), Radius: new(0.5)},
			{Type: plc.PrimitiveCircle, Cx: new(12.54), Cy: new(5.0), Radius: new(0.5)},
			{Type: plc.PrimitiveCircle, Cx: new(20.0), Cy: new(10.0), Radius: new(1.6)},
		},
		// the dwell holds the drill at the bottom long enough for the 20 ms position polls to see it
		WaitTime: 300, RapidSpeed: 1000, SafeZ: 5, WorkZ: 0, PlungeSpeed: 20, RetractClearance: 1,
		Thickness: 1.6, Through: true, Overcut: 0.2,
		DrillDiameter: 1, MinHoleDiameter: 0.4, MaxHoleDiameter: 1.2, PeckDepth: 0.8, TipThrough: true,
	})
	if err != nil {
		t.Fatalf("Drill: %v", err)
	}

	sendS7Sim(ctx, t, client, cfg, res.Output)
	// through the 1.6 mm piece on the bed at Z 0, 0.2 mm into the bed and the 0.300 mm point of a
	// 1 mm 118° drill further
	waitForProgramEnd(ctx, t, client, res.Output, -0.5)
}

// waitForProgramEnd waits until the axes rest at the position of the last command of program.
// The axes may already rest there from an earlier run: only a position seen after the tool went
// down to bottom proves that the program ran to its end.
func waitForProgramEnd(ctx context.Context, t *testing.T, client *Client, program []string, bottom float64) {
	t.Helper()
	last := program[len(program)-1]
	var want Position
	if _, err := fmt.Sscanf(last, "J X %f, Y %f, Z %f", &want.X, &want.Y, &want.Z); err != nil {
		t.Fatalf("last command %q: %v", last, err)
	}

	lowest := math.Inf(1)
	for {
		pos, err := client.ReadPosition(ctx)
		if err != nil {
			t.Fatalf("read position: %v", err)
		}
		lowest = math.Min(lowest, pos.Z)
		if lowest <= bottom+1e-3 && math.Abs(pos.X-want.X) < 1e-3 && math.Abs(pos.Y-want.Y) < 1e-3 && math.Abs(pos.Z-want.Z) < 1e-3 {
			t.Logf("program of %d commands ran: lowest Z %.3f, stopped at %+v", len(program), lowest, pos)
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("program did not end at %+v: position %+v, lowest Z %.3f", want, pos, lowest)
		case <-time.After(20 * time.Millisecond):
		}
	}
}

// TestNamedNodes_S7Sim addresses the simulator by the names of the PLC variables, as the app
// is configured out of the box. The simulator numbers the same variables differently from the
// PLC, so a transfer that arrives here proves the names were resolved on the server.
func TestNamedNodes_S7Sim(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, cfg := connectS7SimNodes(ctx, t, persistence.OPCUAConfig{
		PointArrayNode:   "ServerInterfaces/Com/Point",
		TriggerWriteNode: "ServerInterfaces/Com/TriggerWrite",
		ReadDoneNode:     "ServerInterfaces/Com/ReadDone",
		EndOfFileNode:    "ServerInterfaces/Com/EndOfFile",
		PositionXNode:    "ServerInterfaces/Com/Pos/X",
		PositionYNode:    "ServerInterfaces/Com/Pos/Y",
		PositionZNode:    "ServerInterfaces/Com/Pos/Z",
	})

	lines := make([]string, 25)
	for i := range lines {
		lines[i] = fmt.Sprintf("L X %.3f, Y %.3f, Z %.3f, V %.3f", float64(i), 0.0, 0.0, 200.0)
	}
	if p := sendS7Sim(ctx, t, client, cfg, lines); p.Chunk != 2 || p.Total != 2 {
		t.Fatalf("transfer done at chunk %d/%d, want 2/2", p.Chunk, p.Total)
	}

	for _, address := range []string{cfg.PositionXNode, cfg.PositionYNode, cfg.PositionZNode} {
		if _, err := client.ReadNode(ctx, address); err != nil {
			t.Errorf("reading %s: %v", address, err)
		}
	}
}
