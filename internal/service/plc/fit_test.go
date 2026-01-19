package plc

import (
	"math"
	"testing"

	"plotter-pen/pkg/geom"
)

func TestCircleFromThreePoints(t *testing.T) {
	tests := []struct {
		name     string
		p1, p2, p3 geom.Point
		wantNil  bool
		wantCx   float64
		wantCy   float64
		wantR    float64
		tolerance float64
	}{
		{
			name: "unit circle points",
			p1:   geom.Point{X: 1, Y: 0},
			p2:   geom.Point{X: 0, Y: 1},
			p3:   geom.Point{X: -1, Y: 0},
			wantCx: 0, wantCy: 0, wantR: 1,
			tolerance: 0.0001,
		},
		{
			name: "circle centered at (5,5) radius 10",
			p1:   geom.Point{X: 15, Y: 5},
			p2:   geom.Point{X: 5, Y: 15},
			p3:   geom.Point{X: -5, Y: 5},
			wantCx: 5, wantCy: 5, wantR: 10,
			tolerance: 0.0001,
		},
		{
			name: "collinear points - should return nil",
			p1:   geom.Point{X: 0, Y: 0},
			p2:   geom.Point{X: 1, Y: 1},
			p3:   geom.Point{X: 2, Y: 2},
			wantNil: true,
		},
		{
			name: "small arc",
			p1:   geom.Point{X: 0, Y: 0},
			p2:   geom.Point{X: 5, Y: 2},
			p3:   geom.Point{X: 10, Y: 0},
			wantCx: 5, wantCy: -10.25, wantR: 10.4403,
			tolerance: 0.001,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			circle := circleFromThreePoints(tt.p1, tt.p2, tt.p3)

			if tt.wantNil {
				if circle != nil {
					t.Errorf("expected nil, got circle: %+v", circle)
				}
				return
			}

			if circle == nil {
				t.Fatal("expected circle, got nil")
			}

			if math.Abs(circle.Cx-tt.wantCx) > tt.tolerance {
				t.Errorf("Cx = %v, want %v", circle.Cx, tt.wantCx)
			}
			if math.Abs(circle.Cy-tt.wantCy) > tt.tolerance {
				t.Errorf("Cy = %v, want %v", circle.Cy, tt.wantCy)
			}
			if math.Abs(circle.R-tt.wantR) > tt.tolerance {
				t.Errorf("R = %v, want %v", circle.R, tt.wantR)
			}
		})
	}
}

func TestPointToSegmentDistance(t *testing.T) {
	tests := []struct {
		name     string
		pt       geom.Point
		start    geom.Point
		end      geom.Point
		want     float64
		tolerance float64
	}{
		{
			name:  "point on segment",
			pt:    geom.Point{X: 5, Y: 0},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  0,
			tolerance: 0.0001,
		},
		{
			name:  "point perpendicular to segment",
			pt:    geom.Point{X: 5, Y: 3},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  3,
			tolerance: 0.0001,
		},
		{
			name:  "point before segment start",
			pt:    geom.Point{X: -3, Y: 0},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  3,
			tolerance: 0.0001,
		},
		{
			name:  "point after segment end",
			pt:    geom.Point{X: 15, Y: 0},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  5,
			tolerance: 0.0001,
		},
		{
			name:  "diagonal segment",
			pt:    geom.Point{X: 0, Y: 1},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 1, Y: 1},
			want:  0.7071, // sqrt(2)/2
			tolerance: 0.001,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := pointToSegmentDistance(tt.pt, tt.start, tt.end)
			if math.Abs(got-tt.want) > tt.tolerance {
				t.Errorf("pointToSegmentDistance() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFitArcsAndLines_StraightLine(t *testing.T) {
	// Points on a straight line should fit as a single line
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 1, Y: 1},
		{X: 2, Y: 2},
		{X: 3, Y: 3},
		{X: 4, Y: 4},
		{X: 5, Y: 5},
	}

	result := fitArcsAndLines(points, 0.05)

	if len(result) != 1 {
		t.Errorf("expected 1 segment, got %d", len(result))
	}

	if result[0].Type != "line" {
		t.Errorf("expected line, got %s", result[0].Type)
	}

	if result[0].X1 != 0 || result[0].Y1 != 0 {
		t.Errorf("start point wrong: got (%v, %v)", result[0].X1, result[0].Y1)
	}

	if result[0].X2 != 5 || result[0].Y2 != 5 {
		t.Errorf("end point wrong: got (%v, %v)", result[0].X2, result[0].Y2)
	}
}

func TestFitArcsAndLines_Circle(t *testing.T) {
	// Points on a circle should fit as arc(s)
	points := make([]geom.Point, 0, 37)
	cx, cy, r := 0.0, 0.0, 10.0

	// Generate quarter circle (90 degrees)
	for i := 0; i <= 36; i++ {
		angle := float64(i) * math.Pi / 72 // 0 to PI/2
		points = append(points, geom.Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		})
	}

	result := fitArcsAndLines(points, 0.05)

	// Should fit as 1 or few arcs
	if len(result) > 3 {
		t.Errorf("expected <= 3 segments for quarter circle, got %d", len(result))
	}

	// First segment should be an arc
	hasArc := false
	for _, seg := range result {
		if seg.Type == "arc" {
			hasArc = true
			// Check radius is approximately correct
			computedR := math.Sqrt((seg.X1-seg.Cx)*(seg.X1-seg.Cx) + (seg.Y1-seg.Cy)*(seg.Y1-seg.Cy))
			if math.Abs(computedR-r) > 0.5 {
				t.Errorf("arc radius = %v, want ~%v", computedR, r)
			}
		}
	}

	if !hasArc {
		t.Error("expected at least one arc segment")
	}
}

