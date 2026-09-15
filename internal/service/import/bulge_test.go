package importservice

import (
	"fmt"
	"math"
	"strings"
	"testing"
)

// dxfFile wraps entities in the smallest DXF the importer reads: an ENTITIES section and EOF.
func dxfFile(entities ...string) string {
	return "0\nSECTION\n2\nENTITIES\n" + strings.Join(entities, "") + "0\nENDSEC\n0\nEOF\n"
}

// lwpolyline writes an LWPOLYLINE on layer CUT the way CAD programs do: each vertex {x, y, bulge} is
// followed by its bulge (42), the bulge of the segment that starts there, left out when it is 0.
func lwpolyline(closed bool, vertices ...[3]float64) string {
	var b strings.Builder
	fmt.Fprintf(&b, "0\nLWPOLYLINE\n8\nCUT\n90\n%d\n70\n%d\n", len(vertices), closedFlag(closed))
	for _, v := range vertices {
		fmt.Fprintf(&b, "10\n%v\n20\n%v\n", v[0], v[1])
		if v[2] != 0 {
			fmt.Fprintf(&b, "42\n%v\n", v[2])
		}
	}
	return b.String()
}

// polyline writes the older POLYLINE entity on layer CUT: one VERTEX entity per vertex, each with its
// bulge, and SEQEND.
func polyline(closed bool, vertices ...[3]float64) string {
	var b strings.Builder
	fmt.Fprintf(&b, "0\nPOLYLINE\n8\nCUT\n66\n1\n10\n0\n20\n0\n70\n%d\n", closedFlag(closed))
	for _, v := range vertices {
		fmt.Fprintf(&b, "0\nVERTEX\n8\nCUT\n10\n%v\n20\n%v\n42\n%v\n", v[0], v[1], v[2])
	}
	b.WriteString("0\nSEQEND\n8\nCUT\n")
	return b.String()
}

func closedFlag(closed bool) int {
	if closed {
		return 1
	}
	return 0
}

func parse(t *testing.T, content string) *ParseResult {
	t.Helper()
	res, err := ParseDXF(content)
	if err != nil {
		t.Fatalf("ParseDXF: %v", err)
	}
	return res
}

// quarter is the bulge of a 90° arc, tan(90° / 4).
var quarter = math.Tan(math.Pi / 8)

type wantArc struct {
	start, end, center, through Point
	radius, sweep               float64
}

func checkLine(t *testing.T, p Primitive, start, end Point) {
	t.Helper()
	if p.Type != "line" || !near(Point{X: p.StartX, Y: p.StartY}, start) || !near(Point{X: p.EndX, Y: p.EndY}, end) {
		t.Fatalf("got %+v, want the line %v to %v", p, start, end)
	}
}

func checkArc(t *testing.T, p Primitive, want wantArc) {
	t.Helper()
	if p.Type != "arc" || p.ThroughPoint == nil ||
		!near(Point{X: p.StartX, Y: p.StartY}, want.start) || !near(Point{X: p.EndX, Y: p.EndY}, want.end) ||
		!near(Point{X: p.CenterX, Y: p.CenterY}, want.center) || !near(*p.ThroughPoint, want.through) ||
		math.Abs(p.Radius-want.radius) > 1e-9 || math.Abs(p.Sweep-want.sweep) > 1e-9 {
		t.Fatalf("got %+v (through %v), want the arc %+v", p, p.ThroughPoint, want)
	}
}

func near(a, b Point) bool {
	return math.Abs(a.X-b.X) <= 1e-9 && math.Abs(a.Y-b.Y) <= 1e-9
}

