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

// request cuts through a 1 mm piece on a bed at Z -1, so the top of the piece is at Z 0, and
// plunges straight down (ramp angle 90°) unless a test is about ramps.
func request(side string, diameter float64, prims ...plc.Primitive) ProfileRequest {
	return ProfileRequest{
		Primitives: prims, DefaultSpeed: workSpeed, RapidSpeed: rapidSpeed, SafeZ: 5, WorkZ: -1,
		Thickness: 1, Through: true,
		ToolDiameter: diameter, Side: side, StepDown: 1, PlungeSpeed: plungeSpeed, RampAngle: 90,
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

// Passes go down by the step-down from the top of the piece, work Z + thickness, the last one
// exactly at the bottom of the cut, and each ring is plunged again at every level without leaving
// the cut.
func TestProfile_OnTheLineFollowsTheDrawnContour(t *testing.T) {
	widths := map[string]float64{}
	for _, side := range []string{SideOutside, SideOn, SideInside} {
		c := cuts(t, mustProfile(t, request(side, 4, squareP(0, 0, 20, 20))))
		if len(c) != 1 {
			t.Fatalf("%s: got %d cuts, want one", side, len(c))
		}
		widths[side] = width(c[0].path)
	}
	if math.Abs(widths[SideOn]-20) > 0.02 {
		t.Errorf("on the line the cut is %.3f mm wide, want the drawn 20", widths[SideOn])
	}
	if math.Abs(widths[SideOutside]-24) > 0.02 || math.Abs(widths[SideInside]-16) > 0.02 {
		t.Errorf("the offsets moved: outside %.3f (want 24), inside %.3f (want 16)",
			widths[SideOutside], widths[SideInside])
	}
}

func TestProfile_OnTheLineCutsWhatTheToolCannotEnter(t *testing.T) {
	small := squareP(0, 0, 2, 2)
	if _, err := Profile(request(SideInside, 6, small)); err == nil {
		t.Fatal("a 6 mm tool must not fit inside a 2 mm square")
	}

	res, err := Profile(request(SideOn, 6, small))
	if err != nil {
		t.Fatalf("Profile on the line: %v", err)
	}
	if len(res.Warnings) > 0 {
		t.Fatalf("warnings %q: on the line no contour is offset away", res.Warnings)
	}
	c := cuts(t, parse(t, res.Output))
	if len(c) != 1 {
		t.Fatalf("got %d cuts, want one", len(c))
	}
	if w := width(c[0].path); math.Abs(w-2) > 0.02 {
		t.Errorf("the cut is %.3f mm wide, want the drawn 2", w)
	}
}

func TestProfile_StepsDownFromTheTopOfThePiece(t *testing.T) {
	req := request("outside", 2, squareP(0, 0, 20, 20))
	req.WorkZ, req.Thickness, req.Overcut, req.SafeZ, req.StepDown, req.WaitTime = 1, 1, 0.2, 7, 0.5, 300

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

// Work Z is the bed: a through cut goes down to the overcut below it, any other cut the depth
// below the top of the piece.
func TestProfile_CutsThroughThePieceOrToTheDepth(t *testing.T) {
	tests := []struct {
		name    string
		through bool
		depth   float64
		want    []float64
	}{
		{"through, into the bed by the overcut", true, 0, []float64{0.6, -0.2}},
		{"to a depth", false, 0.5, []float64{1.1}},
		{"to a depth as deep as the piece", false, 1.6, []float64{0.6, 0}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := request("outside", 2, squareP(0, 0, 20, 20))
			req.WorkZ, req.Thickness, req.Overcut, req.Through, req.Depth = 0, 1.6, 0.2, tt.through, tt.depth

			var levels []float64
			for _, c := range cuts(t, mustProfile(t, req)) {
				levels = append(levels, c.z)
			}
			if !slices.Equal(levels, tt.want) {
				t.Fatalf("cuts at Z %v, want %v", levels, tt.want)
			}
		})
	}
}

// The tool goes straight down to the stock surface, then enters each level along the ring and
// back to its start, sinking at the ramp angle, so the lap at the new level starts where the ring
// always starts. A ramp longer than the ring goes round it. The ramp runs at the cutting speed
// unless the tool would then sink faster than the plunge speed.
func TestProfile_RampsDownAlongTheRingAndBack(t *testing.T) {
	insideSmallSquare := func(p geom.Point) float64 { return math.Min(math.Min(p.X, 4-p.X), math.Min(p.Y, 4-p.Y)) }
	tests := []struct {
		name     string
		req      ProfileRequest
		slope    float64 // tangent of the ramp angle
		speed    float64
		distance func(geom.Point) float64 // from the drawn contour: the tool radius on the ring
	}{
		{"shorter than the ring, sinking at the plunge speed", request("outside", 2, squareP(0, 0, 20, 20)),
			0.1, 2 / math.Sin(math.Atan(0.1)), squareDistance},
		{"round a ring shorter than the ramp, at the cutting speed", request("inside", 2, squareP(0, 0, 4, 4)),
			0.02, workSpeed, insideSmallSquare},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.req
			req.StepDown, req.PlungeSpeed, req.RampAngle = 0.5, 2, math.Atan(tt.slope)*180/math.Pi

			moves := mustProfile(t, req)

			start := geom.Point{X: moves[0].x, Y: moves[0].y}
			if m := moves[1]; m != (move{op: "L", x: start.X, y: start.Y, v: 2}) {
				t.Fatalf("move 1 is %+v, want straight down to the stock surface at plunge speed", m)
			}
			var ramps []geom.Path
			var tops, bottoms []float64
			prev, inRamp := moves[1], false
			for _, m := range moves[2:] {
				sinks := m.op == "L" && m.z < prev.z && (m.x != prev.x || m.y != prev.y)
				switch {
				case sinks && !inRamp:
					ramps, tops = append(ramps, geom.Path{{X: prev.x, Y: prev.y}}), append(tops, prev.z)
				case !sinks && inRamp:
					bottoms = append(bottoms, prev.z)
				}
				if sinks {
					ramps[len(ramps)-1] = append(ramps[len(ramps)-1], geom.Point{X: m.x, Y: m.y})
					if math.Abs(m.v-tt.speed) > 0.001 {
						t.Fatalf("ramp move %+v, want V %.3f", m, tt.speed)
					}
				}
				prev, inRamp = m, sinks
			}
			if !slices.Equal(tops, []float64{0, -0.5}) || !slices.Equal(bottoms, []float64{-0.5, -1}) {
				t.Fatalf("ramps from Z %v down to %v, want from 0 and -0.5 down to -0.5 and -1", tops, bottoms)
			}
			for k, ramp := range ramps {
				length := 0.0
				for i, p := range ramp {
					// the ramp may take chords 0.01 mm off the ring, besides Clipper's 5 µm arcs,
					// its 1 µm rounding and the printed 0.5 µm
					if d := tt.distance(p); math.Abs(d-1) > 0.017 {
						t.Fatalf("ramp %d leaves the ring at %v (%.4f mm from the contour)", k, p, d)
					}
					if q := ramp[len(ramp)-1-i]; p.Distance(q) > 0.001 {
						t.Fatalf("ramp %d does not come back the way it went: point %d %v, mirror %v", k, i, p, q)
					}
					if i > 0 {
						length += ramp[i-1].Distance(p)
					}
				}
				if ramp[0] != start || math.Abs(length-0.5/tt.slope) > 0.02 {
					t.Fatalf("ramp %d starts at %v (ring start %v) and runs %.3f mm, want %.3f", k, ramp[0], start, length, 0.5/tt.slope)
				}
			}
		})
	}
}

