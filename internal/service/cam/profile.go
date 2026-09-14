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

// ProfileResponse is the program in the /api/plc/extract response shape, with a warning for each
// contour the tool cannot reach.
type ProfileResponse struct {
	plc.ExtractResponse
	Warnings []string `json:"warnings,omitempty"`
}

// Profile returns the PLC program that cuts around the closed contours of the drawing, one radius
// away on the chosen side, going down by the step-down from the work Z to work Z - depth.
//
// A ring is cut after the rings inside it, so every part stays attached to the stock until its
// own outline is cut, and the tool moves to the nearest ring it may cut next. Each ring is
// plunged at its start and cut at every level without leaving the slot, then the tool goes back
// to safe Z; the program starts and ends at safe Z, ending at X 0 Y 0 like the plotter programs.
// Contours the tool cannot reach are left uncut and listed as warnings.
func Profile(req ProfileRequest) (ProfileResponse, error) {
	if err := req.validate(); err != nil {
		return ProfileResponse{}, err
	}
	contours, err := Chain(req.Primitives)
	if err != nil {
		return ProfileResponse{}, err
	}
	if len(contours.Open) > 0 {
		p := contours.Open[0][0]
		return ProfileResponse{}, fmt.Errorf("%d open contours, the first starting at (%.3f, %.3f): a profile needs closed contours",
			len(contours.Open), p.X, p.Y)
	}
	if len(contours.Closed) == 0 {
		return ProfileResponse{}, errors.New("nothing to cut: the drawing has no closed contours")
	}

	delta := req.ToolDiameter / 2
	if req.Side == SideInside {
		delta = -delta
	}
	material := clipper.MergeContours(contours.Closed)
	offset := clipper.OffsetContours(material, delta)
	if len(offset) == 0 {
		return ProfileResponse{}, fmt.Errorf("a %.3f mm tool does not fit inside any contour", req.ToolDiameter)
	}
	rings := orderRings(offset, req.Side, req.Direction)

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

	return ProfileResponse{
		ExtractResponse: response(g.Lines()),
		Warnings:        unreachedContours(material, offset, req.Side, req.ToolDiameter),
	}, nil
}

// unreachedContours warns about the contours that no ring cuts. Only a contour around a region the
// offset shrinks can lose its ring: a hole when cutting outside, an outline when cutting inside.
// Such a contour is cut when some ring lies inside it but not inside another contour within it,
// since a ring inside an inner contour cuts that contour instead.
func unreachedContours(material, rings []geom.Path, side string, diameter float64) []string {
	nested := clipper.Inside(material, material)
	ringInside := clipper.Inside(rings, material)
	var warnings []string
	for c, contour := range material {
		depth := 0
		for _, in := range nested[c] {
			if in {
				depth++
			}
		}
		if (depth%2 == 1) != (side == SideOutside) {
			continue
		}
		reached := false
		for r := 0; r < len(rings) && !reached; r++ {
			reached = ringInside[r][c]
			for k := 0; k < len(material) && reached; k++ {
				reached = !ringInside[r][k] || !nested[k][c]
			}
		}
		if !reached {
			minX, minY, maxX, maxY := contour.Bounds()
			warnings = append(warnings, fmt.Sprintf("a %.3f mm tool cannot reach the contour from (%.3f, %.3f) to (%.3f, %.3f): it is not cut",
				diameter, minX, minY, maxX, maxY))
		}
	}
	return warnings
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

// orderRings returns the rings in cutting order, each turned the way the cut needs and starting
// at its vertex nearest to where the tool comes from.
//
// A ring is cut only after every ring inside it, so a part stays attached to the stock until its
// own outline is cut. Among the rings that may be cut, the tool goes to the nearest one, starting
// from X 0 Y 0.
//
// With the spindle turning clockwise seen from above, conventional cutting keeps the finished
// wall on the left of the tool. Outside a contour set that wall is the material the rings
// enclose: outer rings counterclockwise, holes clockwise. Inside it the wall is on the other
// side, and climb cutting reverses both.
func orderRings(rings []geom.Path, side, direction string) []geom.Path {
	inside := clipper.Inside(rings, rings)
	flip := (side == SideInside) != (direction == CuttingClimb)
	oriented := make([]geom.Path, len(rings))
	waiting := make([]int, len(rings)) // rings inside each ring that are not cut yet
	for i, around := range inside {
		depth := 0
		for j, in := range around {
			if in {
				depth++
				waiting[j]++
			}
		}
		oriented[i] = rings[i]
		if (signedArea(rings[i]) > 0) != ((depth%2 == 0) != flip) {
			oriented[i] = rings[i].Reverse()
		}
	}

	out := make([]geom.Path, 0, len(rings))
	done := make([]bool, len(rings))
	var pos geom.Point
	for range rings {
		next, entry, nearest := -1, 0, math.Inf(1)
		for i, ring := range oriented {
			if done[i] || waiting[i] > 0 {
				continue
			}
			for v, p := range ring {
				if d := pos.DistanceSq(p); d < nearest {
					next, entry, nearest = i, v, d
				}
			}
		}
		done[next] = true
		for j, in := range inside[next] {
			if in {
				waiting[j]--
			}
		}
		ring := append(slices.Clone(oriented[next][entry:]), oriented[next][:entry]...)
		out = append(out, ring)
		pos = ring[0]
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
