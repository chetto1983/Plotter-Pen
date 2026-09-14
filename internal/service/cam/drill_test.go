package cam

import (
	"slices"
	"strings"
	"testing"

	"plotter-pen/internal/service/plc"
)

// drillRequest drills the holes from 0.4 to 1.2 mm with a 1 mm drill, 1.6 mm deep, without pecks.
func drillRequest(prims ...plc.Primitive) DrillRequest {
	return DrillRequest{
		Primitives: prims, DefaultSpeed: workSpeed, RapidSpeed: rapidSpeed, SafeZ: 5, WorkZ: 0,
		Depth: 1.6, PlungeSpeed: plungeSpeed, RetractClearance: 1,
		DrillDiameter: 1, MinHoleDiameter: 0.4, MaxHoleDiameter: 1.2,
	}
}

func mustDrill(t *testing.T, req DrillRequest) plc.ExtractResponse {
	t.Helper()
	res, err := Drill(req)
	if err != nil {
		t.Fatalf("Drill: %v", err)
	}
	return res
}

func sameProgram(t *testing.T, got []string, want ...string) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Fatalf("program:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

// Like G81 with G98: rapid over the hole at safe Z, rapid down to the retract plane, feed to the
// bottom, rapid back to safe Z. Every command of the hole names its circle.
func TestDrill_OneHoleWithoutPecks(t *testing.T) {
	hole := circleP(10, 5, 0.5)
	hole.ID = "h1"

	res := mustDrill(t, drillRequest(hole))

	sameProgram(t, res.Output,
		"J X 10.000, Y 5.000, Z 5.000, V 1000.000",
		"J X 10.000, Y 5.000, Z 1.000, V 1000.000",
		"L X 10.000, Y 5.000, Z -1.600, V 5.000",
		"J X 10.000, Y 5.000, Z 5.000, V 1000.000",
		"J X 0.000, Y 0.000, Z 5.000, V 1000.000",
	)
	if res.Count != len(res.Output) || len(res.Commands) != res.Count {
		t.Fatalf("count %d, %d output lines, %d commands", res.Count, len(res.Output), len(res.Commands))
	}
	for i, c := range res.Commands {
		if want := map[bool]string{true: "h1", false: ""}[i < 4]; c.PrimitiveID != want || c.CommandStr != res.Output[i] {
			t.Fatalf("command %d %+v, want primitive %q", i, c, want)
		}
	}
}

// Like G83: after each peck but the last the drill rapids out to the retract plane, then rapids
// back down to 0.254 mm above the bottom it reached. The wait time is a dwell at the bottom.
func TestDrill_PecksOutToTheRetractPlane(t *testing.T) {
	req := drillRequest(circleP(10, 5, 0.5))
	req.PeckDepth, req.WaitTime = 0.8, 200

	sameProgram(t, mustDrill(t, req).Output,
		"J X 10.000, Y 5.000, Z 5.000, V 1000.000",
		"J X 10.000, Y 5.000, Z 1.000, V 1000.000",
		"L X 10.000, Y 5.000, Z -0.800, V 5.000",
		"J X 10.000, Y 5.000, Z 1.000, V 1000.000",
		"J X 10.000, Y 5.000, Z -0.546, V 1000.000",
		"L X 10.000, Y 5.000, Z -1.600, V 5.000",
		"WAIT 200",
		"J X 10.000, Y 5.000, Z 5.000, V 1000.000",
		"J X 0.000, Y 0.000, Z 5.000, V 1000.000",
	)
}

// Like Fusion's "drill tip through bottom": the drill goes deeper by the length of its point,
// (D/2)/tan(angle/2), so its full diameter reaches the depth. The angle is 118° when not given.
func TestDrill_TipThroughBottom(t *testing.T) {
	tests := []struct {
		name       string
		through    bool
		angle      float64
		peck       float64
		wantPlunge []float64
	}{
		{"tip not through", false, 118, 0, []float64{-1.6}},
		{"default 118° point", true, 0, 0, []float64{-1.9}},
		{"90° point", true, 90, 0, []float64{-2.1}},
		{"flat drill", true, 180, 0, []float64{-1.6}},
		{"pecks cover the point too", true, 90, 1, []float64{-1, -2, -2.1}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := drillRequest(circleP(0, 0, 0.5))
			req.TipThrough, req.TipAngle, req.PeckDepth = tt.through, tt.angle, tt.peck

			var plunges []float64
			for _, m := range parse(t, mustDrill(t, req).Output) {
				if m.op == "L" {
					plunges = append(plunges, m.z)
				}
			}
			if !slices.Equal(plunges, tt.wantPlunge) {
				t.Fatalf("pecks down to %v, want %v", plunges, tt.wantPlunge)
			}
		})
	}
}

