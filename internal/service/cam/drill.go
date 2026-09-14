package cam

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
	plcgen "plotter-pen/pkg/plc"
)

// DrillRequest is a drilling job: the drawing and the PLC settings as sent to /api/plc/extract,
// plus the drill and the diameters of the circles it drills.
type DrillRequest struct {
	plc.ExtractRequest
	Depth       float64 `json:"depth"`
	PlungeSpeed float64 `json:"plungeSpeed"`
	// RetractClearance is how far above work Z the retract plane (R) lies.
	RetractClearance float64 `json:"retractClearance"`
	DrillDiameter    float64 `json:"drillDiameter"`
	MinHoleDiameter  float64 `json:"minHoleDiameter"`
	MaxHoleDiameter  float64 `json:"maxHoleDiameter"`
	// PeckDepth is how deep each peck goes; 0 drills the hole in one go.
	PeckDepth float64 `json:"peckDepth,omitempty"`
	// TipAngle is the included angle of the drill point in degrees, 118 when zero.
	TipAngle float64 `json:"tipAngle,omitempty"`
	// TipThrough takes the full drill diameter, not just its tip, down to the depth.
	TipThrough bool `json:"tipThrough,omitempty"`
}

const (
	// peckClearance is how far above the bottom it reached the drill rapids back down after a
	// peck, the 0.010 in of LinuxCNC's G83.
	peckClearance = 0.254
	// defaultTipAngle is the point angle of general purpose twist drills, in degrees.
	defaultTipAngle = 118.0
	// sizeTolerance widens the diameter range by the PLC resolution, so a diameter converted from
	// inches still matches the value typed in mm.
	sizeTolerance = 0.001
	// sameCentre is the distance within which circles are one hole, such as a pad over its hole.
	sameCentre = 0.01
)

// Drill returns the PLC program that drills the circles of the drawing whose diameter is in the
// requested range, one hole after the other.
//
// Each hole follows G83 with G98: rapid over the hole at safe Z and down to the retract plane,
// then pecks fed at the plunge speed. Between pecks the drill rapids out to the retract plane and
// back down to just above the bottom it reached. After a dwell of the wait time at the bottom it
// rapids back to safe Z. The program ends at X 0 Y 0 at safe Z like the plotter programs.
func Drill(req DrillRequest) (plc.ExtractResponse, error) {
	if err := req.validate(); err != nil {
		return plc.ExtractResponse{}, err
	}
	holes := req.holes()
	if len(holes) == 0 {
		return plc.ExtractResponse{}, fmt.Errorf("nothing to drill: the drawing has no circle from %.3f to %.3f mm across",
			req.MinHoleDiameter, req.MaxHoleDiameter)
	}

	var lines, ids []string
	for _, h := range plc.OptimizeOrder(holes, geom.Point{}) {
		x, y, _ := h.GetCircleParams()
		hole := req.hole(x, y)
		lines = append(lines, hole...)
		for range hole {
			ids = append(ids, h.ID)
		}
	}
	end := plcgen.NewGenerator()
	end.Jump(0, 0, req.SafeZ, req.RapidSpeed)
	lines = append(lines, end.Lines()...)

	res := response(lines)
	for i, id := range ids {
		res.Commands[i].PrimitiveID = id
	}
	return res, nil
}

func (req DrillRequest) validate() error {
	var problems []string
	check := func(ok bool, problem string) {
		if !ok {
			problems = append(problems, problem)
		}
	}
	check(req.DrillDiameter > 0, "drill diameter must be positive")
	check(req.MinHoleDiameter > 0 && req.MinHoleDiameter <= req.MaxHoleDiameter,
		"the smallest hole diameter must be positive and not above the largest")
	check(req.Depth > 0, "depth must be positive")
	check(req.PeckDepth == 0 || req.PeckDepth >= plcResolution, "peck depth must be 0 or at least 0.001 mm")
	check(req.PeckDepth <= 0 || passCount(req.drilledLength(), req.PeckDepth) <= maxPasses,
		"depth and peck depth must make at most 1000 pecks")
	check(req.TipAngle >= 0 && req.TipAngle <= 180, "tip angle must be above 0° and at most 180°, or 0 for 118°")
	check(req.RapidSpeed > 0 && req.PlungeSpeed > 0, "rapid and plunge speeds must be positive")
	check(req.SafeZ > req.WorkZ, "safe Z must be above work Z")
	check(req.RetractClearance > 0 && req.WorkZ+req.RetractClearance <= req.SafeZ,
		"the retract plane must be above work Z and not above safe Z")
	check(req.WaitTime >= 0, "wait time must not be negative")
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

// holes returns the circles to drill: those with a diameter in the range, the first of the
// circles that share a centre. Each is shrunk to its centre, where a circle of radius 0 starts, so
// the nearest-neighbour order of plc.OptimizeOrder goes from centre to centre.
func (req DrillRequest) holes() []plc.Primitive {
	var holes []plc.Primitive
	for _, p := range req.Primitives {
		if p.Type != plc.PrimitiveCircle {
			continue
		}
		x, y, r := p.GetCircleParams()
		if 2*r < req.MinHoleDiameter-sizeTolerance || 2*r > req.MaxHoleDiameter+sizeTolerance {
			continue
		}
		centre := geom.Point{X: x, Y: y}
		if slices.ContainsFunc(holes, func(h plc.Primitive) bool { return h.GetStartPoint().Distance(centre) <= sameCentre }) {
			continue
		}
		holes = append(holes, plc.Primitive{Type: plc.PrimitiveCircle, ID: p.ID, Cx: new(x), Cy: new(y), Radius: new(0.0)})
	}
	return holes
}

// hole returns the commands that drill the hole centred at (x, y).
func (req DrillRequest) hole(x, y float64) []string {
	g := plcgen.NewGenerator()
	retract := req.WorkZ + req.RetractClearance
	g.Jump(x, y, req.SafeZ, req.RapidSpeed)
	g.Jump(x, y, retract, req.RapidSpeed)
	reached := retract
	for _, z := range req.pecks() {
		if reached < retract {
			g.Jump(x, y, retract, req.RapidSpeed)
			g.Jump(x, y, math.Min(reached+peckClearance, retract), req.RapidSpeed)
		}
		g.Line(x, y, z, req.PlungeSpeed)
		reached = z
	}
	g.Wait(req.WaitTime)
	g.Jump(x, y, req.SafeZ, req.RapidSpeed)
	return g.Lines()
}

// drilledLength is how far below work Z the drill goes: the depth, plus the drill point when the
// full diameter must reach the depth.
func (req DrillRequest) drilledLength() float64 {
	if !req.TipThrough {
		return req.Depth
	}
	angle := req.TipAngle
	if angle == 0 {
		angle = defaultTipAngle
	}
	return req.Depth + req.DrillDiameter/2/math.Tan(angle/2*math.Pi/180)
}

// pecks returns the Z every peck goes down to, counted from work Z, the last one at the bottom.
func (req DrillRequest) pecks() []float64 {
	length := req.drilledLength()
	bottom := req.WorkZ - length
	if req.PeckDepth <= 0 {
		return []float64{bottom}
	}
	pecks := make([]float64, int(passCount(length, req.PeckDepth)))
	for k := range pecks {
		pecks[k] = math.Max(req.WorkZ-float64(k+1)*req.PeckDepth, bottom)
	}
	return pecks
}
