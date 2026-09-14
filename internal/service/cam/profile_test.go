package cam

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"testing"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
)

// Distinct speeds let the tests tell rapid, plunge and cutting moves apart.
const (
	workSpeed   = 50.0
	rapidSpeed  = 1000.0
	plungeSpeed = 5.0
)

func polygonP(pts ...float64) plc.Primitive {
	p := plc.Primitive{Type: plc.PrimitivePolygon}
	for i := 0; i+1 < len(pts); i += 2 {
		p.Points = append(p.Points, geom.Point{X: pts[i], Y: pts[i+1]})
	}
	return p
}

func squareP(x0, y0, x1, y1 float64) plc.Primitive {
	return polygonP(x0, y0, x1, y0, x1, y1, x0, y1)
}

func circleP(cx, cy, r float64) plc.Primitive {
	return plc.Primitive{Type: plc.PrimitiveCircle, Cx: new(cx), Cy: new(cy), Radius: new(r)}
}

func request(side string, diameter float64, prims ...plc.Primitive) ProfileRequest {
	return ProfileRequest{
		Primitives: prims, DefaultSpeed: workSpeed, RapidSpeed: rapidSpeed, SafeZ: 5, WorkZ: 0,
		ToolDiameter: diameter, Side: side, Depth: 1, StepDown: 1, PlungeSpeed: plungeSpeed,
	}
}

// move is one parsed command; for arcs (i, j) is the point the arc passes through.
type move struct {
	op            string
	x, y, z, i, j float64
	v             float64
}

func parse(t *testing.T, out []string) []move {
	t.Helper()
	moves := make([]move, 0, len(out))
	for _, s := range out {
		var m move
		var err error
		m.op, _, _ = strings.Cut(s, " ")
		switch m.op {
		case "J", "L":
			_, err = fmt.Sscanf(s[2:], "X %f, Y %f, Z %f, V %f", &m.x, &m.y, &m.z, &m.v)
		case "A":
			_, err = fmt.Sscanf(s[2:], "X %f, Y %f, Z %f, I %f, J %f, V %f", &m.x, &m.y, &m.z, &m.i, &m.j, &m.v)
		case "WAIT":
			continue
		default:
			err = fmt.Errorf("unknown command")
		}
		if err != nil {
			t.Fatalf("command %q: %v", s, err)
		}
		moves = append(moves, m)
	}
	return moves
}

// cut is one uninterrupted run of cutting moves at a single Z, traced as XY points with the
// arcs sampled along the side of their through point.
type cut struct {
	z    float64
	path geom.Path
}

func cuts(t *testing.T, moves []move) []cut {
	t.Helper()
	var out []cut
	var pos geom.Point
	for k, m := range moves {
		end := geom.Point{X: m.x, Y: m.y}
		if m.v == workSpeed {
			if k == 0 || moves[k-1].v != workSpeed {
				out = append(out, cut{z: m.z, path: geom.Path{pos}})
			}
			c := &out[len(out)-1]
			if m.z != c.z {
				t.Fatalf("move %d changes Z while cutting: %+v", k, m)
			}
			if m.op == "A" {
				c.path = append(c.path, sampleArc(t, pos, geom.Point{X: m.i, Y: m.j}, end)...)
			} else {
				c.path = append(c.path, end)
			}
		}
		pos = end
	}
	return out
}

// sampleArc returns points on the circle through start, mid and end, going from start through
// mid to end, without the start point.
func sampleArc(t *testing.T, start, mid, end geom.Point) geom.Path {
	t.Helper()
	ax, ay, bx, by := mid.X-start.X, mid.Y-start.Y, end.X-start.X, end.Y-start.Y
	d := 2 * (ax*by - ay*bx)
	if math.Abs(d) < 1e-9 {
		t.Fatalf("arc %v %v %v has no circle", start, mid, end)
	}
	a2, b2 := ax*ax+ay*ay, bx*bx+by*by
	c := geom.Point{X: start.X + (by*a2-ay*b2)/d, Y: start.Y + (ax*b2-bx*a2)/d}
	angle := func(p geom.Point) float64 { return math.Atan2(p.Y-c.Y, p.X-c.X) }
	a0 := angle(start)
	sweep := math.Mod(angle(end)-a0+4*math.Pi, 2*math.Pi)
	if d < 0 { // start, mid, end turn clockwise
		sweep -= 2 * math.Pi
	}
	r := start.Distance(c)
	// 5 mrad steps sag 3 µm on a 1 m radius: the samples trace the arc, not a coarse polygon
	n := max(1, int(math.Ceil(math.Abs(sweep)/0.005)))
	path := make(geom.Path, n)
	for k := 1; k <= n; k++ {
		a := a0 + sweep*float64(k)/float64(n)
		path[k-1] = geom.Point{X: c.X + r*math.Cos(a), Y: c.Y + r*math.Sin(a)}
	}
	path[n-1] = end
	return path
}

