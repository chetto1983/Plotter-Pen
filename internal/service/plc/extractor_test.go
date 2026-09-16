package plc

import (
	"math"
	"strings"
	"testing"

	"plotter-pen/pkg/geom"
)

func TestExtract_Arc(t *testing.T) {
	req := ExtractRequest{
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        0,
	}
	ext := NewExtractor(req)

	prims := []Primitive{
		{
			Type:         PrimitiveArc,
			ID:           "arc1",
			X1:           new(0.0),
			Y1:           new(0.0),
			X2:           new(100.0),
			Y2:           new(0.0),
			Cx:           new(50.0),
			Cy:           new(0.0),
			Radius:       new(50.0),
			ThroughPoint: &geom.Point{X: 50, Y: 50},
		},
	}

	result := ext.Extract(prims)

	t.Logf("Generated %d commands", len(result.Commands))
	for i, cmd := range result.Commands {
		t.Logf("  [%d] %s: %s", i, cmd.Type, cmd.CommandStr)
	}

	// Should have: J (jump to start), L (lower), A (arc), J (raise)
	hasArc := false
	for _, cmd := range result.Commands {
		if cmd.Type == "A" {
			hasArc = true
			// Verify arc command has I, J parameters (through point)
			if !strings.Contains(cmd.CommandStr, "I ") || !strings.Contains(cmd.CommandStr, "J ") {
				t.Error("Arc command missing I, J parameters")
			}
		}
	}

	if !hasArc {
		t.Error("Expected arc command (A) in output")
	}
}

func TestExtract_Line(t *testing.T) {
	req := ExtractRequest{
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        0,
	}
	ext := NewExtractor(req)

	prims := []Primitive{
		{
			Type: PrimitiveLine,
			ID:   "line1",
			X1:   new(0.0),
			Y1:   new(0.0),
			X2:   new(100.0),
			Y2:   new(100.0),
		},
	}

	result := ext.Extract(prims)

	t.Logf("Generated %d commands", len(result.Commands))

	hasLine := false
	for _, cmd := range result.Commands {
		if cmd.Type == "L" && cmd.PrimitiveID == "line1" {
			hasLine = true
		}
	}

	if !hasLine {
		t.Error("Expected line command (L) in output")
	}
}

func TestExtract_Circle(t *testing.T) {
	req := ExtractRequest{
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        0,
	}
	ext := NewExtractor(req)

	prims := []Primitive{
		{
			Type:   PrimitiveCircle,
			ID:     "circle1",
			Cx:     new(50.0),
			Cy:     new(50.0),
			Radius: new(25.0),
		},
	}

	result := ext.Extract(prims)

	t.Logf("Generated %d commands", len(result.Commands))

	// Circle should produce 2 arc commands (semicircles)
	arcCount := 0
	for _, cmd := range result.Commands {
		if cmd.Type == "A" {
			arcCount++
		}
	}

	if arcCount != 2 {
		t.Errorf("Expected 2 arc commands for circle, got %d", arcCount)
	}
}

func TestExtract_Polyline(t *testing.T) {
	req := ExtractRequest{
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        0,
	}
	ext := NewExtractor(req)

	prims := []Primitive{
		{
			Type: PrimitivePolyline,
			ID:   "poly1",
			Points: []geom.Point{
				{X: 0, Y: 0},
				{X: 100, Y: 0},
				{X: 100, Y: 100},
			},
		},
	}

	result := ext.Extract(prims)

	t.Logf("Generated %d commands", len(result.Commands))

	// Polyline with 3 points should produce:
	// - 1 L for initial pen down (Z positioning)
	// - 2 L for drawing segments (3 points = 2 segments)
	lineCount := 0
	for _, cmd := range result.Commands {
		if cmd.Type == "L" && cmd.PrimitiveID == "poly1" {
			lineCount++
		}
	}

	if lineCount != 3 {
		t.Errorf("Expected 3 line commands for polyline (1 pen down + 2 segments), got %d", lineCount)
	}
}

func TestExtract_MixedPrimitives(t *testing.T) {
	req := ExtractRequest{
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        0,
	}
	ext := NewExtractor(req)

	prims := []Primitive{
		{
			Type: PrimitiveLine,
			ID:   "line1",
			X1:   new(0.0),
			Y1:   new(0.0),
			X2:   new(50.0),
			Y2:   new(0.0),
		},
		{
			Type:         PrimitiveArc,
			ID:           "arc1",
			X1:           new(50.0),
			Y1:           new(0.0),
			X2:           new(100.0),
			Y2:           new(0.0),
			Cx:           new(75.0),
			Cy:           new(0.0),
			Radius:       new(25.0),
			ThroughPoint: &geom.Point{X: 75, Y: 25},
		},
	}

	result := ext.Extract(prims)

	t.Logf("Generated %d commands", len(result.Commands))
	t.Logf("Output: %v", result.Output)

	// Should have both L and A commands
	hasLine := false
	hasArc := false
	for _, cmd := range result.Commands {
		if cmd.Type == "L" && cmd.PrimitiveID == "line1" {
			hasLine = true
		}
		if cmd.Type == "A" && cmd.PrimitiveID == "arc1" {
			hasArc = true
		}
	}

	if !hasLine {
		t.Error("Expected line command")
	}
	if !hasArc {
		t.Error("Expected arc command")
	}
}

