package cam

import (
	"math"
	"testing"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
)

func lineP(x1, y1, x2, y2 float64) plc.Primitive {
	return plc.Primitive{Type: plc.PrimitiveLine, X1: new(x1), Y1: new(y1), X2: new(x2), Y2: new(y2)}
}

func arcP(x1, y1, x2, y2, cx, cy, sweep float64) plc.Primitive {
	return plc.Primitive{Type: plc.PrimitiveArc, X1: new(x1), Y1: new(y1), X2: new(x2), Y2: new(y2),
		Cx: new(cx), Cy: new(cy), Sweep: new(sweep)}
}

func requirePaths(t *testing.T, kind string, got, want []geom.Path) {
	t.Helper()
	same := len(got) == len(want)
	for i := 0; same && i < len(got); i++ {
		same = len(got[i]) == len(want[i])
		for j := 0; same && j < len(got[i]); j++ {
			same = got[i][j].Distance(want[i][j]) < 1e-9
		}
	}
	if !same {
		t.Fatalf("%s paths differ\n got: %v\nwant: %v", kind, got, want)
	}
}

func mustChain(t *testing.T, prims ...plc.Primitive) Contours {
	t.Helper()
	c, err := Chain(prims)
	if err != nil {
		t.Fatalf("Chain: %v", err)
	}
	return c
}

// A half disc drawn as a chord plus an arc: the arc side must follow the sweep sign, and pieces
// drawn in the opposite direction must be reversed rather than left open.
func TestChain_ArcAndChordCloseOnTheSweepSide(t *testing.T) {
	half := 50 * math.Pi // area of a half disc of radius 10
	tests := []struct {
		name     string
		prims    []plc.Primitive
		wantArea float64
	}{
		{"counterclockwise arc above the chord", []plc.Primitive{lineP(-10, 0, 10, 0), arcP(10, 0, -10, 0, 0, 0, math.Pi)}, half},
		{"clockwise arc below the chord", []plc.Primitive{lineP(-10, 0, 10, 0), arcP(10, 0, -10, 0, 0, 0, -math.Pi)}, -half},
		{"chord drawn against the arc", []plc.Primitive{arcP(-10, 0, 10, 0, 0, 0, -math.Pi), lineP(-10, 0, 10, 0)}, -half},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := mustChain(t, tt.prims...)
			if len(c.Closed) != 1 || len(c.Open) != 0 {
				t.Fatalf("got %d closed, %d open; want 1 closed", len(c.Closed), len(c.Open))
			}
			// the chords of a 5 µm tessellation lose about 0.1 mm² on this perimeter
			if a := signedArea(c.Closed[0]); math.Abs(a-tt.wantArea) > 0.2 {
				t.Fatalf("signed area %.4f, want %.4f", a, tt.wantArea)
			}
		})
	}
}

// Ends closer than 0.01 mm are joined (the extractor draws them without a jump); farther ends
// stay open, and the open chain keeps its real end points.
func TestChain_JoinsEndsWithinTolerance(t *testing.T) {
	triangle := func(gap float64) []plc.Primitive {
		return []plc.Primitive{lineP(0, 0, 10, 0), lineP(10+gap, 0, 0, 10), lineP(0, 10, 0, 0)}
	}

	c := mustChain(t, triangle(0.009)...)
	if len(c.Closed) != 1 || len(c.Open) != 0 {
		t.Fatalf("gap 0.009: got %d closed, %d open; want 1 closed", len(c.Closed), len(c.Open))
	}

	c = mustChain(t, triangle(0.011)...)
	requirePaths(t, "closed", c.Closed, nil)
	requirePaths(t, "open", c.Open, []geom.Path{{{X: 10, Y: 0}, {X: 0, Y: 0}, {X: 0, Y: 10}, {X: 10.011, Y: 0}}})
}

// Where three ends meet the contour is ambiguous: nothing is joined there and both chains come
// back open, instead of a closed loop that depends on the drawing order.
func TestChain_ThreeEndsAtOnePointStayOpen(t *testing.T) {
	c := mustChain(t, lineP(0, 0, 10, 0), lineP(10, 0, 0, 10), lineP(0, 10, 0, 0), lineP(0, 0, -5, -5))

	requirePaths(t, "closed", c.Closed, nil)
	requirePaths(t, "open", c.Open, []geom.Path{
		{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 0, Y: 10}, {X: 0, Y: 0}},
		{{X: 0, Y: 0}, {X: -5, Y: -5}},
	})
}