func TestFitArcsAndLines_MixedCurve(t *testing.T) {
	// Create a path with a straight section followed by an arc
	points := []geom.Point{
		// Straight line section
		{X: 0, Y: 0},
		{X: 1, Y: 0},
		{X: 2, Y: 0},
		{X: 3, Y: 0},
		{X: 4, Y: 0},
		{X: 5, Y: 0},
	}

	// Add arc section (quarter circle from (5,0) to (10,5))
	cx, cy, r := 5.0, 5.0, 5.0
	for i := 1; i <= 20; i++ {
		angle := -math.Pi/2 + float64(i)*math.Pi/40
		points = append(points, geom.Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		})
	}

	result := fitArcsAndLines(points, 0.05)

	// Should have at least 2 segments (1 line + 1 arc)
	if len(result) < 2 {
		t.Errorf("expected at least 2 segments, got %d", len(result))
	}

	// First segment should be a line
	if result[0].Type != "line" {
		t.Errorf("first segment should be line, got %s", result[0].Type)
	}

	// Should have at least one arc
	hasArc := false
	for _, seg := range result {
		if seg.Type == "arc" {
			hasArc = true
			break
		}
	}
	if !hasArc {
		t.Error("expected at least one arc segment in mixed curve")
	}
}

func TestFitArcsAndLines_DefaultTolerance(t *testing.T) {
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 1, Y: 0},
		{X: 2, Y: 0},
	}

	// Test with zero tolerance (should use default)
	result := fitArcsAndLines(points, 0)
	if len(result) == 0 {
		t.Error("expected segments with default tolerance")
	}

	// Test with negative tolerance (should use default)
	result = fitArcsAndLines(points, -1)
	if len(result) == 0 {
		t.Error("expected segments with default tolerance for negative input")
	}
}

func TestFitArcsAndLines_TwoPoints(t *testing.T) {
	// Minimum case: 2 points should produce 1 line
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 10, Y: 10},
	}

	result := fitArcsAndLines(points, 0.05)

	if len(result) != 1 {
		t.Errorf("expected 1 segment, got %d", len(result))
	}

	if result[0].Type != "line" {
		t.Errorf("expected line, got %s", result[0].Type)
	}
}

func TestFitArcsAndLines_SmallArc(t *testing.T) {
	// Test that small arcs are rejected (radius too small)
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 0.001, Y: 0.0001},
		{X: 0.002, Y: 0},
	}

	result := fitArcsAndLines(points, 0.05)

	// Should fit as lines (arc radius too small)
	for _, seg := range result {
		if seg.Type == "arc" {
			// If arc, radius should be above minimum
			r := seg.R
			if r < 0.005 {
				t.Errorf("arc radius %v is below minimum 0.005", r)
			}
		}
	}
}

// Benchmark tests
func BenchmarkFitArcsAndLines_100Points(b *testing.B) {
	points := make([]geom.Point, 100)
	for i := 0; i < 100; i++ {
		angle := float64(i) * 2 * math.Pi / 100
		points[i] = geom.Point{
			X: 50 + 40*math.Cos(angle),
			Y: 50 + 40*math.Sin(angle),
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fitArcsAndLines(points, 0.05)
	}
}

func BenchmarkFitArcsAndLines_500Points(b *testing.B) {
	points := make([]geom.Point, 500)
	for i := 0; i < 500; i++ {
		angle := float64(i) * 2 * math.Pi / 500
		points[i] = geom.Point{
			X: 50 + 40*math.Cos(angle),
			Y: 50 + 40*math.Sin(angle),
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fitArcsAndLines(points, 0.05)
	}
}
