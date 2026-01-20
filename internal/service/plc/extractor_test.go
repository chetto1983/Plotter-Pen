package plc

import (
	"strings"
	"testing"

	"plotter-pen/pkg/geom"
)

// Helper to create float64 pointers
func pf(v float64) *float64 { return &v }

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
			X1:           pf(0),
			Y1:           pf(0),
			X2:           pf(100),
			Y2:           pf(0),
			Cx:           pf(50),
			Cy:           pf(0),
			Radius:       pf(50),
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
			X1:   pf(0),
			Y1:   pf(0),
			X2:   pf(100),
			Y2:   pf(100),
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
			Cx:     pf(50),
			Cy:     pf(50),
			Radius: pf(25),
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
			X1:   pf(0),
			Y1:   pf(0),
			X2:   pf(50),
			Y2:   pf(0),
		},
		{
			Type:         PrimitiveArc,
			ID:           "arc1",
			X1:           pf(50),
			Y1:           pf(0),
			X2:           pf(100),
			Y2:           pf(0),
			Cx:           pf(75),
			Cy:           pf(0),
			Radius:       pf(25),
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