func width(p geom.Path) float64 {
	minX, _, maxX, _ := p.Bounds()
	return maxX - minX
}

func mustProfile(t *testing.T, req ProfileRequest) []move {
	t.Helper()
	res, err := Profile(req)
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if len(res.Warnings) > 0 {
		t.Fatalf("warnings %q", res.Warnings)
	}
	if res.Count != len(res.Output) || len(res.Commands) != len(res.Output) {
		t.Fatalf("count %d, %d commands, %d output lines", res.Count, len(res.Commands), len(res.Output))
	}
	for i, c := range res.Commands {
		if c.Index != i || c.CommandStr != res.Output[i] || !strings.HasPrefix(c.CommandStr, c.Type+" ") {
			t.Fatalf("command %d is %+v, output %q", i, c, res.Output[i])
		}
	}
	return parse(t, res.Output)
}

// squareDistance is the distance from a point to the outline of the square 0..20.
func squareDistance(p geom.Point) float64 {
	dx := math.Max(math.Max(-p.X, 0), p.X-20)
	dy := math.Max(math.Max(-p.Y, 0), p.Y-20)
	return math.Hypot(dx, dy)
}

// Rapid to the start above the stock, plunge, one closed loop one radius from the part, retract
// at the start and go home at safe Z.
func TestProfile_OutsideSquareOnePass(t *testing.T) {
	req := request("outside", 6, lineP(0, 0, 20, 0), lineP(20, 0, 20, 20), lineP(20, 20, 0, 20), lineP(0, 20, 0, 0))

	moves := mustProfile(t, req)
	if len(moves) < 6 {
		t.Fatalf("program %+v is too short for a loop", moves)
	}

	start := geom.Point{X: moves[0].x, Y: moves[0].y}
	head := []move{{op: "J", x: start.X, y: start.Y, z: 5, v: rapidSpeed}, {op: "L", x: start.X, y: start.Y, z: -1, v: plungeSpeed}}
	tail := []move{{op: "J", x: start.X, y: start.Y, z: 5, v: rapidSpeed}, {op: "J", z: 5, v: rapidSpeed}}
	if !slices.Equal(moves[:2], head) || !slices.Equal(moves[len(moves)-2:], tail) {
		t.Fatalf("program %+v\nwant it to start with %+v and end with %+v", moves, head, tail)
	}

	c := cuts(t, moves)
	if len(c) != 1 || c[0].z != -1 {
		t.Fatalf("got cuts %+v, want one loop at Z -1", c)
	}
	loop := c[0].path
	if loop[len(loop)-1].Distance(start) > 1e-9 {
		t.Fatalf("loop ends at %v, not back at its start %v", loop[len(loop)-1], start)
	}
	for _, p := range loop {
		// 0.005 arc tolerance of the offset, 0.01 of the fitter, 0.0005 of the printed decimals
		if d := squareDistance(p); math.Abs(d-3) > 0.016 {
			t.Fatalf("tool centre %v is %.4f mm from the part, want 3", p, d)
		}
	}
	if a, want := signedArea(loop), 400+3*80+9*math.Pi; math.Abs(a-want) > 0.5 {
		t.Fatalf("signed area %.3f, want %.3f (counterclockwise)", a, want)
	}
}

