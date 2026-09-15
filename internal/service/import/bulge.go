package importservice

import "math"

const (
	// minBulgeSagitta is how far, in mm, an arc must rise off its chord to be imported as an arc and
	// not as a line.
	minBulgeSagitta = 1e-6
	// polylineCircleTolerance is how close, in mm, the centres and radii of the arcs of a closed
	// polyline must be for the polyline to be imported as one circle.
	polylineCircleTolerance = 0.001
)

// polylineVertex is a vertex of an LWPOLYLINE or POLYLINE with the bulge of the segment that starts
// there: tan(included angle / 4), positive counterclockwise.
type polylineVertex struct {
	Point
	bulge float64
}

// polylinePrimitives imports a polyline. Without bulges it stays one polyline, or polygon when closed.
// With bulges every segment becomes a line or an arc of its own, a closed polyline also ends with the
// segment from its last vertex back to the first, and a closed polyline whose segments go once round
// one circle becomes that circle.
func polylinePrimitives(vertices []polylineVertex, closed bool, layer string, idx *int) []Primitive {
	if len(vertices) < 2 {
		return nil
	}
	if !hasBulge(vertices) {
		points := make([]Point, len(vertices))
		for k, v := range vertices {
			points[k] = v.Point
		}
		primType := "polyline"
		if closed {
			primType = "polygon"
		}
		return []Primitive{{Type: primType, ID: nextID(idx), Layer: layer, Points: points, Closed: closed}}
	}

	segments := len(vertices) - 1
	if closed {
		segments = len(vertices)
	}
	prims := make([]Primitive, 0, segments)
	for k := 0; k < segments; k++ {
		if prim, ok := bulgeSegment(vertices[k], vertices[(k+1)%len(vertices)].Point); ok {
			prims = append(prims, prim)
		}
	}
	if closed {
		if circle, ok := oneCircle(prims); ok {
			prims = []Primitive{circle}
		}
	}
	for k := range prims {
		prims[k].ID = nextID(idx)
		prims[k].Layer = layer
	}
	return prims
}

func hasBulge(vertices []polylineVertex) bool {
	for _, v := range vertices {
		if v.bulge != 0 {
			return true
		}
	}
	return false
}

// bulgeSegment turns the segment from a to end into a line or an arc through the middle the bulge of
// a gives, the chord midpoint moved bulge·chord/2 to the right of the chord. It gives nothing for
// coincident vertices.
func bulgeSegment(a polylineVertex, end Point) (Primitive, bool) {
	chord := distance(a.Point, end)
	if chord < minBulgeSagitta {
		return Primitive{}, false
	}
	rise := a.bulge * chord / 2
	if math.Abs(rise) >= minBulgeSagitta {
		dx, dy := end.X-a.X, end.Y-a.Y
		through := Point{X: (a.X+end.X)/2 + rise*dy/chord, Y: (a.Y+end.Y)/2 - rise*dx/chord}
		if arc := arcFromThreePoints(a.Point, through, end); arc != nil {
			return *arc, true
		}
	}
	return newLinePrimitive(a.Point, end, "", ""), true
}

// oneCircle tells whether the segments are all arcs of one circle, turning the same way and once round
// it, and gives that circle.
func oneCircle(prims []Primitive) (Primitive, bool) {
	if len(prims) == 0 {
		return Primitive{}, false
	}
	first := prims[0]
	var turn float64
	for _, p := range prims {
		if p.Type != "arc" || math.Signbit(p.Sweep) != math.Signbit(first.Sweep) ||
			distance(Point{X: p.CenterX, Y: p.CenterY}, Point{X: first.CenterX, Y: first.CenterY}) > polylineCircleTolerance ||
			math.Abs(p.Radius-first.Radius) > polylineCircleTolerance {
			return Primitive{}, false
		}
		turn += p.Sweep
	}
	// contiguous arcs round one centre turn by a whole number of turns, so this only has to tell one from zero or two
	if math.Abs(math.Abs(turn)-2*math.Pi) > 0.01 {
		return Primitive{}, false
	}
	return Primitive{Type: "circle", CenterX: first.CenterX, CenterY: first.CenterY, Radius: first.Radius}, true
}