// A rectangle with rounded corners drawn counterclockwise as one closed LWPOLYLINE: every corner is a
// quarter arc through its middle, and the last corner is the closing segment, whose bulge sits on the
// last vertex.
func TestParseDXF_LwPolylineBulgesBecomeArcs(t *testing.T) {
	prims := parse(t, dxfFile(lwpolyline(true,
		[3]float64{2, 0, 0}, [3]float64{18, 0, quarter}, [3]float64{20, 2, 0}, [3]float64{20, 8, quarter},
		[3]float64{18, 10, 0}, [3]float64{2, 10, quarter}, [3]float64{0, 8, 0}, [3]float64{0, 2, quarter}))).Primitives

	if len(prims) != 8 {
		t.Fatalf("got %d primitives %+v, want 4 lines and 4 arcs", len(prims), prims)
	}
	s := math.Sqrt2
	checkLine(t, prims[0], Point{X: 2, Y: 0}, Point{X: 18, Y: 0})
	checkArc(t, prims[1], wantArc{Point{X: 18, Y: 0}, Point{X: 20, Y: 2}, Point{X: 18, Y: 2}, Point{X: 18 + s, Y: 2 - s}, 2, math.Pi / 2})
	checkLine(t, prims[2], Point{X: 20, Y: 2}, Point{X: 20, Y: 8})
	checkArc(t, prims[3], wantArc{Point{X: 20, Y: 8}, Point{X: 18, Y: 10}, Point{X: 18, Y: 8}, Point{X: 18 + s, Y: 8 + s}, 2, math.Pi / 2})
	checkLine(t, prims[4], Point{X: 18, Y: 10}, Point{X: 2, Y: 10})
	checkArc(t, prims[5], wantArc{Point{X: 2, Y: 10}, Point{X: 0, Y: 8}, Point{X: 2, Y: 8}, Point{X: 2 - s, Y: 8 + s}, 2, math.Pi / 2})
	checkLine(t, prims[6], Point{X: 0, Y: 8}, Point{X: 0, Y: 2})
	checkArc(t, prims[7], wantArc{Point{X: 0, Y: 2}, Point{X: 2, Y: 0}, Point{X: 2, Y: 2}, Point{X: 2 - s, Y: 2 - s}, 2, math.Pi / 2})

	ids := map[string]bool{}
	for _, p := range prims {
		if p.Layer != "CUT" || p.ID == "" || ids[p.ID] {
			t.Fatalf("primitive %+v: want the polyline's layer and an id of its own", p)
		}
		ids[p.ID] = true
	}
}

// The sign of the bulge is the direction, positive counterclockwise, and its size the included angle,
// 4·atan(bulge): half circles and arcs over 180° come out whole.
func TestParseDXF_BulgeSignAndSize(t *testing.T) {
	start, end := Point{X: 0, Y: 0}, Point{X: 2, Y: 0}
	tests := []struct {
		name  string
		bulge float64
		want  wantArc
	}{
		{"half circle counterclockwise", 1, wantArc{start, end, Point{X: 1, Y: 0}, Point{X: 1, Y: -1}, 1, math.Pi}},
		{"half circle clockwise", -1, wantArc{start, end, Point{X: 1, Y: 0}, Point{X: 1, Y: 1}, 1, -math.Pi}},
		{"270° counterclockwise", math.Tan(3 * math.Pi / 8), wantArc{start, end, Point{X: 1, Y: -1}, Point{X: 1, Y: -1 - math.Sqrt2}, math.Sqrt2, 3 * math.Pi / 2}},
		{"90° clockwise", -quarter, wantArc{start, end, Point{X: 1, Y: -1}, Point{X: 1, Y: math.Sqrt2 - 1}, math.Sqrt2, -math.Pi / 2}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prims := parse(t, dxfFile(lwpolyline(false, [3]float64{0, 0, tt.bulge}, [3]float64{2, 0, 0}))).Primitives
			if len(prims) != 1 {
				t.Fatalf("got %d primitives %+v, want one arc", len(prims), prims)
			}
			checkArc(t, prims[0], tt.want)
		})
	}
}

