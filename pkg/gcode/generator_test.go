package gcode

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
	if g.Decimals != 3 {
		t.Errorf("Decimals = %v, want 3", g.Decimals)
	}
}

func TestGeneratorComment(t *testing.T) {
	g := NewGenerator()
	g.Comment("Test comment")
	result := g.String()

	if !strings.Contains(result, "(Test comment)") {
		t.Errorf("Comment not found in output: %v", result)
	}
}

func TestGeneratorHeader(t *testing.T) {
	g := NewGenerator()
	g.Header()
	result := g.String()

	expected := []string{"G21", "G90", "G17", "G94"}
	for _, e := range expected {
		if !strings.Contains(result, e) {
			t.Errorf("Header missing %v: %v", e, result)
		}
	}
}

func TestGeneratorFooter(t *testing.T) {
	g := NewGenerator()
	g.Footer()
	result := g.String()

	if !strings.Contains(result, "M30") {
		t.Errorf("Footer missing M30: %v", result)
	}
}

func TestGeneratorRapidZ(t *testing.T) {
	g := NewGenerator()
	g.RapidZ(5.5)
	result := g.String()

	if !strings.Contains(result, "G0 Z5.500") {
		t.Errorf("RapidZ incorrect: %v", result)
	}
}

func TestGeneratorRapidXY(t *testing.T) {
	g := NewGenerator()
	g.RapidXY(10.123, 20.456)
	result := g.String()

	if !strings.Contains(result, "G0 X10.123 Y20.456") {
		t.Errorf("RapidXY incorrect: %v", result)
	}
}

func TestGeneratorFeedZ(t *testing.T) {
	g := NewGenerator()
	g.FeedZ(-5.0, 100.0)
	result := g.String()

	if !strings.Contains(result, "G1 Z-5.000 F100.000") {
		t.Errorf("FeedZ incorrect: %v", result)
	}
}

func TestGeneratorFeedXY(t *testing.T) {
	g := NewGenerator()
	g.FeedXY(30.0, 40.0, 500.0)
	result := g.String()

	if !strings.Contains(result, "G1 X30.000 Y40.000 F500.000") {
		t.Errorf("FeedXY incorrect: %v", result)
	}
}

func TestGeneratorArc(t *testing.T) {
	g := NewGenerator()
	start := geom.Point{X: 0, Y: 0}
	end := geom.Point{X: 10, Y: 0}
	center := geom.Point{X: 5, Y: 0}

	// CW arc
	g.Arc(end, center, start, true, 200.0)
	result := g.String()

	if !strings.Contains(result, "G2") {
		t.Errorf("CW arc should use G2: %v", result)
	}

	// CCW arc
	g2 := NewGenerator()
	g2.Arc(end, center, start, false, 200.0)
	result2 := g2.String()

	if !strings.Contains(result2, "G3") {
		t.Errorf("CCW arc should use G3: %v", result2)
	}
}

func TestGeneratorFullProgram(t *testing.T) {
	g := NewGenerator()
	g.Header()
	g.Comment("Square profile")
	g.RapidZ(5.0)
	g.RapidXY(0, 0)
	g.FeedZ(-2.0, 50.0)
	g.FeedXY(10, 0, 200.0)
	g.FeedXY(10, 10, 200.0)
	g.FeedXY(0, 10, 200.0)
	g.FeedXY(0, 0, 200.0)
	g.RapidZ(5.0)
	g.Footer()

	result := g.String()

	// Verify program structure
	if !strings.HasPrefix(result, "G21") {
		t.Error("Program should start with G21 (metric)")
	}
	if !strings.HasSuffix(strings.TrimSpace(result), "M30 (End)") {
		t.Error("Program should end with M30")
	}

	lines := strings.Split(result, "\n")
	if len(lines) < 10 {
		t.Errorf("Full program too short: %d lines", len(lines))
	}
}

func TestFormat(t *testing.T) {
	g := NewGenerator()
	g.Decimals = 2
	g.RapidXY(1.23456, 7.89012)
	result := g.String()

	if !strings.Contains(result, "X1.23") && !strings.Contains(result, "Y7.89") {
		t.Errorf("Format precision not applied: %v", result)
	}
}
