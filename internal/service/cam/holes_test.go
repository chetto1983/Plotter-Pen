package cam

import (
	"math"
	"slices"
	"strings"
	"testing"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
)

// regularPolygon has n vertices on the circle, the way some CAD programs export a hole.
func regularPolygon(id string, cx, cy, r float64, n int) plc.Primitive {
	p := plc.Primitive{Type: plc.PrimitivePolygon, ID: id}
	for k := range n {
		a := 2 * math.Pi * float64(k) / float64(n)
		p.Points = append(p.Points, geom.Point{X: cx + r*math.Cos(a), Y: cy + r*math.Sin(a)})
	}
	return p
}

// lineRing is the same polygon exploded into separate lines, named prefix0, prefix1...
func lineRing(prefix string, cx, cy, r float64, n int) []plc.Primitive {
	pts := regularPolygon("", cx, cy, r, n).Points
	lines := make([]plc.Primitive, n)
	for k := range n {
		a, b := pts[k], pts[(k+1)%n]
		lines[k] = lineP(a.X, a.Y, b.X, b.Y)
		lines[k].ID = prefix + string(rune('0'+k%10))
	}
	return lines
}

func named(p plc.Primitive, id string) plc.Primitive {
	p.ID = id
	return p
}

func sortedHoles(t *testing.T, out []string) [][2]float64 {
	t.Helper()
	xy := holes(t, out)
	slices.SortFunc(xy, func(a, b [2]float64) int {
		if a[0] != b[0] {
			return map[bool]int{true: -1, false: 1}[a[0] < b[0]]
		}
		return map[bool]int{true: -1, false: 1}[a[1] < b[1]]
	})
	return xy
}

// A hole drawn as anything round is drilled at its centre: arcs of one circle, a polygon or a
// closed polyline with many sides, or the same polygon exploded into lines. Its commands name the
// first primitive of the contour.
func TestDrill_DrillsRoundContoursAsHoles(t *testing.T) {
	closedPolyline := regularPolygon("q1", 10, 0, 0.45, 32)
	closedPolyline.Type, closedPolyline.Closed = plc.PrimitivePolyline, true
	closedPolyline.Points = append(closedPolyline.Points, closedPolyline.Points[0])
	prims := []plc.Primitive{
		named(arcP(1.5, 0, 2.5, 0, 2, 0, math.Pi), "a1"), named(arcP(2.5, 0, 1.5, 0, 2, 0, math.Pi), "a2"),
		arcP(4.5, 0, 4, -0.5, 4, 0, -math.Pi/2), arcP(4, -0.5, 3.5, 0, 4, 0, -math.Pi/2),
		arcP(3.5, 0, 4, 0.5, 4, 0, -math.Pi/2), arcP(4, 0.5, 4.5, 0, 4, 0, -math.Pi/2),
		regularPolygon("p1", 6, 0, 0.5, 24),
		closedPolyline,
	}
	prims = append(prims, lineRing("l", 8, 0, 0.5, 24)...)

	res := mustDrill(t, drillRequest(prims...))

	want := [][2]float64{{2, 0}, {4, 0}, {6, 0}, {8, 0}, {10, 0}}
	if got := sortedHoles(t, res.Output); !slices.Equal(got, want) {
		t.Fatalf("drilled %v, want %v", got, want)
	}
	if len(res.Warnings) != 0 {
		t.Fatalf("warnings %v, want none", res.Warnings)
	}
	names := map[string]string{"X 2.000, Y 0.000": "a1", "X 6.000, Y 0.000": "p1", "X 8.000, Y 0.000": "l0", "X 10.000, Y 0.000": "q1"}
	for _, c := range res.Commands {
		for at, id := range names {
			if strings.Contains(c.CommandStr, at) && c.PrimitiveID != id {
				t.Fatalf("command %q names %q, want %q", c.CommandStr, c.PrimitiveID, id)
			}
		}
	}
}

// A closed contour that is not round is not drilled. When the shorter side of its bounding box is
// in the diameter range, it looks like a hole of that size, so a warning names it. A polygon is
// round when its vertices and the middles of its sides lie within 0.02 mm of its circle: a 16-gon of
// 3 mm sags 0.029 mm between its vertices, a hexagon much more.
func TestDrill_WarnsAboutClosedContoursThatAreNotRound(t *testing.T) {
	slot := []plc.Primitive{ // 3 x 1 mm, two lines and two half circles
		lineP(20, 0, 22, 0), arcP(22, 0, 22, 1, 22, 0.5, math.Pi), lineP(22, 1, 20, 1), arcP(20, 1, 20, 0, 20, 0.5, math.Pi),
	}
	req := drillRequest(append([]plc.Primitive{
		regularPolygon("", 0, 0, 1.5, 16),
		regularPolygon("", 5, 0, 0.5, 6),
		squareP(10, 0, 11, 1),
		squareP(-50, -50, 50, 50),            // the board outline: far too wide for a hole
		arcP(30, 0, 31, 1, 30, 1, math.Pi/2), // open, neither drilled nor warned
		named(circleP(30, 30, 0.5), "c1"),
	}, slot...)...)
	req.MaxHoleDiameter = 3.2

	res := mustDrill(t, req)

	if got := holes(t, res.Output); !slices.Equal(got, [][2]float64{{30, 30}}) {
		t.Fatalf("drilled %v, want the circle alone", got)
	}
	wantWarned := []string{"(-1.500, ", "(4.500, ", "(10.000, 0.000) to (11.000, 1.000)", "(19.500, 0.000) to (22.500, 1.000)"}
	if len(res.Warnings) != len(wantWarned) {
		t.Fatalf("warnings %v, want %d", res.Warnings, len(wantWarned))
	}
	for _, want := range wantWarned {
		if !slices.ContainsFunc(res.Warnings, func(w string) bool { return strings.Contains(w, want) && strings.Contains(w, "not round") }) {
			t.Fatalf("no not-round warning for %s in %v", want, res.Warnings)
		}
	}
}

// A round contour and a circle on the same centre, like a pad drawn over its hole, are one hole:
// the circle's.
func TestDrill_RoundContourOverACircleIsOneHole(t *testing.T) {
	res := mustDrill(t, drillRequest(regularPolygon("p1", 5, 5, 0.6, 24), named(circleP(5, 5, 0.5), "c1")))

	if got := holes(t, res.Output); !slices.Equal(got, [][2]float64{{5, 5}}) {
		t.Fatalf("drilled %v, want one hole", got)
	}
	if res.Commands[0].PrimitiveID != "c1" {
		t.Fatalf("the hole names %q, want the circle c1", res.Commands[0].PrimitiveID)
	}
}

// With nothing round to drill the request is refused, and the error says that some shapes in the
// range were left out because they are not round.
func TestDrill_NothingRoundToDrill(t *testing.T) {
	_, err := Drill(drillRequest(squareP(0, 0, 1, 1)))
	if err == nil || !strings.Contains(err.Error(), "nothing to drill") || !strings.Contains(err.Error(), "1 closed contour") ||
		!strings.Contains(err.Error(), "not round") {
		t.Fatalf("error %v, want nothing to drill naming the contour that is not round", err)
	}
}