// A densely sampled contour must not turn every ramp into hundreds of commands: the ramp leaves
// out the vertices it does not need and stays within the fit tolerance of the ring.
func TestProfile_RampLeavesOutVerticesItDoesNotNeed(t *testing.T) {
	var circle []float64
	for k := range 2000 { // a vertex every 31 µm on a 10 mm radius
		a := 2 * math.Pi * float64(k) / 2000
		circle = append(circle, 10*math.Cos(a), 10*math.Sin(a))
	}
	req := request("outside", 2, polygonP(circle...))
	// one 5 mm ramp, whose moves run at 2 / sin(5.7°) = 20.1 mm/s
	req.Through, req.Depth, req.StepDown, req.RampAngle, req.PlungeSpeed = false, 0.5, 0.5, math.Atan(0.1)*180/math.Pi, 2

	moves := mustProfile(t, req)

	pos := geom.Point{X: moves[1].x, Y: moves[1].y}
	var ramp geom.Path
	for k := 2; k < len(moves) && math.Abs(moves[k].v-20.1) < 0.001; k++ {
		ramp = append(ramp, geom.Point{X: moves[k].x, Y: moves[k].y})
	}
	// on the 11 mm ring a chord that sags 0.01 mm spans 0.94 mm: about 3 moves each way
	if len(ramp) < 2 || len(ramp) > 10 {
		t.Fatalf("ramp of %d moves, want a handful", len(ramp))
	}
	for _, p := range ramp {
		mid := geom.Point{X: (pos.X + p.X) / 2, Y: (pos.Y + p.Y) / 2}
		for _, q := range []geom.Point{p, mid} {
			if r := q.Distance(geom.Point{}); r < 11-0.012 || r > 11+0.001 {
				t.Fatalf("ramp passes %v at radius %.4f, want 11 within the fit tolerance", q, r)
			}
		}
		pos = p
	}
}

