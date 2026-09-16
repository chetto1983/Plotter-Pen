package cam

import (
	"math"
	"slices"
	"strings"

	"plotter-pen/internal/i18n"
	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/clipper"
	"plotter-pen/pkg/geom"
	plcgen "plotter-pen/pkg/plc"
)

const (
	// fitTolerance is the largest distance between an offset ring and the lines and arcs sent to
	// the PLC in its place.
	fitTolerance = 0.01
	// plcResolution is the step of the PLC coordinates, in mm: no shorter ramp, step-down or peck
	// is worth sending.
	plcResolution = 0.001
	// maxPasses bounds the passes of a profile and the pecks of a hole, and with them the program
	// a request can ask for: 1000 passes of 0.1 mm are 100 mm, beyond any job of a small router.
	maxPasses = 1000
	// maxRampLaps bounds how many times a ramp, out and back, may go round its ring. A ramp down a
	// small hole takes tens of laps, like a helix; without a bound a shallow angle or a deep
	// step-down fills the memory with ramp moves.
	maxRampLaps = 1000
)

// Cut sides and directions of a profile.
const (
	SideOutside         = "outside"
	SideInside          = "inside"
	SideOn              = "on"
	CuttingConventional = "conventional"
	CuttingClimb        = "climb"
)

// ProfileRequest is a profile job: the drawing and the PLC settings as sent to /api/plc/extract,
// plus the piece, the tool and the cut. The tool diameter only sets the offset; the PLC never
// receives it.
type ProfileRequest struct {
	plc.ExtractRequest
	Stock
	ToolDiameter float64 `json:"toolDiameter"`
	// Side is SideOutside to keep what the contours enclose, SideInside to cut it away, SideOn to
	// run the centre of the tool along the contours themselves.
	Side string `json:"side"`
	// Direction is CuttingConventional (the default when empty) or CuttingClimb.
	Direction   string  `json:"direction,omitempty"`
	StepDown    float64 `json:"stepDown"`
	PlungeSpeed float64 `json:"plungeSpeed"`
	RampAngle   float64 `json:"rampAngle"`
	// CloseGap is the widest gap between two ends that closes a contour, 0 to MaxCloseGap mm;
	// 0 joins only the ends that meet.
	CloseGap float64 `json:"closeGap,omitempty"`
}

// ProfileResponse is the program in the /api/plc/extract response shape, with a warning for each
// contour the tool cannot reach and for each open contour, and the same contours as details the
// drawing can mark.
type ProfileResponse struct {
	plc.ExtractResponse
	Warnings  []i18n.Note       `json:"warnings,omitempty"`
	Unreached []UnreachedDetail `json:"unreached,omitempty"`
	Open      []OpenContour     `json:"open,omitempty"`
}

// UnreachedDetail is a detail of the drawing the tool cannot cut: where it is, the primitives it
// is drawn with, so the drawing can mark it, and the widest tool that would fit it — 0 when none
// does.
type UnreachedDetail struct {
	PrimitiveIDs []string `json:"primitiveIds,omitempty"`
	Width        float64  `json:"width"`
	MinX         float64  `json:"minX"`
	MinY         float64  `json:"minY"`
	MaxX         float64  `json:"maxX"`
	MaxY         float64  `json:"maxY"`
}