// TestArcAuxPoint_NoThroughNoSweep_CounterClockwise covers the case that used
// to fall through to returning the arc centre: no ThroughPoint and no Sweep.
// The PLC's A command reads I/J as a through point (start, through, end
// define the arc), so the aux point must lie ON the arc, not at its centre.
func TestArcAuxPoint_NoThroughNoSweep_CounterClockwise(t *testing.T) {
	// Quarter circle centered at origin, radius 10: start at 0deg, end at 90deg.
	// IsClockwise defaults to false (CCW), so the short 90 degree arc applies.
	prim := Primitive{
		Type: PrimitiveArc,
		X1:   new(10.0),
		Y1:   new(0.0),
		X2:   new(0.0),
		Y2:   new(10.0),
		Cx:   new(0.0),
		Cy:   new(0.0),
	}

	aux, ok := arcAuxPoint(prim)
	if !ok {
		t.Fatal("expected arcAuxPoint to succeed")
	}

	wantX, wantY := 10*math.Cos(math.Pi/4), 10*math.Sin(math.Pi/4)
	if math.Abs(aux.X-wantX) > 1e-9 || math.Abs(aux.Y-wantY) > 1e-9 {
		t.Errorf("aux point = (%v, %v), want (%v, %v)", aux.X, aux.Y, wantX, wantY)
	}

	// The pre-fix bug returned geom.Point{X: cx, Y: cy} = (0,0), which is not
	// on the arc at all (distance 0 from centre instead of the radius).
	distFromCenter := math.Hypot(aux.X, aux.Y)
	if math.Abs(distFromCenter-10) > 1e-9 {
		t.Errorf("aux point is not on the arc: distance from centre = %v, want 10", distFromCenter)
	}
}

// TestArcAuxPoint_NoThroughNoSweep_Clockwise uses the same start/end/centre
// as the CCW case above but flips IsClockwise, which must select the other
// (270 degree) arc between the same two points.
func TestArcAuxPoint_NoThroughNoSweep_Clockwise(t *testing.T) {
	prim := Primitive{
		Type:        PrimitiveArc,
		X1:          new(10.0),
		Y1:          new(0.0),
		X2:          new(0.0),
		Y2:          new(10.0),
		Cx:          new(0.0),
		Cy:          new(0.0),
		IsClockwise: true,
	}

	aux, ok := arcAuxPoint(prim)
	if !ok {
		t.Fatal("expected arcAuxPoint to succeed")
	}

	wantX, wantY := 10*math.Cos(-3*math.Pi/4), 10*math.Sin(-3*math.Pi/4)
	if math.Abs(aux.X-wantX) > 1e-9 || math.Abs(aux.Y-wantY) > 1e-9 {
		t.Errorf("aux point = (%v, %v), want (%v, %v)", aux.X, aux.Y, wantX, wantY)
	}
}

// TestArcAuxPoint_DegenerateRadius_ReportsImpossible covers the case where
// the start point coincides with the centre: there is no radius, so no point
// on the arc can be derived. arcAuxPoint must report failure instead of
// silently returning a wrong point.
func TestArcAuxPoint_DegenerateRadius_ReportsImpossible(t *testing.T) {
	prim := Primitive{
		Type: PrimitiveArc,
		X1:   new(5.0),
		Y1:   new(5.0),
		X2:   new(10.0),
		Y2:   new(5.0),
		Cx:   new(5.0),
		Cy:   new(5.0),
	}

	if _, ok := arcAuxPoint(prim); ok {
		t.Error("expected arcAuxPoint to report failure for a zero-radius arc")
	}
}

// TestExtract_Arc_NoThroughNoSweep_UsesPointOnArc is the end-to-end
// regression: without ThroughPoint or Sweep, the emitted A command's I/J
// must be a point on the arc, not the arc centre (0,0 in this fixture).
func TestExtract_Arc_NoThroughNoSweep_UsesPointOnArc(t *testing.T) {
	req := ExtractRequest{DefaultSpeed: 100, RapidSpeed: 1000, SafeZ: 5, WorkZ: 0}
	ext := NewExtractor(req)

	prims := []Primitive{
		{
			Type:   PrimitiveArc,
			ID:     "arc1",
			X1:     new(10.0),
			Y1:     new(0.0),
			X2:     new(0.0),
			Y2:     new(10.0),
			Cx:     new(0.0),
			Cy:     new(0.0),
			Radius: new(10.0),
		},
	}

	result := ext.Extract(prims)

	found := false
	for _, cmd := range result.Commands {
		if cmd.Type != "A" || cmd.PrimitiveID != "arc1" {
			continue
		}
		found = true
		if strings.Contains(cmd.CommandStr, "I 0.000, J 0.000") {
			t.Errorf("A command uses the arc centre as aux point: %s", cmd.CommandStr)
		}
	}
	if !found {
		t.Fatal("expected an A command for arc1")
	}
}