// A zero-length line at a vertex would otherwise count as two more ends there.
func TestChain_ZeroLengthLineIsDropped(t *testing.T) {
	c := mustChain(t, lineP(0, 0, 10, 0), lineP(10, 0, 0, 10), lineP(0, 10, 0, 0), lineP(0, 0, 0, 0))

	requirePaths(t, "closed", c.Closed, []geom.Path{{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 0, Y: 10}}})
	requirePaths(t, "open", c.Open, nil)
}

func TestChain_PolylinesJoinAndClosedShapesAreLoops(t *testing.T) {
	open := plc.Primitive{Type: plc.PrimitivePolyline, Points: []geom.Point{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}}}
	polygon := plc.Primitive{Type: plc.PrimitivePolygon, Points: []geom.Point{{X: 20, Y: 0}, {X: 24, Y: 0}, {X: 20, Y: 3}}}
	closedPolyline := plc.Primitive{Type: plc.PrimitivePolyline, Closed: true,
		Points: []geom.Point{{X: 30, Y: 0}, {X: 34, Y: 0}, {X: 30, Y: 3}, {X: 30, Y: 0}}}
	rect := plc.Primitive{Type: plc.PrimitiveRectangle, X: new(1.0), Y: new(2.0), Width: new(3.0), Height: new(4.0)}

	c := mustChain(t, open, lineP(10, 10, 0, 0), polygon, closedPolyline, rect)

	requirePaths(t, "closed", c.Closed, []geom.Path{
		{{X: 20, Y: 0}, {X: 24, Y: 0}, {X: 20, Y: 3}},
		{{X: 30, Y: 0}, {X: 34, Y: 0}, {X: 30, Y: 3}},
		{{X: 1, Y: 2}, {X: 4, Y: 2}, {X: 4, Y: 6}, {X: 1, Y: 6}},
		{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}},
	})
	requirePaths(t, "open", c.Open, nil)
}

// The offset is computed on the tessellated circle, so its chords must stay within 5 µm of it.
func TestChain_CircleTessellatedWithin5Microns(t *testing.T) {
	circle := plc.Primitive{Type: plc.PrimitiveCircle, Cx: new(1.0), Cy: new(2.0), Radius: new(5.0)}

	c := mustChain(t, circle)

	if len(c.Closed) != 1 || len(c.Open) != 0 {
		t.Fatalf("got %d closed, %d open; want 1 closed", len(c.Closed), len(c.Open))
	}
	loop, centre := c.Closed[0], geom.Point{X: 1, Y: 2}
	for i, p := range loop {
		q := loop[(i+1)%len(loop)]
		if d := math.Abs(p.Distance(centre) - 5); d > 1e-9 {
			t.Fatalf("vertex %d is %.6f mm off the circle", i, d)
		}
		mid := geom.Point{X: (p.X + q.X) / 2, Y: (p.Y + q.Y) / 2}
		if d := 5 - mid.Distance(centre); d > 0.005 {
			t.Fatalf("chord %d sags %.6f mm inside the circle", i, d)
		}
	}
	if a := math.Abs(signedArea(loop)); math.Abs(a-25*math.Pi) > 0.2 {
		t.Fatalf("area %.4f, want %.4f", a, 25*math.Pi)
	}
}

// Missing data must stop the job: skipping a piece silently would machine a different shape.
func TestChain_RejectsIncompletePrimitives(t *testing.T) {
	noSweep := arcP(10, 0, -10, 0, 0, 0, 0)
	noSweep.Sweep = nil
	noEnd := lineP(0, 0, 1, 1)
	noEnd.X2 = nil
	tests := []struct {
		name string
		prim plc.Primitive
	}{
		{"arc without sweep", noSweep},
		{"line without end", noEnd},
		{"circle without radius", plc.Primitive{Type: plc.PrimitiveCircle, Cx: new(0.0), Cy: new(0.0)}},
		{"rectangle without size", plc.Primitive{Type: plc.PrimitiveRectangle, X: new(0.0), Y: new(0.0)}},
		{"unknown type", plc.Primitive{Type: "text"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := Chain([]plc.Primitive{tt.prim}); err == nil {
				t.Fatal("want an error")
			}
		})
	}
}