// Profile returns the PLC program that cuts around the closed contours of the drawing, one radius
// away on the chosen side or along the contours themselves, going down by the step-down from the
// top of the piece to the bottom of the cut.
//
// A ring is cut after the rings inside it, so every part stays attached to the stock until its
// own outline is cut, and the tool moves to the nearest ring it may cut next. The tool enters
// every level at the ring start along a ramp and cuts all the levels without leaving the slot,
// then goes back to safe Z; the program starts and ends at safe Z, ending at X 0 Y 0 like the
// plotter programs.
// Contours the tool cannot reach are left uncut and listed as warnings. Open contours, the gaps
// within CloseGap bridged, are not cut either: they are listed with the closing gap that would
// close them, and a drawing that has only open contours is an *OpenContoursError.
func Profile(req ProfileRequest) (ProfileResponse, error) {
	if err := req.validate(); err != nil {
		return ProfileResponse{}, err
	}
	contours, err := Chain(req.Primitives, req.CloseGap)
	if err != nil {
		return ProfileResponse{}, err
	}
	open, openWarnings := openContours(contours)
	if len(contours.Closed) == 0 {
		if len(open) > 0 {
			return ProfileResponse{}, &OpenContoursError{Open: open}
		}
		return ProfileResponse{}, i18n.Errorf("nothing to cut: the drawing has no closed contours")
	}

	var rings []geom.Path
	var warnings []i18n.Note
	var unreached []UnreachedDetail
	if req.Side == SideOn {
		// The centre of the tool follows the drawing: there is no offset to take, so no contour
		// can be lost in one and none has to fit the tool. The contours are cut as drawn, each
		// one whole even where another crosses it, which is what a line to follow means.
		rings = orderRings(contours.Closed, req.Side, req.Direction)
	} else {
		delta := req.ToolDiameter / 2
		if req.Side == SideInside {
			delta = -delta
		}
		material := clipper.MergeContours(contours.Closed)
		offset := clipper.OffsetContours(material, delta)
		if len(offset) == 0 {
			return ProfileResponse{}, i18n.Errorf("a %.3f mm tool does not fit inside any contour", req.ToolDiameter)
		}
		rings = orderRings(offset, req.Side, req.Direction)
		warnings, unreached = unreachedDetails(contours, material, offset, req.Side, req.ToolDiameter)
	}

	g := plcgen.NewGenerator()
	levels := req.levels()
	for _, ring := range rings {
		start := ring[0]
		closed := append(slices.Clone(ring), start)
		segments := plc.FitArcsAndLines(closed, fitTolerance)
		// ramps may leave the ring by the fit tolerance too, so they skip the vertices they do not need
		rampRing := clipper.SimplifyPath(closed, fitTolerance)
		g.Jump(start.X, start.Y, req.SafeZ, req.RapidSpeed)
		above := req.SafeZ
		for _, z := range levels {
			if err := req.enter(g, rampRing, above, z); err != nil {
				return ProfileResponse{}, err
			}
			above = z
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
		Warnings:        append(warnings, openWarnings...),
		Unreached:       unreached,
		Open:            open,
	}, nil
}

// enter takes the tool at the start of the closed ring (its last point repeats the first) from
// zFrom down to zTo. Down to the top of the piece it goes straight at the plunge speed. In the
// material it ramps along the ring at the ramp angle, out for half the drop and back to the start,
// so the lap at zTo still starts at the ring start. The ramp runs at the cutting speed, slowed down
// so that the tool never sinks faster than the plunge speed.
//
// The tool plunges straight to zTo instead at 90°, where the ramp has no length, and in a ring
// shorter than the tool diameter, where the ramp would go round it many times. A ramp that would
// go round the ring more than maxRampLaps times is an error naming the ring.
func (req ProfileRequest) enter(g *plcgen.Generator, closed geom.Path, zFrom, zTo float64) error {
	start := closed[0]
	surface := math.Min(zFrom, req.top(req.WorkZ))
	angle := req.RampAngle * math.Pi / 180
	leg := (surface - zTo) / math.Tan(angle) / 2
	length := pathLength(closed)
	if leg < plcResolution || length < req.ToolDiameter {
		g.Line(start.X, start.Y, zTo, req.PlungeSpeed)
		return nil
	}
	if laps := 2 * leg / length; laps > maxRampLaps {
		minX, minY, maxX, maxY := closed.Bounds()
		return i18n.Errorf("a %g° ramp would go round the ring from (%.3f, %.3f) to (%.3f, %.3f) %.0f times to go down %.3f mm, at most %d: use a steeper ramp angle or a smaller step-down",
			req.RampAngle, minX, minY, maxX, maxY, laps, surface-zTo, maxRampLaps)
	}
	ring := closed[:len(closed)-1]
	if zFrom > surface {
		g.Line(start.X, start.Y, surface, req.PlungeSpeed)
	}

	out := alongRing(ring, leg)
	path := append(slices.Clone(out), out[:len(out)-1]...)
	slices.Reverse(path[len(out):])
	path = append(path, start)

	speed := math.Min(req.DefaultSpeed, req.PlungeSpeed/math.Sin(angle))
	walked, pos := 0.0, start
	for i, p := range path {
		walked += pos.Distance(p)
		z := surface - (surface-zTo)*walked/(2*leg)
		if i == len(path)-1 {
			z = zTo
		}
		g.Line(p.X, p.Y, z, speed)
		pos = p
	}
	return nil
}

// alongRing walks the closed ring from its start for the given length, going round it as many
// times as needed, and returns the vertices it passes and the point where it stops.
func alongRing(ring geom.Path, length float64) geom.Path {
	var out geom.Path
	walked := 0.0
	for i := 0; ; i++ {
		a, b := ring[i%len(ring)], ring[(i+1)%len(ring)]
		step := a.Distance(b)
		if walked+step >= length {
			t := (length - walked) / step
			return append(out, geom.Point{X: a.X + (b.X-a.X)*t, Y: a.Y + (b.Y-a.Y)*t})
		}
		walked += step
		out = append(out, b)
	}
}

// widestTool is the widest tool that fits inside a contour: the largest circle it holds, found by
// shrinking the contour until nothing is left of it. It is what the detail measures across, and so
// the tool that would cut it. Zero when the detail is thinner than the resolution of the search.
func widestTool(contour geom.Path, limit float64) float64 {
	fits := func(diameter float64) bool {
		return len(clipper.OffsetContours([]geom.Path{contour}, -diameter/2)) > 0
	}
	if fits(limit) {
		return limit
	}
	low, high := 0.0, limit
	// 0.01 mm is ten times the resolution of the PLC coordinates: finer would say nothing
	for high-low > 0.01 {
		mid := (low + high) / 2
		if fits(mid) {
			low = mid
		} else {
			high = mid
		}
	}
	return math.Floor(low*100) / 100
}

// unreachedDetails warns about the contours that no ring cuts, and measures them. Only a contour
// around a region the offset shrinks can lose its ring: a hole when cutting outside, an outline
// when cutting inside. Such a contour is cut when some ring lies inside it but not inside another
// contour within it, since a ring inside an inner contour cuts that contour instead.
//
// The contours here are the merged material, so the primitives of a detail are those of every
// drawn contour that lies within it: where two drawn contours overlap into one, both are named.
func unreachedDetails(contours Contours, material, rings []geom.Path, side string, diameter float64) ([]i18n.Note, []UnreachedDetail) {
	nested := clipper.Inside(material, material)
	ringInside := clipper.Inside(rings, material)
	drawnWithin := clipper.Within(contours.Closed, material)
	var warnings []i18n.Note
	var details []UnreachedDetail
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
			detail := UnreachedDetail{Width: widestTool(contour, diameter), MinX: minX, MinY: minY, MaxX: maxX, MaxY: maxY}
			for d, within := range drawnWithin {
				if within[c] && d < len(contours.ClosedIDs) {
					detail.PrimitiveIDs = append(detail.PrimitiveIDs, contours.ClosedIDs[d]...)
				}
			}
			fits := i18n.Errorf("the widest tool that fits it is %.3f mm", detail.Width)
			if detail.Width == 0 {
				fits = i18n.Errorf("no tool fits it")
			}
			warnings = append(warnings, i18n.Notef("a %.3f mm tool cannot reach the contour from (%.3f, %.3f) to (%.3f, %.3f): it is not cut, %v",
				diameter, minX, minY, maxX, maxY, fits))
			details = append(details, detail)
		}
	}
	return warnings, details
}

