package plc

import (
	"math"
	"plotter-pen/pkg/geom"
)

// OptimizeOrder reorders primitives using nearest-neighbor heuristic
// to minimize total travel distance (pen-up movements)
func OptimizeOrder(primitives []Primitive, start geom.Point) []Primitive {
	if len(primitives) <= 1 {
		return primitives
	}

	remaining := make([]Primitive, len(primitives))
	copy(remaining, primitives)

	optimized := make([]Primitive, 0, len(primitives))
	current := start

	for len(remaining) > 0 {
		nearestIdx := 0
		nearestDist := math.MaxFloat64
		shouldReverse := false

		for i, prim := range remaining {
			startPt := prim.GetStartPoint()
			endPt := prim.GetEndPoint()

			distToStart := current.Distance(startPt)
			distToEnd := current.Distance(endPt)

			if distToStart < nearestDist {
				nearestDist = distToStart
				nearestIdx = i
				shouldReverse = false
			}

			// For open paths, check if starting from end is closer
			if !prim.IsClosed() && distToEnd < nearestDist {
				nearestDist = distToEnd
				nearestIdx = i
				shouldReverse = true
			}
		}

		selected := remaining[nearestIdx]
		remaining = append(remaining[:nearestIdx], remaining[nearestIdx+1:]...)

		// Reverse the primitive if needed
		if shouldReverse {
			selected = reversePrimitive(selected)
		}

		optimized = append(optimized, selected)
		current = selected.GetEndPoint()
	}

	return optimized
}

// reversePrimitive reverses a primitive's direction
func reversePrimitive(p Primitive) Primitive {
	switch p.Type {
	case PrimitiveLine:
		if p.X1 != nil && p.Y1 != nil && p.X2 != nil && p.Y2 != nil {
			p.X1, p.X2 = p.X2, p.X1
			p.Y1, p.Y2 = p.Y2, p.Y1
		}
	case PrimitiveArc:
		if p.X1 != nil && p.Y1 != nil && p.X2 != nil && p.Y2 != nil {
			p.X1, p.X2 = p.X2, p.X1
			p.Y1, p.Y2 = p.Y2, p.Y1
			p.IsClockwise = !p.IsClockwise
			if p.Sweep != nil {
				negSweep := -*p.Sweep
				p.Sweep = &negSweep
			}
		}
	case PrimitivePolyline:
		if len(p.Points) > 0 && !p.Closed {
			reversed := make([]geom.Point, len(p.Points))
			for i, pt := range p.Points {
				reversed[len(p.Points)-1-i] = pt
			}
			p.Points = reversed
		}
	}
	return p
}
