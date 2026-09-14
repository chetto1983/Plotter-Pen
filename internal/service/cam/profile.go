package cam

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/clipper"
	"plotter-pen/pkg/geom"
	plcgen "plotter-pen/pkg/plc"
)

// fitTolerance is the largest distance between an offset ring and the lines and arcs sent to the
// PLC in its place.
const fitTolerance = 0.01

// Cut sides and directions of a profile.
const (
	SideOutside         = "outside"
	SideInside          = "inside"
	CuttingConventional = "conventional"
	CuttingClimb        = "climb"
)

// ProfileRequest is a profile job: the drawing and the PLC settings as sent to /api/plc/extract,
// plus the tool and the cut. The tool diameter only sets the offset; the PLC never receives it.
type ProfileRequest struct {
	plc.ExtractRequest
	ToolDiameter float64 `json:"toolDiameter"`
	// Side is SideOutside to keep what the contours enclose, SideInside to cut it away.
	Side string `json:"side"`
	// Direction is CuttingConventional (the default when empty) or CuttingClimb.
	Direction   string  `json:"direction,omitempty"`
	Depth       float64 `json:"depth"`
	StepDown    float64 `json:"stepDown"`
	PlungeSpeed float64 `json:"plungeSpeed"`
}

// Profile returns the PLC program that cuts around the closed contours of the drawing, one radius
// away on the chosen side, going down by the step-down from the work Z to work Z - depth.
//
// Innermost contours are cut first, so every part stays attached to the stock until its own
// outline is cut. Each ring is plunged at its start and cut at every level without leaving the
// slot, then the tool goes back to safe Z; the program starts and ends at safe Z, ending at X 0
// Y 0 like the plotter programs.
func Profile(req ProfileRequest) (plc.ExtractResponse, error) {
	if err := req.validate(); err != nil {
		return plc.ExtractResponse{}, err
	}
	contours, err := Chain(req.Primitives)
	if err != nil {
		return plc.ExtractResponse{}, err
	}
	if len(contours.Open) > 0 {
		p := contours.Open[0][0]
		return plc.ExtractResponse{}, fmt.Errorf("%d open contours, the first starting at (%.3f, %.3f): a profile needs closed contours",
			len(contours.Open), p.X, p.Y)
	}
	if len(contours.Closed) == 0 {
		return plc.ExtractResponse{}, errors.New("nothing to cut: the drawing has no closed contours")
	}

	delta := req.ToolDiameter / 2
	if req.Side == SideInside {
		delta = -delta
	}
	rings := orderRings(clipper.OffsetContours(contours.Closed, delta), req.Side, req.Direction)
	if len(rings) == 0 {
		return plc.ExtractResponse{}, fmt.Errorf("a %.3f mm tool does not fit inside any contour", req.ToolDiameter)
	}

	g := plcgen.NewGenerator()
	levels := req.levels()
	for _, ring := range rings {
		start := ring[0]
		segments := plc.FitArcsAndLines(append(ring, start), fitTolerance)
		g.Jump(start.X, start.Y, req.SafeZ, req.RapidSpeed)
		for _, z := range levels {
			g.Line(start.X, start.Y, z, req.PlungeSpeed)
			g.Wait(req.WaitTime)
			for _, s := range segments {
				if s.Type == "arc" {
					g.ArcThrough(geom.Point{X: s.X2, Y: s.Y2}, geom.Point{X: s.MidX, Y: s.MidY}, z, req.DefaultSpeed)
				} else {
					g.Line(s.X2, s.Y2, z, req.DefaultSpeed)
				}
			}
		}
		g.Jump(start.X, start.Y, req.SafeZ, req.RapidSpeed)
	}
	g.Jump(0, 0, req.SafeZ, req.RapidSpeed)

	return response(g.Lines()), nil
}

func (req ProfileRequest) validate() error {
	var problems []string
	check := func(ok bool, problem string) {
		if !ok {
			problems = append(problems, problem)
		}
	}
	check(req.ToolDiameter > 0, "tool diameter must be positive")
	check(req.Side == SideOutside || req.Side == SideInside, fmt.Sprintf("side must be %q or %q", SideOutside, SideInside))
	check(req.Direction == "" || req.Direction == CuttingConventional || req.Direction == CuttingClimb,
		fmt.Sprintf("direction must be %q or %q", CuttingConventional, CuttingClimb))
	check(req.Depth > 0, "depth must be positive")
	check(req.StepDown > 0, "step-down must be positive")
	check(req.DefaultSpeed > 0 && req.RapidSpeed > 0 && req.PlungeSpeed > 0, "cutting, rapid and plunge speeds must be positive")
	check(req.SafeZ > req.WorkZ, "safe Z must be above work Z")
	check(req.WaitTime >= 0, "wait time must not be negative")
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

// levels returns the Z of every pass, the last one exactly at work Z - depth.
func (req ProfileRequest) levels() []float64 {
	// the epsilon keeps 1.2 / 0.4 = 3.0000000000000004 from adding a fourth, empty pass
	n := int(math.Ceil(req.Depth/req.StepDown - 1e-9))
	levels := make([]float64, n)
	for k := range levels {
		levels[k] = req.WorkZ - math.Min(float64(k+1)*req.StepDown, req.Depth)
	}
	return levels
}

// orderRings puts the deepest rings first and turns each one the way the cut needs. With the
// spindle turning clockwise seen from above, conventional cutting keeps the finished wall on the
// left of the tool. Outside a contour set that wall is the material the rings enclose: outer
// rings counterclockwise, holes clockwise. Inside it the wall is on the other side, and climb
// cutting reverses both.
func orderRings(rings []geom.Path, side, direction string) []geom.Path {
	depths := clipper.NestingDepths(rings)
	order := make([]int, len(rings))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int { return depths[b] - depths[a] })

	flip := (side == SideInside) != (direction == CuttingClimb)
	out := make([]geom.Path, 0, len(rings))
	for _, i := range order {
		counterclockwise := (depths[i]%2 == 0) != flip
		ring := rings[i]
		if (signedArea(ring) > 0) != counterclockwise {
			ring = ring.Reverse()
		}
		out = append(out, ring)
	}
	return out
}

// signedArea is the shoelace area of a closed path: positive when counterclockwise.
func signedArea(p geom.Path) float64 {
	a := 0.0
	for i := range p {
		q := p[(i+1)%len(p)]
		a += p[i].X*q.Y - q.X*p[i].Y
	}
	return a / 2
}

// response lists the program in the shape returned by /api/plc/extract.
func response(lines []string) plc.ExtractResponse {
	commands := make([]plc.Command, len(lines))
	for i, s := range lines {
		op, _, _ := strings.Cut(s, " ")
		commands[i] = plc.Command{Index: i, Type: op, CommandStr: s}
	}
	return plc.ExtractResponse{Commands: commands, Output: lines, Count: len(lines)}
}