// holes returns the XY of the holes in drilling order: where the drill goes down to the retract plane.
func holes(t *testing.T, out []string) [][2]float64 {
	t.Helper()
	var xy [][2]float64
	moves := parse(t, out)
	for k := 1; k < len(moves); k++ {
		if moves[k].op == "J" && moves[k-1].op == "J" && moves[k].z == 1 && moves[k-1].z == 5 {
			xy = append(xy, [2]float64{moves[k].x, moves[k].y})
		}
	}
	return xy
}

// Only circles are drilled, those with a diameter in the range, both ends included. The range
// allows 1 µm, so diameters that went through an inch to mm conversion still match.
func TestDrill_DrillsTheCirclesInTheDiameterRange(t *testing.T) {
	req := drillRequest(
		circleP(1, 0, 0.2),                     // 0.4, the smallest
		circleP(2, 0, 0.15),                    // 0.3, too small
		circleP(3, 0, 0.6),                     // 1.2, the largest
		circleP(4, 0, 0.65),                    // 1.3, too large
		circleP(5, 0, 0.0099999999999999*25.4), // 0.508 from a DXF in inches
		squareP(10, 10, 11, 11),
		plc.Primitive{Type: plc.PrimitiveArc, X1: new(20.0), Y1: new(0.0), X2: new(21.0), Y2: new(1.0), Cx: new(20.0), Cy: new(1.0), Radius: new(0.5)},
	)
	req.MinHoleDiameter, req.MaxHoleDiameter = 0.4, 1.2
	if got, want := holes(t, mustDrill(t, req).Output), [][2]float64{{1, 0}, {3, 0}, {5, 0}}; !slices.Equal(got, want) {
		t.Fatalf("drilled %v, want %v", got, want)
	}

	req.MinHoleDiameter, req.MaxHoleDiameter = 0.508, 0.508
	if got, want := holes(t, mustDrill(t, req).Output), [][2]float64{{5, 0}}; !slices.Equal(got, want) {
		t.Fatalf("drilled %v for exactly 0.508, want %v", got, want)
	}
}

// A pad drawn over its hole, or a circle drawn twice, is one hole: centres within 0.01 mm are
// drilled once.
func TestDrill_DrillsCoincidentCirclesOnce(t *testing.T) {
	req := drillRequest(circleP(5, 5, 0.5), circleP(5.005, 5, 0.4), circleP(5, 5.02, 0.5))

	if got, want := holes(t, mustDrill(t, req).Output), [][2]float64{{5, 5}, {5, 5.02}}; !slices.Equal(got, want) {
		t.Fatalf("drilled %v, want %v", got, want)
	}
}

// From X 0 Y 0 the drill always goes to the nearest hole not drilled yet, whatever the drawing order.
func TestDrill_GoesToTheNearestHole(t *testing.T) {
	req := drillRequest(circleP(30, 0, 0.5), circleP(10, 0, 0.5), circleP(-5, 0, 0.5), circleP(20, 1, 0.5))

	if got, want := holes(t, mustDrill(t, req).Output), [][2]float64{{-5, 0}, {10, 0}, {20, 1}, {30, 0}}; !slices.Equal(got, want) {
		t.Fatalf("drilled %v, want %v", got, want)
	}
}