// Many CAD programs write a hole or a pad as a closed polyline of arcs. When all its segments are arcs
// of one circle turning the same way round once, it is imported as that circle, so drilling finds it.
func TestParseDXF_ClosedPolylineOfOneCircleBecomesACircle(t *testing.T) {
	tests := []struct {
		name    string
		content string
	}{
		{"two half circles", dxfFile(lwpolyline(true, [3]float64{4, 5, 1}, [3]float64{6, 5, 1}))},
		{"four quarters clockwise", dxfFile(lwpolyline(true, [3]float64{6, 5, -quarter}, [3]float64{5, 4, -quarter},
			[3]float64{4, 5, -quarter}, [3]float64{5, 6, -quarter}))},
		{"POLYLINE of two half circles", dxfFile(polyline(true, [3]float64{4, 5, 1}, [3]float64{6, 5, 1}))},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			prims := parse(t, tt.content).Primitives
			if len(prims) != 1 || prims[0].Type != "circle" || !near(Point{X: prims[0].CenterX, Y: prims[0].CenterY}, Point{X: 5, Y: 5}) ||
				math.Abs(prims[0].Radius-1) > 1e-9 || prims[0].Layer != "CUT" || prims[0].ID == "" {
				t.Fatalf("got %+v, want one circle of radius 1 centred at (5, 5)", prims)
			}
		})
	}

	// out along one half circle and back along the same half: arcs of one circle, but not round it
	prims := parse(t, dxfFile(lwpolyline(true, [3]float64{4, 5, 1}, [3]float64{6, 5, -1}))).Primitives
	if len(prims) != 2 || prims[0].Type != "arc" || prims[1].Type != "arc" {
		t.Fatalf("got %+v, want the two arcs", prims)
	}
}

// A polyline without bulges keeps coming in whole, as before.
func TestParseDXF_PolylineWithoutBulgesStaysWhole(t *testing.T) {
	prims := parse(t, dxfFile(lwpolyline(true, [3]float64{0, 0, 0}, [3]float64{10, 0, 0}, [3]float64{10, 5, 0}))).Primitives
	if len(prims) != 1 || prims[0].Type != "polygon" || len(prims[0].Points) != 3 || !prims[0].Closed || prims[0].Layer != "CUT" {
		t.Fatalf("got %+v, want one closed polygon of 3 points on layer CUT", prims)
	}
}

// The older POLYLINE entity keeps the bulge on each VERTEX.
func TestParseDXF_PolylineVertexBulges(t *testing.T) {
	prims := parse(t, dxfFile(polyline(false, [3]float64{0, 0, 1}, [3]float64{2, 0, 0}, [3]float64{2, 3, 0}))).Primitives
	if len(prims) != 2 {
		t.Fatalf("got %d primitives %+v, want an arc and a line", len(prims), prims)
	}
	checkArc(t, prims[0], wantArc{Point{X: 0, Y: 0}, Point{X: 2, Y: 0}, Point{X: 1, Y: 0}, Point{X: 1, Y: -1}, 1, math.Pi})
	checkLine(t, prims[1], Point{X: 2, Y: 0}, Point{X: 2, Y: 3})
}

// A segment between coincident vertices is left out, even with a bulge, and a bulge too small to lift
// the arc off its chord by 1e-6 mm gives a line.
func TestParseDXF_DegenerateBulgeSegments(t *testing.T) {
	prims := parse(t, dxfFile(lwpolyline(false,
		[3]float64{0, 0, 1}, [3]float64{0, 0, 1e-9}, [3]float64{2, 0, 0.5}, [3]float64{4, 0, 0}))).Primitives
	if len(prims) != 2 {
		t.Fatalf("got %d primitives %+v, want a line and an arc", len(prims), prims)
	}
	checkLine(t, prims[0], Point{X: 0, Y: 0}, Point{X: 2, Y: 0})
	r := 1.25 // chord 2, bulge 0.5: sagitta 0.5, radius (1 + 0.25) / (2 · 0.5)
	checkArc(t, prims[1], wantArc{Point{X: 2, Y: 0}, Point{X: 4, Y: 0}, Point{X: 3, Y: 0.75}, Point{X: 3, Y: -0.5}, r, 4 * math.Atan(0.5)})
}
