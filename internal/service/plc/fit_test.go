package plc

import (
	"math"
	"testing"

	"plotter-pen/pkg/geom"
)

// arcPoints samples n+1 points on a circle from a0 to a1 degrees, counterclockwise.
func arcPoints(cx, cy, r, a0, a1 float64, n int) []geom.Point {
	pts := make([]geom.Point, 0, n+1)
	for s := 0; s <= n; s++ {
		a := (a0 + (a1-a0)*float64(s)/float64(n)) * math.Pi / 180
		pts = append(pts, geom.Point{X: cx + r*math.Cos(a), Y: cy + r*math.Sin(a)})
	}
	return pts
}

func line(x1, y1, x2, y2 float64) FitSegment {
	return FitSegment{Type: "line", X1: x1, Y1: y1, X2: x2, Y2: y2}
}

func arc(x1, y1, x2, y2, cx, cy, r float64) FitSegment {
	return FitSegment{Type: "arc", X1: x1, Y1: y1, X2: x2, Y2: y2, Cx: cx, Cy: cy, R: r}
}

func requireSegments(t *testing.T, got, want []FitSegment) {
	t.Helper()
	same := len(got) == len(want)
	for i := 0; same && i < len(got); i++ {
		g, w := got[i], want[i]
		same = g.Type == w.Type
		for _, d := range []float64{g.X1 - w.X1, g.Y1 - w.Y1, g.X2 - w.X2, g.Y2 - w.Y2, g.Cx - w.Cx, g.Cy - w.Cy, g.R - w.R} {
			same = same && math.Abs(d) < 1e-6
		}
	}
	if !same {
		t.Fatalf("segments differ\n got: %+v\nwant: %+v", got, want)
	}
}

// Any three points lie on a circle, and so do the corners of a rectangle: checking only the
// vertices turns sharp corners into arcs that leave the drawn edges by millimetres.
func TestFitArcsAndLines_ConcyclicVerticesStayLines(t *testing.T) {
	tests := []struct {
		name   string
		points []geom.Point
		want   []FitSegment
	}{
		{
			name:   "right-angle corner",
			points: []geom.Point{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}},
			want:   []FitSegment{line(0, 0, 10, 0), line(10, 0, 10, 10)},
		},
		{
			name:   "closed rectangle",
			points: []geom.Point{{X: 3, Y: 3}, {X: 97, Y: 3}, {X: 97, Y: 47}, {X: 3, Y: 47}, {X: 3, Y: 3}},
			want: []FitSegment{
				line(3, 3, 97, 3), line(97, 3, 97, 47), line(97, 47, 3, 47), line(3, 47, 3, 3),
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requireSegments(t, FitArcsAndLines(tt.points, 0.01), tt.want)
		})
	}
}

// The last point sits on the same circle as the dense arc before it, but the straight chord
// that reaches it cuts across the circle: the arc must end where the chord starts.
func TestFitArcsAndLines_ArcEndsBeforeChordAcrossCircle(t *testing.T) {
	points := append(arcPoints(0, 0, 10, 0, 80, 16), geom.Point{X: -10, Y: 0})

	got := FitArcsAndLines(points, 0.05)

	requireSegments(t, got, []FitSegment{
		arc(10, 0, 1.7364817766693041, 9.84807753012208, 0, 0, 10),
		line(1.7364817766693041, 9.84807753012208, -10, 0),
	})
}

// Dense R3 corners joined by two-point edges: the corners must come back as arcs even though
// their chords sag 0.004 mm inside the circle, and the edges as lines.
func TestFitArcsAndLines_RoundedRectangle(t *testing.T) {
	points := []geom.Point{{X: 3, Y: 0}}
	points = append(points, arcPoints(97, 3, 3, -90, 0, 16)...)
	points = append(points, arcPoints(97, 47, 3, 0, 90, 16)...)
	points = append(points, arcPoints(3, 47, 3, 90, 180, 16)...)
	points = append(points, arcPoints(3, 3, 3, 180, 270, 16)...)

	got := FitArcsAndLines(points, 0.01)

	requireSegments(t, got, []FitSegment{
		line(3, 0, 97, 0),
		arc(97, 0, 100, 3, 97, 3, 3),
		line(100, 3, 100, 47),
		arc(100, 47, 97, 50, 97, 47, 3),
		line(97, 50, 3, 50),
		arc(3, 50, 0, 47, 3, 47, 3),
		line(0, 47, 0, 3),
		arc(0, 3, 3, 0, 3, 3, 3),
	})
}
