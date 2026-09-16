package importservice

import (
	"math"
	"testing"
)

// arcPoints samples n+1 points on a circle from a0 to a1 degrees, counterclockwise.
func arcPoints(cx, cy, r, a0, a1 float64, n int) []Point {
	pts := make([]Point, 0, n+1)
	for s := 0; s <= n; s++ {
		a := (a0 + (a1-a0)*float64(s)/float64(n)) * math.Pi / 180
		pts = append(pts, Point{X: cx + r*math.Cos(a), Y: cy + r*math.Sin(a)})
	}
	return pts
}

// Any three points lie on a circle, and so do the corners of a right angle: checking only that the
// vertices sit on the fitted circle turns a sharp corner into an arc that leaves the drawn path by
// millimetres. The chord midpoint of each segment must sit on the circle too.
func TestFitArcsToPoints_ConcyclicVerticesStayLines(t *testing.T) {
	points := []Point{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}}

	got := fitArcsToPoints(points)

	if len(got) != 2 || got[0].Type != "line" || got[1].Type != "line" {
		t.Fatalf("got %+v, want two lines for a right-angle corner", got)
	}
}

// A zig-zag whose vertices sit on a circle by construction (alternating just inside and outside the
// radius) must stay lines: the path does not follow the circle between vertices.
func TestFitArcsToPoints_ZigZagOnACircleStaysLines(t *testing.T) {
	// Two points on a radius-10 circle around the origin, and their reflection across the chord's
	// midpoint radius, alternated: consecutive points still lie on the same circle, but the path
	// between them cuts across it instead of following the arc.
	points := []Point{
		{X: 10, Y: 0},
		{X: 10 * math.Cos(0.6), Y: 10 * math.Sin(0.6)},
		{X: 10 * math.Cos(0.3), Y: 10 * math.Sin(0.3)},
		{X: 10 * math.Cos(0.9), Y: 10 * math.Sin(0.9)},
		{X: 10 * math.Cos(0.6), Y: 10 * math.Sin(0.6)},
		{X: 10 * math.Cos(1.2), Y: 10 * math.Sin(1.2)},
	}

	got := fitArcsToPoints(points)

	for _, p := range got {
		if p.Type == "arc" {
			t.Fatalf("got %+v, want only lines: the vertices sit on a circle but the path zig-zags across it", got)
		}
	}
}

// A real arc, densely sampled, still comes back as one arc: the chord-midpoint check must not
// reject a true arc.
func TestFitArcsToPoints_RealArcStillFitsOneArc(t *testing.T) {
	points := arcPoints(0, 0, 10, 0, 80, 40)

	got := fitArcsToPoints(points)

	if len(got) != 1 || got[0].Type != "arc" {
		t.Fatalf("got %+v, want one arc", got)
	}
	if math.Abs(got[0].Radius-10) > ArcFitTolerance {
		t.Fatalf("got radius %v, want ~10", got[0].Radius)
	}
}
