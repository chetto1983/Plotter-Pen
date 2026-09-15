package cam

import (
	"fmt"
	"math"
	"slices"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
)

// roundTolerance is how far, in mm, the vertices of a closed contour and the middles of its sides may
// lie from the circle fitted to it for the contour to be drilled as a round hole. A polygon with its
// vertices on a circle of radius r sags r·(1 − cos(π/n)) between them: 24 sides pass for a 3 mm hole,
// a hexagon never does.
const roundTolerance = 0.02

// holes returns the round holes of the drawing with a diameter in the range, each shrunk to its
// centre, where a circle of radius 0 starts, so plc.OptimizeOrder and shortenRoute measure from centre
// to centre. Circles come first, then the closed contours that are round, named after their first
// primitive; of the holes that share a centre only the first is kept.
//
// A closed contour that is not round is not drilled. When the shorter side of its bounding box is in
// the range it looks like a hole, such as a slot, so a warning names it.
func (req DrillRequest) holes() (holes []plc.Primitive, warnings []string, err error) {
	add := func(id string, centre geom.Point, diameter float64) {
		if !req.inRange(diameter) || slices.ContainsFunc(holes, func(h plc.Primitive) bool { return h.GetStartPoint().Distance(centre) <= sameCentre }) {
			return
		}
		holes = append(holes, plc.Primitive{Type: plc.PrimitiveCircle, ID: id, Cx: new(centre.X), Cy: new(centre.Y), Radius: new(0.0)})
	}

	var others []plc.Primitive
	for _, p := range req.Primitives {
		if p.Type != plc.PrimitiveCircle {
			others = append(others, p)
			continue
		}
		x, y, r := p.GetCircleParams()
		add(p.ID, geom.Point{X: x, Y: y}, 2*r)
	}

	contours, err := Chain(others)
	if err != nil {
		return nil, nil, err
	}
	for i, loop := range contours.Closed {
		if centre, r, ok := roundContour(loop); ok {
			add(contours.ClosedIDs[i][0], centre, 2*r)
			continue
		}
		minX, minY, maxX, maxY := loop.Bounds()
		if req.inRange(math.Min(maxX-minX, maxY-minY)) {
			warnings = append(warnings, fmt.Sprintf("the closed contour from (%.3f, %.3f) to (%.3f, %.3f) is not round: it is not drilled, cut it with a profile",
				minX, minY, maxX, maxY))
		}
	}
	return holes, warnings, nil
}

// inRange tells whether a diameter is in the requested range, widened by sizeTolerance.
func (req DrillRequest) inRange(diameter float64) bool {
	return diameter >= req.MinHoleDiameter-sizeTolerance && diameter <= req.MaxHoleDiameter+sizeTolerance
}

// roundContour fits a circle to the vertices of a closed contour and tells whether every vertex and
// the middle of every side lie within roundTolerance of it. Checking the vertices alone would take
// any regular polygon for a circle.
func roundContour(loop geom.Path) (centre geom.Point, radius float64, ok bool) {
	if len(loop) < 3 {
		return geom.Point{}, 0, false
	}
	centre, radius, ok = fitCircle(loop)
	if !ok {
		return geom.Point{}, 0, false
	}
	for i, p := range loop {
		q := loop[(i+1)%len(loop)]
		middle := geom.Point{X: (p.X + q.X) / 2, Y: (p.Y + q.Y) / 2}
		if math.Abs(p.Distance(centre)-radius) > roundTolerance || math.Abs(middle.Distance(centre)-radius) > roundTolerance {
			return geom.Point{}, 0, false
		}
	}
	return centre, radius, true
}

// fitCircle is the algebraic least-squares circle through the points (Kåsa), solved about their mean
// so that coordinates far from the origin keep their precision. Collinear points have no circle.
func fitCircle(points geom.Path) (geom.Point, float64, bool) {
	var mx, my float64
	for _, p := range points {
		mx += p.X
		my += p.Y
	}
	n := float64(len(points))
	mx, my = mx/n, my/n

	var suu, suv, svv, suuu, svvv, suvv, svuu float64
	for _, p := range points {
		u, v := p.X-mx, p.Y-my
		suu += u * u
		suv += u * v
		svv += v * v
		suuu += u * u * u
		svvv += v * v * v
		suvv += u * v * v
		svuu += v * u * u
	}
	det := suu*svv - suv*suv
	if det <= 1e-12*(suu+svv)*(suu+svv) {
		return geom.Point{}, 0, false
	}
	bu, bv := (suuu+suvv)/2, (svvv+svuu)/2
	uc := (bu*svv - bv*suv) / det
	vc := (suu*bv - suv*bu) / det
	return geom.Point{X: uc + mx, Y: vc + my}, math.Sqrt(uc*uc + vc*vc + (suu+svv)/n), true
}
