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

func TestGeneratorWait(t *testing.T) {
	tests := []struct {
		name   string
		ms     int
		expect string
	}{
		{"wait 200ms", 200, "WAIT 200"},
		{"wait 500ms", 500, "WAIT 500"},
		{"wait 0ms", 0, ""},         // 0 should not generate command
		{"wait negative", -100, ""}, // negative should not generate command
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := NewGenerator()
			g.Wait(tt.ms)
			result := g.String()
			if result != tt.expect {
				t.Errorf("Wait(%v) = %v, want %v", tt.ms, result, tt.expect)
			}
		})
	}
}

func TestGeneratorJump3D(t *testing.T) {
	g := NewGenerator()
	g.Jump(10.5, 20.25, 5.0, 1000.0) // X, Y, Z, Speed
	result := g.String()

	if !strings.Contains(result, "J X 10.500") {
		t.Errorf("Jump X incorrect: %v", result)
	}
	if !strings.Contains(result, "Y 20.250") {
		t.Errorf("Jump Y incorrect: %v", result)
	}
	if !strings.Contains(result, "Z 5.000") {
		t.Errorf("Jump Z incorrect: %v", result)
	}
	if !strings.Contains(result, "V 1000.000") {
		t.Errorf("Jump V incorrect: %v", result)
	}
}

func TestGeneratorLine3D(t *testing.T) {
	g := NewGenerator()
	g.Line(30.0, 40.0, -5.0, 500.0) // X, Y, Z, Speed
	result := g.String()

	if !strings.Contains(result, "L X 30.000") {
		t.Errorf("Line X incorrect: %v", result)
	}
	if !strings.Contains(result, "Y 40.000") {
		t.Errorf("Line Y incorrect: %v", result)
	}
	if !strings.Contains(result, "Z -5.000") {
		t.Errorf("Line Z incorrect: %v", result)
	}
	if !strings.Contains(result, "V 500.000") {
		t.Errorf("Line V incorrect: %v", result)
	}
}

func TestGeneratorArc3D(t *testing.T) {
	start := geom.Point{X: 0, Y: 5}
	end := geom.Point{X: 10, Y: 5}
	center := geom.Point{X: 5, Y: 5}

	g := NewGenerator()
	g.Arc(end, center, start, false, -3.0, 200.0) // CCW, Z=-3, Speed=200
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("Arc should start with 'A X': %v", result)
	}
	if !strings.Contains(result, "Z -3.000") {
		t.Errorf("Arc Z incorrect: %v", result)
	}
	if !strings.Contains(result, "I ") && !strings.Contains(result, "J ") {
		t.Errorf("Arc should contain I and J midpoint: %v", result)
	}
}

func TestGeneratorArcCW3D(t *testing.T) {
	start := geom.Point{X: 0, Y: 5}
	end := geom.Point{X: 10, Y: 5}
	center := geom.Point{X: 5, Y: 5}

	g := NewGenerator()
	g.Arc(end, center, start, true, -2.5, 200.0) // CW, Z=-2.5
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CW Arc should start with 'A X': %v", result)
	}
	if !strings.Contains(result, "Z -2.500") {
		t.Errorf("CW Arc Z incorrect: %v", result)
	}
}

func TestGeneratorString3D(t *testing.T) {
	g := NewGenerator()
	g.Jump(0, 0, 5, 1000)      // Rapid to start at safe Z
	g.Line(0, 0, -2, 500)      // Plunge to work depth
	g.Line(10, 0, -2, 500)     // Cut
	g.Line(10, 10, -2, 500)    // Cut
	g.Jump(10, 10, 5, 1000)    // Retract to safe Z

	result := g.String()
	lines := strings.Split(result, "\n")

	if len(lines) != 5 {
		t.Errorf("Expected 5 commands, got %d: %v", len(lines), result)
	}
}

func TestGeneratorFullSequence3D(t *testing.T) {
	g := NewGenerator()
	safeZ := 5.0
	workZ := -2.0

	// Simulate a simple profile cut with 3D interpolation
	g.Jump(0, 0, safeZ, 2000)       // Rapid to start
	g.Line(0, 0, workZ, 500)        // Plunge
	g.Line(100, 0, workZ, 500)      // Cut
	g.Line(100, 100, workZ, 500)    // Cut
	g.Line(0, 100, workZ, 500)      // Cut
	g.Line(0, 0, workZ, 500)        // Close path
	g.Jump(0, 0, safeZ, 2000)       // Retract

	result := g.String()

	// Check sequence starts with Jump
	if !strings.HasPrefix(result, "J ") {
		t.Error("Sequence should start with Jump")
	}
	// Check sequence ends with retract Jump
	if !strings.HasSuffix(result, "V 2000.000") {
		t.Error("Sequence should end with rapid retract")
	}

	// Count commands (7 total = 6 newlines)
	if strings.Count(result, "\n") != 6 {
		t.Errorf("Expected 7 commands (6 newlines), got %d newlines",
			strings.Count(result, "\n"))
	}
}

func TestArcMidpointCalculation3D(t *testing.T) {
	start := geom.Point{X: 10, Y: 0}
	end := geom.Point{X: 0, Y: 10}
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, false, -1.0, 100) // CCW 90° arc at Z=-1
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("Arc command not generated properly: %v", result)
	}
	if !strings.Contains(result, "Z -1.000") {
		t.Errorf("Arc Z not correct: %v", result)
	}
}

func TestArcCCW_NegativeSweep3D(t *testing.T) {
	start := geom.Point{X: 0, Y: 10}
	end := geom.Point{X: 10, Y: 0}
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, false, -0.5, 100) // CCW
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CCW arc with negative sweep not generated: %v", result)
	}
}

func TestArcCW_PositiveSweep3D(t *testing.T) {
	start := geom.Point{X: 10, Y: 0}
	end := geom.Point{X: 0, Y: 10}
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, true, -1.5, 100) // CW
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CW arc with positive sweep not generated: %v", result)
	}
}

func TestArcCCW_PositiveSweep3D(t *testing.T) {
	start := geom.Point{X: 10, Y: 0}
	end := geom.Point{X: 0, Y: 10}
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, false, -2.0, 100) // CCW
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CCW arc with positive sweep not generated: %v", result)
	}
}

func TestArcCW_NegativeSweep3D(t *testing.T) {
	start := geom.Point{X: 0, Y: 10}
	end := geom.Point{X: 10, Y: 0}
	center := geom.Point{X: 0, Y: 0}

	g := NewGenerator()
	g.Arc(end, center, start, true, -3.0, 100) // CW
	result := g.String()

	if !strings.Contains(result, "A X") {
		t.Errorf("CW arc with negative sweep not generated: %v", result)
	}
}

func TestMixedSequenceWithWait(t *testing.T) {
	g := NewGenerator()
	safeZ := 2.0
	workZ := -5.0

	g.Jump(0, 0, safeZ, 1000)
	g.Wait(200)                    // Wait before plunge
	g.Line(0, 0, workZ, 300)       // Plunge
	g.Line(50, 0, workZ, 500)      // Cut
	g.Jump(50, 0, safeZ, 1000)     // Retract
	g.Wait(100)                    // Dwell

	result := g.String()

	if !strings.Contains(result, "WAIT 200") {
		t.Error("First WAIT not found")
	}
	if !strings.Contains(result, "WAIT 100") {
		t.Error("Second WAIT not found")
	}

	lines := strings.Split(result, "\n")
	if len(lines) != 6 {
		t.Errorf("Expected 6 commands, got %d", len(lines))
	}
}
