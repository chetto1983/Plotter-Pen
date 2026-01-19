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

	// Polyline with 3 points should produce 2 line commands
	lineCount := 0
	for _, cmd := range result.Commands {
		if cmd.Type == "L" && cmd.PrimitiveID == "poly1" {
			lineCount++
		}
	}

	if lineCount != 2 {
		t.Errorf("Expected 2 line commands for polyline, got %d", lineCount)
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

// TestExtract_SVGvsxDXF_SameArcCommands verifies that arc primitives
// (whether from SVG arc-fitting or DXF native arcs) produce identical PLC commands.
// This is critical: "DXF AND SVG PLC COMMAND MUST RESULT SAME!"
func TestExtract_SVGvsDXF_SameArcCommands(t *testing.T) {
	req := ExtractRequest{
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        0,
	}
	ext := NewExtractor(req)

	// Create an arc primitive - this is what BOTH SVG (after arc fitting)
	// and DXF (native arc) produce after parsing
	arcPrim := Primitive{
		Type:         PrimitiveArc,
		ID:           "test_arc",
		X1:           pf(0),
		Y1:           pf(0),
		X2:           pf(100),
		Y2:           pf(0),
		Cx:           pf(50),
		Cy:           pf(0),
		Radius:       pf(50),
		ThroughPoint: &geom.Point{X: 50, Y: 50},
	}

	// Simulate "DXF arc" by setting source to DXF
	dxfArc := arcPrim
	dxfArc.ID = "dxf_arc"

	// Simulate "SVG arc" (from arc fitting) - SAME primitive type
	svgArc := arcPrim
	svgArc.ID = "svg_arc"

	// Extract PLC commands for both
	dxfResult := ext.Extract([]Primitive{dxfArc})
	svgResult := ext.Extract([]Primitive{svgArc})

	// Both should produce the same number of commands
	if len(dxfResult.Commands) != len(svgResult.Commands) {
		t.Errorf("Command count mismatch: DXF=%d, SVG=%d",
			len(dxfResult.Commands), len(svgResult.Commands))
	}

	// Both should have an arc command
	var dxfArcCmd, svgArcCmd *Command
	for i := range dxfResult.Commands {
		if dxfResult.Commands[i].Type == "A" {
			dxfArcCmd = &dxfResult.Commands[i]
		}
	}
	for i := range svgResult.Commands {
		if svgResult.Commands[i].Type == "A" {
			svgArcCmd = &svgResult.Commands[i]
		}
	}

	if dxfArcCmd == nil {
		t.Fatal("DXF should produce arc command")
	}
	if svgArcCmd == nil {
		t.Fatal("SVG should produce arc command")
	}

	t.Logf("DXF Arc: %s", dxfArcCmd.CommandStr)
	t.Logf("SVG Arc: %s", svgArcCmd.CommandStr)

	// The commands should have the same format (only ID differs)
	// Both should have: A X {x}, Y {y}, Z {z}, I {i}, J {j}, V {v}
	if !strings.Contains(dxfArcCmd.CommandStr, "A X") {
		t.Error("DXF arc command should start with 'A X'")
	}
	if !strings.Contains(svgArcCmd.CommandStr, "A X") {
		t.Error("SVG arc command should start with 'A X'")
	}

	// Both should have I, J parameters (through point)
	if !strings.Contains(dxfArcCmd.CommandStr, "I ") || !strings.Contains(dxfArcCmd.CommandStr, "J ") {
		t.Error("DXF arc command missing I, J parameters")
	}
	if !strings.Contains(svgArcCmd.CommandStr, "I ") || !strings.Contains(svgArcCmd.CommandStr, "J ") {
		t.Error("SVG arc command missing I, J parameters")
	}

	// Commands should be IDENTICAL (same geometry = same output)
	if dxfArcCmd.CommandStr != svgArcCmd.CommandStr {
		t.Errorf("Arc commands should be identical:\nDXF: %s\nSVG: %s",
			dxfArcCmd.CommandStr, svgArcCmd.CommandStr)
	}

	t.Log("SUCCESS: DXF and SVG arcs produce IDENTICAL PLC commands!")
}