func TestDrill_RejectsWhatCannotBeDrilled(t *testing.T) {
	valid := func() DrillRequest { return drillRequest(circleP(0, 0, 0.5), squareP(0, 0, 20, 20)) }
	tests := []struct {
		name   string
		change func(*DrillRequest)
	}{
		{"no circle in the range", func(r *DrillRequest) { r.MinHoleDiameter, r.MaxHoleDiameter = 2, 3 }},
		{"no primitives", func(r *DrillRequest) { r.Primitives = nil }},
		{"malformed circle", func(r *DrillRequest) { r.Primitives = []plc.Primitive{{Type: plc.PrimitiveCircle}} }},
		{"no drill diameter", func(r *DrillRequest) { r.DrillDiameter = 0 }},
		{"no smallest hole", func(r *DrillRequest) { r.MinHoleDiameter = 0 }},
		{"smallest hole above the largest", func(r *DrillRequest) { r.MinHoleDiameter, r.MaxHoleDiameter = 1.2, 0.4 }},
		{"no depth", func(r *DrillRequest) { r.Depth = 0 }},
		{"negative peck", func(r *DrillRequest) { r.PeckDepth = -1 }},
		{"peck below the PLC resolution", func(r *DrillRequest) { r.PeckDepth = 1e-9 }},
		{"more than 1000 pecks", func(r *DrillRequest) { r.Depth, r.PeckDepth = 1001, 1 }},
		{"more than 1000 pecks counting the point", func(r *DrillRequest) {
			r.Depth, r.PeckDepth, r.TipThrough, r.TipAngle = 1000, 1, true, 90 // the 90° point adds 0.5 mm
		}},
		{"negative tip angle", func(r *DrillRequest) { r.TipAngle = -118 }},
		{"tip angle past flat", func(r *DrillRequest) { r.TipAngle = 181 }},
		{"no plunge speed", func(r *DrillRequest) { r.PlungeSpeed = 0 }},
		{"no rapid speed", func(r *DrillRequest) { r.RapidSpeed = 0 }},
		{"retract plane on the stock", func(r *DrillRequest) { r.RetractClearance = 0 }},
		{"retract plane above safe Z", func(r *DrillRequest) { r.RetractClearance = 5.5 }},
		{"safe Z not above work Z", func(r *DrillRequest) { r.SafeZ, r.RetractClearance = r.WorkZ, 0 }},
		{"negative wait", func(r *DrillRequest) { r.WaitTime = -1 }},
	}
	if _, err := Drill(valid()); err != nil {
		t.Fatalf("valid request: %v", err)
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := valid()
			tt.change(&req)
			if res, err := Drill(req); err == nil {
				t.Fatalf("want an error, got %d commands", res.Count)
			}
		})
	}
}

// Pecks are counted from the stock surface; the last one stops at the bottom.
func TestDrill_LastPeckStopsAtTheBottom(t *testing.T) {
	tests := []struct {
		name       string
		workZ      float64
		depth      float64
		peck       float64
		wantPlunge []float64
	}{
		{"peck longer than the hole", 0, 1.6, 2, []float64{-1.6}},
		{"uneven pecks", 0, 1.6, 0.7, []float64{-0.7, -1.4, -1.6}},
		{"from a raised surface", 2, 1.2, 0.4, []float64{1.6, 1.2, 0.8}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := drillRequest(circleP(0, 0, 0.5))
			req.WorkZ, req.SafeZ, req.Depth, req.PeckDepth = tt.workZ, tt.workZ+5, tt.depth, tt.peck

			var plunges []float64
			for _, m := range parse(t, mustDrill(t, req).Output) {
				if m.op == "L" {
					plunges = append(plunges, m.z)
				}
			}
			if !slices.Equal(plunges, tt.wantPlunge) {
				t.Fatalf("pecks down to %v, want %v", plunges, tt.wantPlunge)
			}
		})
	}
}
