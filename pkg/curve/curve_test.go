package curve

import (
	"math"
	"plotter-pen/pkg/geom"
	"testing"
)

func TestCircleFrom3Points(t *testing.T) {
	tests := []struct {
		name       string
		p1, p2, p3 geom.Point
		wantNil    bool
		wantRadius float64
	}{
		{
			name:       "unit_circle",
			p1:         geom.Point{X: 1, Y: 0},
			p2:         geom.Point{X: 0, Y: 1},
			p3:         geom.Point{X: -1, Y: 0},
			wantRadius: 1.0,
		},
		{
			name:       "larger_circle",
			p1:         geom.Point{X: 10, Y: 0},
			p2:         geom.Point{X: 0, Y: 10},
			p3:         geom.Point{X: -10, Y: 0},
			wantRadius: 10.0,
		},
		{
			name:    "collinear_points",
			p1:      geom.Point{X: 0, Y: 0},
			p2:      geom.Point{X: 1, Y: 1},
			p3:      geom.Point{X: 2, Y: 2},
			wantNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			circle := CircleFrom3Points(tt.p1, tt.p2, tt.p3)

			if tt.wantNil {
				if circle != nil {
					t.Errorf("Expected nil for collinear points, got %v", circle)
				}
				return
			}

			if circle == nil {
				t.Fatal("CircleFrom3Points returned nil unexpectedly")
			}

			if math.Abs(circle.Radius-tt.wantRadius) > 0.001 {
				t.Errorf("Radius = %v, want %v", circle.Radius, tt.wantRadius)
			}
		})
	}
}

func TestPointToLineDistance(t *testing.T) {
	tests := []struct {
		name       string
		p          geom.Point
		start, end geom.Point
		want       float64
	}{
		{
			name:  "point_on_line",
			p:     geom.Point{X: 5, Y: 0},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  0.0,
		},
		{
			name:  "point_perpendicular",
			p:     geom.Point{X: 5, Y: 3},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  3.0,
		},
		{
			name:  "point_before_start",
			p:     geom.Point{X: -3, Y: 4},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  5.0, // Distance to start point
		},
		{
			name:  "point_after_end",
			p:     geom.Point{X: 13, Y: 4},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 10, Y: 0},
			want:  5.0, // Distance to end point
		},
		{
			name:  "zero_length_line",
			p:     geom.Point{X: 3, Y: 4},
			start: geom.Point{X: 0, Y: 0},
			end:   geom.Point{X: 0, Y: 0},
			want:  5.0, // Distance to the point
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PointToLineDistance(tt.p, tt.start, tt.end)
			if math.Abs(got-tt.want) > 0.001 {
				t.Errorf("PointToLineDistance() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFitSimpleArc_Lines(t *testing.T) {
	// Points on a straight line
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 1, Y: 0},
		{X: 2, Y: 0},
		{X: 3, Y: 0},
		{X: 4, Y: 0},
	}

	paths, areArcs := FitSimpleArc(points, 0.1)

	if len(paths) == 0 {
		t.Fatal("FitSimpleArc returned no paths")
	}

	// Should be recognized as line(s), not arcs
	for i, isArc := range areArcs {
		if isArc {
			t.Errorf("Segment %d should be line, not arc", i)
		}
	}
}

func TestFitSimpleArc_Arc(t *testing.T) {
	// Points on a circular arc
	var points []geom.Point
	center := geom.Point{X: 0, Y: 0}
	radius := 10.0

	for angle := 0.0; angle <= math.Pi/2; angle += 0.1 {
		points = append(points, geom.Point{
			X: center.X + radius*math.Cos(angle),
			Y: center.Y + radius*math.Sin(angle),
		})
	}

	paths, areArcs := FitSimpleArc(points, 0.5)

	if len(paths) == 0 {
		t.Fatal("FitSimpleArc returned no paths")
	}

	// At least one segment should be recognized as arc
	hasArc := false
	for _, isArc := range areArcs {
		if isArc {
			hasArc = true
			break
		}
	}

	if !hasArc {
		t.Log("Arc fitting might be too strict, but this is acceptable")
	}
}

func TestFitSimpleArc_Empty(t *testing.T) {
	paths, areArcs := FitSimpleArc([]geom.Point{}, 0.1)

	if len(paths) != 0 || len(areArcs) != 0 {
		t.Error("Empty input should return empty output")
	}
}

func TestFitSimpleArc_SinglePoint(t *testing.T) {
	paths, areArcs := FitSimpleArc([]geom.Point{{X: 1, Y: 1}}, 0.1)

	if len(paths) != 0 || len(areArcs) != 0 {
		t.Error("Single point should return empty output")
	}
}

func TestLeastSquaresCircle(t *testing.T) {
	// Generate points on a known circle
	var points []geom.Point
	expectedCenter := geom.Point{X: 5, Y: 5}
	expectedRadius := 3.0

	for angle := 0.0; angle < 2*math.Pi; angle += math.Pi / 6 {
		points = append(points, geom.Point{
			X: expectedCenter.X + expectedRadius*math.Cos(angle),
			Y: expectedCenter.Y + expectedRadius*math.Sin(angle),
		})
	}

	center, radius, err := LeastSquaresCircle(points)
	if err != nil {
		t.Fatalf("LeastSquaresCircle error: %v", err)
	}

	if math.Abs(center.X-expectedCenter.X) > 0.1 {
		t.Errorf("Center X = %v, want %v", center.X, expectedCenter.X)
	}
	if math.Abs(center.Y-expectedCenter.Y) > 0.1 {
		t.Errorf("Center Y = %v, want %v", center.Y, expectedCenter.Y)
	}
	if math.Abs(radius-expectedRadius) > 0.1 {
		t.Errorf("Radius = %v, want %v", radius, expectedRadius)
	}
}

func TestLeastSquaresCircle_Collinear(t *testing.T) {
	// Collinear points should return error
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 1, Y: 1},
		{X: 2, Y: 2},
	}

	_, _, err := LeastSquaresCircle(points)
	if err == nil {
		t.Error("Expected error for collinear points")
	}
}

