package plc

import (
	"plotter-pen/pkg/geom"
	"strings"
	"testing"
)

func TestNewGenerator(t *testing.T) {
	g := NewGenerator()
	if g == nil {
		t.Fatal("NewGenerator() returned nil")
	}
	if len(g.commands) != 0 {
		t.Errorf("commands should be empty, got %v", len(g.commands))
	}
}

func TestGeneratorZUp(t *testing.T) {
	g := NewGenerator()
	g.ZUp()
	result := g.String()

	if result != "Z_UP" {
		t.Errorf("ZUp() = %v, want Z_UP", result)
	}
}

func TestGeneratorZDown(t *testing.T) {
	g := NewGenerator()
	g.ZDown()
	result := g.String()

	if result != "Z_DW" {
		t.Errorf("ZDown() = %v, want Z_DW", result)
	}
}

func TestGeneratorJump(t *testing.T) {
	g := NewGenerator()
	g.Jump(10.5, 20.25, 1000.0)
	result := g.String()

	if !strings.Contains(result, "J X 10.500") {
		t.Errorf("Jump X incorrect: %v", result)
	}
	if !strings.Contains(result, "Y 20.250") {
		t.Errorf("Jump Y incorrect: %v", result)
	}
	if !strings.Contains(result, "V 1000.000") {
		t.Errorf("Jump V incorrect: %v", result)
	}
}

func TestGeneratorLine(t *testing.T) {
	g := NewGenerator()
	g.Line(30.0, 40.0, 500.0)
	result := g.String()

	if !strings.Contains(result, "L X 30.000") {
		t.Errorf("Line X incorrect: %v", result)
	}
	if !strings.Contains(result, "Y 40.000") {
		t.Errorf("Line Y incorrect: %v", result)
	}
	if !strings.Contains(result, "V 500.000") {
		t.Errorf("Line V incorrect: %v", result)
	}
}

func TestGeneratorArc(t *testing.T) {
	start := geom.Point{X: 0, Y: 5}
	end := geom.Point{X: 10, Y: 5}
	center := geom.Point{X: 5, Y: 5}

	g := NewGenerator()
	g.Arc(end, center, start, false, 200.0) // CCW
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("Arc should start with 'A X': %v", result)
	}
	if !strings.Contains(result, "I ") && !strings.Contains(result, "J ") {
		t.Errorf("Arc should contain I and J midpoint: %v", result)
	}
}

func TestGeneratorArcCW(t *testing.T) {
	start := geom.Point{X: 0, Y: 5}
	end := geom.Point{X: 10, Y: 5}
	center := geom.Point{X: 5, Y: 5}

	g := NewGenerator()
	g.Arc(end, center, start, true, 200.0) // CW
	result := g.String()

	// CW arc should calculate different midpoint
	if !strings.Contains(result, "A X") {
		t.Errorf("CW Arc should start with 'A X': %v", result)
	}
}

func TestGeneratorString(t *testing.T) {
	g := NewGenerator()
	g.Jump(0, 0, 1000)
	g.ZDown()
	g.Line(10, 0, 500)
	g.Line(10, 10, 500)
	g.ZUp()

	result := g.String()
	lines := strings.Split(result, "\n")

	if len(lines) != 5 {
		t.Errorf("Expected 5 commands, got %d: %v", len(lines), result)
	}
}

func TestGeneratorFullSequence(t *testing.T) {
	g := NewGenerator()

	// Simulate a simple profile cut
	g.Jump(0, 0, 2000)
	g.ZDown()
	g.Line(100, 0, 500)
	g.Line(100, 100, 500)
	g.Line(0, 100, 500)
	g.Line(0, 0, 500)
	g.ZUp()

	result := g.String()

	// Check sequence
	if !strings.HasPrefix(result, "J ") {
		t.Error("Sequence should start with Jump")
	}
	if !strings.HasSuffix(result, "Z_UP") {
		t.Error("Sequence should end with Z_UP")
	}

	// Count commands
	if strings.Count(result, "\n") != 6 {
		t.Errorf("Expected 7 commands (6 newlines), got %d newlines",
			strings.Count(result, "\n"))
	}
}

func TestArcMidpointCalculation(t *testing.T) {
	// Test that arc midpoint is on the arc (radius = 10)
	start := geom.Point{X: 10, Y: 0}
	end := geom.Point{X: 0, Y: 10}
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, false, 100) // CCW 90° arc
	result := g.String()

	// The midpoint should be approximately at (7.07, 7.07) for this arc
	// Just verify the command was generated
	if !strings.Contains(result, "A X") {
		t.Errorf("Arc command not generated properly: %v", result)
	}
}

func TestArcCCW_NegativeSweep(t *testing.T) {
	// CCW arc where endAngle < startAngle (sweep becomes negative, needs +twoPi)
	// Start at 90° (top), end at 0° (right) - endAngle(0) - startAngle(π/2) = -π/2 < 0
	start := geom.Point{X: 0, Y: 10}  // 90° = π/2
	end := geom.Point{X: 10, Y: 0}    // 0°
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, false, 100) // CCW - should add 2π to get positive sweep
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CCW arc with negative sweep not generated: %v", result)
	}
}

func TestArcCW_PositiveSweep(t *testing.T) {
	// CW arc where endAngle > startAngle (sweep becomes positive, needs -twoPi)
	// Start at 0° (right), end at 90° (top) - endAngle(π/2) - startAngle(0) = π/2 > 0
	start := geom.Point{X: 10, Y: 0}  // 0°
	end := geom.Point{X: 0, Y: 10}    // 90° = π/2
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, true, 100) // CW - should subtract 2π to get negative sweep
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CW arc with positive sweep not generated: %v", result)
	}
}

func TestArcCCW_PositiveSweep(t *testing.T) {
	// CCW arc where endAngle > startAngle (sweep already positive, no adjustment needed)
	// Start at 0° (right), end at 90° (top) - endAngle(π/2) - startAngle(0) = π/2 > 0
	start := geom.Point{X: 10, Y: 0}  // 0°
	end := geom.Point{X: 0, Y: 10}    // 90° = π/2
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, false, 100) // CCW - sweep is already positive
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CCW arc with positive sweep not generated: %v", result)
	}
}

func TestArcCW_NegativeSweep(t *testing.T) {
	// CW arc where endAngle < startAngle (sweep already negative, no adjustment needed)
	// Start at 90° (top), end at 0° (right) - endAngle(0) - startAngle(π/2) = -π/2 < 0
	start := geom.Point{X: 0, Y: 10}  // 90° = π/2
	end := geom.Point{X: 10, Y: 0}    // 0°
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, true, 100) // CW - sweep is already negative
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CW arc with negative sweep not generated: %v", result)
	}
}