// Passes go down by the step-down from the stock surface at work Z, the last one exactly at the
// full depth, and each ring is plunged again at every level without leaving the cut.
func TestProfile_StepsDownFromWorkZ(t *testing.T) {
	req := request("outside", 2, squareP(0, 0, 20, 20))
	req.WorkZ, req.SafeZ, req.Depth, req.StepDown, req.WaitTime = 2, 7, 1.2, 0.5, 300

	res, err := Profile(req)
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	moves := parse(t, res.Output)

	var plunges []float64
	for _, m := range moves {
		switch {
		case m.v == plungeSpeed:
			plunges = append(plunges, m.z)
		case m.op == "J" && m.z != 7:
			t.Fatalf("rapid move below safe Z: %+v", m)
		}
	}
	if want := []float64{1.5, 1, 0.8}; !slices.Equal(plunges, want) {
		t.Fatalf("plunges to %v, want %v", plunges, want)
	}
	if waits := strings.Count(strings.Join(res.Output, "\n"), "WAIT 300"); waits != 3 {
		t.Fatalf("%d waits, want one after each plunge", waits)
	}
	c := cuts(t, moves)
	if len(c) != 3 || c[0].z != 1.5 || c[1].z != 1 || c[2].z != 0.8 {
		t.Fatalf("got %d cuts, want one per level", len(c))
	}
}

// With the spindle turning clockwise seen from above, conventional cutting keeps the finished
// wall on the left of the tool: outside an outline that is counterclockwise, inside it clockwise.
func TestProfile_DirectionFollowsSideAndCutting(t *testing.T) {
	tests := []struct {
		side, direction  string
		outlineCCW, hole bool // hole: whether the hole ring turns counterclockwise
	}{
		{"outside", "", true, false},
		{"outside", "conventional", true, false},
		{"outside", "climb", false, true},
		{"inside", "conventional", false, true},
		{"inside", "climb", true, false},
	}
	for _, tt := range tests {
		t.Run(tt.side+" "+tt.direction, func(t *testing.T) {
			req := request(tt.side, 2, squareP(0, 0, 40, 40), circleP(20, 20, 8))
			req.Direction = tt.direction

			c := cuts(t, mustProfile(t, req))

			if len(c) != 2 {
				t.Fatalf("got %d cuts, want hole and outline", len(c))
			}
			hole, outline := c[0].path, c[1].path
			if width(hole) > width(outline) {
				t.Fatalf("outline (width %.2f) cut before the hole (width %.2f)", width(outline), width(hole))
			}
			if ccw := signedArea(outline) > 0; ccw != tt.outlineCCW {
				t.Errorf("outline counterclockwise = %v, want %v", ccw, tt.outlineCCW)
			}
			if ccw := signedArea(hole) > 0; ccw != tt.hole {
				t.Errorf("hole counterclockwise = %v, want %v", ccw, tt.hole)
			}
			// the hole is a circle: the sampled arcs must stay on its offset, on the right side
			r := 8.0 - 1
			if tt.side == "inside" {
				r = 8 + 1
			}
			for _, p := range hole {
				if d := p.Distance(geom.Point{X: 20, Y: 20}); math.Abs(d-r) > 0.016 {
					t.Fatalf("hole ring point %v at radius %.4f, want %.1f", p, d, r)
				}
			}
			if a := math.Abs(signedArea(hole)); math.Abs(a-math.Pi*r*r) > 0.5 {
				t.Fatalf("hole ring area %.3f, want %.3f", a, math.Pi*r*r)
			}
		})
	}
}

// After each ring the tool goes to the nearest ring it may cut and enters it at its nearest
// vertex: from X 0 Y 0 to the square at the origin, then x 50, then x 100, whatever the drawing
// order.
func TestProfile_RapidsGoToTheNearestRing(t *testing.T) {
	req := request("outside", 2, squareP(100, 0, 110, 10), squareP(0, 0, 10, 10), squareP(50, 0, 60, 10))

	c := cuts(t, mustProfile(t, req))

	if len(c) != 3 {
		t.Fatalf("got %d cuts, want 3", len(c))
	}
	var pos geom.Point
	for k, wantMinX := range []float64{-1, 49, 99} {
		if minX, _, _, _ := c[k].path.Bounds(); math.Abs(minX-wantMinX) > 0.01 {
			t.Fatalf("cut %d starts at x %.3f, want the ring from x %.0f", k, minX, wantMinX)
		}
		start := c[k].path[0]
		for _, p := range c[k].path {
			// arc samples may come up to the fit tolerance closer than the vertices
			if pos.Distance(p) < pos.Distance(start)-0.02 {
				t.Fatalf("cut %d enters at %v, but %v is nearer to %v", k, start, p, pos)
			}
		}
		pos = start
	}
}