// A ramp may go round a small ring many times, as a helix would, but not more than 1000 times: a
// shallow angle or a deep step-down would otherwise fill the memory with ramp moves (1e-9° on
// this ring is 11 GB of points). The profile is refused then, naming the ring; 900 laps are cut.
func TestProfile_RampsRoundTheRingAtMost1000Times(t *testing.T) {
	// the ring 1 mm outside the 20 mm square is 80 + 2π mm long; the ramp goes out and back
	ring := 80 + 2*math.Pi
	angle := func(laps float64) float64 { return math.Atan(0.5/(laps*ring)) * 180 / math.Pi }
	req := request("outside", 2, squareP(0, 0, 20, 20))
	req.StepDown = 0.5

	req.RampAngle = angle(900)
	if _, err := Profile(req); err != nil {
		t.Fatalf("900 laps: %v", err)
	}
	for _, degrees := range []float64{angle(1100), 1e-9} {
		req.RampAngle = degrees
		_, err := Profile(req)
		if err == nil || !strings.Contains(err.Error(), "1000") || !strings.Contains(err.Error(), "(-1.000, -1.000) to (21.000, 21.000)") {
			t.Fatalf("ramp angle %g°: error %v, want one naming the ring and the 1000 laps", degrees, err)
		}
	}
}