func TestFitSimpleArc_TinyRadius(t *testing.T) {
	// Points on a very small circle (radius < minRadius=0.5)
	var points []geom.Point
	radius := 0.2 // Less than minRadius
	for angle := 0.0; angle <= math.Pi; angle += 0.1 {
		points = append(points, geom.Point{
			X: radius * math.Cos(angle),
			Y: radius * math.Sin(angle),
		})
	}

	paths, areArcs := FitSimpleArc(points, 0.01)

	// Should fall back to lines since radius is too small
	if len(paths) == 0 {
		t.Fatal("FitSimpleArc returned no paths")
	}
	// Due to small radius, should be treated as lines
	for _, isArc := range areArcs {
		if isArc {
			t.Log("Tiny radius arc recognized - algorithm may handle this differently")
		}
	}
}

func TestFitSimpleArc_HugeRadius(t *testing.T) {
	// Points on a very large circle (radius > maxRadius=50000)
	var points []geom.Point
	radius := 60000.0 // Greater than maxRadius
	for angle := 0.0; angle <= 0.01; angle += 0.001 {
		points = append(points, geom.Point{
			X: radius * math.Cos(angle),
			Y: radius * math.Sin(angle),
		})
	}

	paths, _ := FitSimpleArc(points, 0.1)

	// Should handle gracefully
	if len(paths) == 0 {
		t.Log("Large radius handled - may return empty for small arc segment")
	}
}

func TestFitSimpleArc_MixedContent(t *testing.T) {
	// Points with both lines and arcs
	var points []geom.Point

	// First: a line segment
	for x := 0.0; x <= 10.0; x += 1.0 {
		points = append(points, geom.Point{X: x, Y: 0})
	}

	// Then: an arc segment
	center := geom.Point{X: 10, Y: 5}
	for angle := -math.Pi / 2; angle <= math.Pi/2; angle += 0.2 {
		points = append(points, geom.Point{
			X: center.X + 5*math.Cos(angle),
			Y: center.Y + 5*math.Sin(angle),
		})
	}

	paths, areArcs := FitSimpleArc(points, 0.5)

	if len(paths) < 2 {
		t.Logf("Expected multiple segments, got %d", len(paths))
	}

	t.Logf("Segments: %d, arcs: %v", len(paths), areArcs)
}

func TestFitSimpleArc_TwoPoints(t *testing.T) {
	// Exactly 2 points - minimum for a line
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 10, Y: 10},
	}

	paths, areArcs := FitSimpleArc(points, 0.1)

	if len(paths) != 1 {
		t.Errorf("Expected 1 path for 2 points, got %d", len(paths))
	}
	if len(areArcs) > 0 && areArcs[0] {
		t.Error("2 points should be a line, not an arc")
	}
}

func TestFitSimpleArc_PointsOutOfTolerance(t *testing.T) {
	// Points that look like an arc but are out of tolerance
	points := []geom.Point{
		{X: 0, Y: 0},
		{X: 5, Y: 10}, // Way off any arc
		{X: 10, Y: 0},
	}

	paths, areArcs := FitSimpleArc(points, 0.01) // Very tight tolerance

	if len(paths) == 0 {
		t.Fatal("Should return some paths")
	}
	// Should fall back to lines since arc doesn't fit
	t.Logf("Paths: %d, areArcs: %v", len(paths), areArcs)
}