func (req ProfileRequest) validate() error {
	var problems []error
	check := func(ok bool, problem error) {
		if !ok {
			problems = append(problems, problem)
		}
	}
	check(req.ToolDiameter > 0, i18n.Errorf("tool diameter must be positive"))
	check(req.Side == SideOutside || req.Side == SideInside || req.Side == SideOn,
		i18n.Errorf("side must be %q, %q or %q", SideOutside, SideInside, SideOn))
	check(req.Direction == "" || req.Direction == CuttingConventional || req.Direction == CuttingClimb,
		i18n.Errorf("direction must be %q or %q", CuttingConventional, CuttingClimb))
	req.Stock.validate(check, req.WorkZ, req.SafeZ)
	check(req.StepDown >= plcResolution, i18n.Errorf("step-down must be at least 0.001 mm"))
	check(req.StepDown <= 0 || passCount(req.cutDepth(), req.StepDown) <= maxPasses, i18n.Errorf("depth and step-down must make at most 1000 passes"))
	check(req.DefaultSpeed > 0 && req.RapidSpeed > 0 && req.PlungeSpeed > 0, i18n.Errorf("cutting, rapid and plunge speeds must be positive"))
	check(req.RampAngle > 0 && req.RampAngle <= 90, i18n.Errorf("ramp angle must be above 0° and at most 90°"))
	check(req.WaitTime >= 0, i18n.Errorf("wait time must not be negative"))
	check(req.CloseGap >= 0 && req.CloseGap <= MaxCloseGap, i18n.Errorf("closing gap must be between 0 and %g mm", float64(MaxCloseGap)))
	return i18n.Join(problems)
}

// levels returns the Z of every pass down from the top of the piece, the last one exactly at the
// bottom of the cut.
func (req ProfileRequest) levels() []float64 {
	top, depth := req.top(req.WorkZ), req.cutDepth()
	levels := make([]float64, int(passCount(depth, req.StepDown)))
	for k := range levels {
		levels[k] = top - math.Min(float64(k+1)*req.StepDown, depth)
	}
	return levels
}

// passCount is how many passes of at most step it takes to go length deep. It stays a float64 so
// that an absurd request is compared with maxPasses instead of overflowing an int.
func passCount(length, step float64) float64 {
	// the epsilon keeps 1.2 / 0.4 = 3.0000000000000004 from adding a fourth, empty pass
	return math.Ceil(length/step - 1e-9)
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