// A ring shorter than the tool diameter leaves no room to ramp: going round it would send
// hundreds of moves, so the tool plunges straight down there.
func TestProfile_PlungesStraightIntoRingsShorterThanTheTool(t *testing.T) {
	req := request("inside", 2, squareP(0, 0, 2.4, 2.4)) // a ring 0.4 mm square
	req.StepDown, req.RampAngle = 0.5, 3

	moves := mustProfile(t, req)

	start := geom.Point{X: moves[0].x, Y: moves[0].y}
	var plunges []float64
	for _, m := range moves {
		if m.v == plungeSpeed {
			plunges = append(plunges, m.z)
		}
		if m.z < 5 && m.v != workSpeed && (m.x != start.X || m.y != start.Y) {
			t.Fatalf("move %+v leaves the ring start %v below safe Z without cutting", m, start)
		}
	}
	if !slices.Equal(plunges, []float64{-0.5, -1}) {
		t.Fatalf("plunges to %v, want straight to -0.5 and -1", plunges)
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
		{"on", "conventional", true, false},
		{"on", "climb", false, true},
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
			switch tt.side {
			case "inside":
				r = 8 + 1
			case "on":
				r = 8
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

// A warning says how wide the detail is and which primitives draw it, so the drawing can mark it
// and the user knows what tool would reach it.
func TestProfile_MeasuresTheDetailsTheToolCannotReach(t *testing.T) {
	hole := squareP(14, 28, 18, 32)
	hole.ID = "hole"
	outline := squareP(0, 0, 60, 60)
	outline.ID = "outline"

	res, err := Profile(request(SideOutside, 6, outline, hole))
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if len(res.Unreached) != 1 {
		t.Fatalf("%d details out of reach, want 1: %+v", len(res.Unreached), res.Unreached)
	}
	got := res.Unreached[0]
	if math.Abs(got.Width-4) > 0.02 {
		t.Errorf("the 4 mm hole measures %.3f mm", got.Width)
	}
	if !slices.Equal(got.PrimitiveIDs, []string{"hole"}) {
		t.Errorf("drawn by %q, want the hole alone", got.PrimitiveIDs)
	}
	if got.MinX != 14 || got.MinY != 28 || got.MaxX != 18 || got.MaxY != 32 {
		t.Errorf("bounds (%.3f, %.3f) to (%.3f, %.3f)", got.MinX, got.MinY, got.MaxX, got.MaxY)
	}
	// the measurement is rounded down, so the tool it names really does fit
	if !strings.Contains(res.Warnings[0], fmt.Sprintf("%.3f mm", got.Width)) || !strings.Contains(res.Warnings[0], "6.000 mm") {
		t.Errorf("warning %q says neither how wide the detail is nor the tool it was cut with", res.Warnings[0])
	}
}

// A round hole is as wide as its diameter, whatever the fit tolerance of the contour.
func TestProfile_MeasuresARoundHoleByItsDiameter(t *testing.T) {
	res, err := Profile(request(SideOutside, 6, squareP(0, 0, 60, 60), circleP(30, 30, 1.5)))
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if len(res.Unreached) != 1 || math.Abs(res.Unreached[0].Width-3) > 0.05 {
		t.Fatalf("details out of reach %+v, want one 3 mm wide", res.Unreached)
	}
}

// Nothing at all fits some details, and the warning must say so rather than offer a tool of 0 mm.
func TestProfile_SaysWhenNoToolFitsTheDetail(t *testing.T) {
	res, err := Profile(request(SideOutside, 6, squareP(0, 0, 60, 60), squareP(20, 30, 20.005, 40)))
	if err != nil {
		t.Fatalf("Profile: %v", err)
	}
	if len(res.Unreached) != 1 || res.Unreached[0].Width != 0 {
		t.Fatalf("details out of reach %+v, want one no tool fits", res.Unreached)
	}
	if !strings.Contains(res.Warnings[0], "no tool") {
		t.Errorf("warning %q does not say that no tool fits", res.Warnings[0])
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
		{"no thickness", func(r *ProfileRequest) { r.Thickness = 0 }},
		{"negative overcut", func(r *ProfileRequest) { r.Overcut = -0.1 }},
		{"no depth when not through", func(r *ProfileRequest) { r.Through, r.Depth = false, 0 }},
		{"depth below the piece", func(r *ProfileRequest) { r.Through, r.Depth = false, 1.1 }},
		{"no step-down", func(r *ProfileRequest) { r.StepDown = -1 }},
		{"step-down below the PLC resolution", func(r *ProfileRequest) { r.Through, r.Depth, r.StepDown = false, 0.001, 0.0005 }},
		{"more than 1000 passes", func(r *ProfileRequest) { r.WorkZ, r.Thickness, r.StepDown = -1001, 1001, 1 }},
		{"no plunge speed", func(r *ProfileRequest) { r.PlungeSpeed = 0 }},
		{"no ramp angle", func(r *ProfileRequest) { r.RampAngle = 0 }},
		{"ramp angle past vertical", func(r *ProfileRequest) { r.RampAngle = 91 }},
		{"no cutting speed", func(r *ProfileRequest) { r.DefaultSpeed = 0 }},
		{"no rapid speed", func(r *ProfileRequest) { r.RapidSpeed = 0 }},
		{"safe Z not above the piece", func(r *ProfileRequest) { r.SafeZ = 0 }},
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