// A part standing inside the hole of another part: cutting the hole first would free the slug
// that still holds the inner part, so a ring is cut only after the rings inside it, even when
// the outline is nearer to X 0 Y 0.
func TestProfile_CutsInnermostContoursFirst(t *testing.T) {
	req := request("outside", 2, squareP(0, 0, 60, 60), squareP(80, 0, 90, 10), squareP(25, 25, 35, 35), squareP(10, 10, 50, 50))

	c := cuts(t, mustProfile(t, req))

	var widths []float64
	for _, k := range c {
		widths = append(widths, math.Round(width(k.path)))
	}
	if len(widths) != 4 || widths[0] != 12 || widths[1] != 38 || !slices.Contains(widths[2:], 62) || !slices.Contains(widths[2:], 12) {
		t.Fatalf("cut widths %v, want the inner part (12), the hole (38), then the two outlines (62, 12)", widths)
	}
}

// A contour whose ring vanishes is left uncut: the job is still valid, but the response names the
// contour by its bounds. The hole in the part standing in a closed hole is wide enough, so it is
// cut and not reported.
func TestProfile_WarnsAboutContoursTheToolCannotReach(t *testing.T) {
	tests := []struct {
		name  string
		side  string
		prims []plc.Primitive
		want  []string
	}{
		{"hole narrower than the tool", "outside",
			[]plc.Primitive{squareP(0, 0, 60, 60), squareP(14, 28, 18, 32), squareP(40, 25, 50, 35)},
			[]string{"(14.000, 28.000) to (18.000, 32.000)"}},
		{"hole closed by the part standing in it", "outside",
			[]plc.Primitive{squareP(0, 0, 100, 100), squareP(20, 20, 80, 80), squareP(22, 22, 78, 78), squareP(40, 40, 60, 60)},
			[]string{"(20.000, 20.000) to (80.000, 80.000)"}},
		{"outline narrower than the tool", "inside",
			[]plc.Primitive{squareP(0, 0, 4, 4), squareP(10, 0, 30, 20)},
			[]string{"(0.000, 0.000) to (4.000, 4.000)"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := Profile(request(tt.side, 6, tt.prims...))
			if err != nil {
				t.Fatalf("Profile: %v", err)
			}
			if len(res.Warnings) != len(tt.want) {
				t.Fatalf("warnings %q, want %d", res.Warnings, len(tt.want))
			}
			for i, w := range tt.want {
				if !strings.Contains(res.Warnings[i], w) {
					t.Errorf("warning %q does not name the contour %s", res.Warnings[i], w)
				}
			}
			if len(cuts(t, parse(t, res.Output))) == 0 {
				t.Fatal("nothing is cut")
			}
		})
	}
}

func TestProfile_RejectsWhatCannotBeCut(t *testing.T) {
	valid := func() ProfileRequest { return request("outside", 3, squareP(0, 0, 20, 20)) }
	tests := []struct {
		name   string
		change func(*ProfileRequest)
	}{
		{"open contour", func(r *ProfileRequest) { r.Primitives = append(r.Primitives, lineP(30, 0, 40, 0)) }},
		{"no primitives", func(r *ProfileRequest) { r.Primitives = nil }},
		{"tool wider than the only contour", func(r *ProfileRequest) { r.Side, r.ToolDiameter = "inside", 25 }},
		{"no tool diameter", func(r *ProfileRequest) { r.ToolDiameter = 0 }},
		{"unknown side", func(r *ProfileRequest) { r.Side = "" }},
		{"unknown direction", func(r *ProfileRequest) { r.Direction = "down" }},
		{"no depth", func(r *ProfileRequest) { r.Depth = 0 }},
		{"no step-down", func(r *ProfileRequest) { r.StepDown = -1 }},
		{"no plunge speed", func(r *ProfileRequest) { r.PlungeSpeed = 0 }},
		{"no cutting speed", func(r *ProfileRequest) { r.DefaultSpeed = 0 }},
		{"no rapid speed", func(r *ProfileRequest) { r.RapidSpeed = 0 }},
		{"safe Z not above work Z", func(r *ProfileRequest) { r.SafeZ = r.WorkZ }},
		{"negative wait", func(r *ProfileRequest) { r.WaitTime = -1 }},
		{"malformed primitive", func(r *ProfileRequest) { r.Primitives = []plc.Primitive{{Type: plc.PrimitiveCircle}} }},
	}
	if _, err := Profile(valid()); err != nil {
		t.Fatalf("valid request: %v", err)
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := valid()
			tt.change(&req)
			if res, err := Profile(req); err == nil {
				t.Fatalf("want an error, got %d commands", res.Count)
			}
		})
	}
}
