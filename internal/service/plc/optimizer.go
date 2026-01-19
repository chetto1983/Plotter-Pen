package plc

import (
    "math"
    "plotter-pen/pkg/geom"
)

// OptimizeOrder reorders primitives using nearest-neighbor heuristic
// (JS PathOptimizer parity).
func OptimizeOrder(primitives []Primitive, startPoint geom.Point) []Primitive {
    if len(primitives) <= 1 {
        return primitives
    }

    remaining := make([]Primitive, len(primitives))
    copy(remaining, primitives)

    optimized := make([]Primitive, 0, len(primitives))
    current := startPoint

    for len(remaining) > 0 {
        nearestIdx := 0
        nearestDist := math.MaxFloat64
        reverseNearest := false

        for i, prim := range remaining {
            start := prim.GetStartPoint()
            end := prim.GetEndPoint()

            distToStart := current.Distance(start)
            distToEnd := current.Distance(end)

            if distToStart < nearestDist {
                nearestDist = distToStart
                nearestIdx = i
                reverseNearest = false
            }

            if !prim.IsClosed() && distToEnd < nearestDist {
                nearestDist = distToEnd
                nearestIdx = i
                reverseNearest = true
            }
        }

        selected := remaining[nearestIdx]
        remaining = append(remaining[:nearestIdx], remaining[nearestIdx+1:]...)

        if reverseNearest {
            selected = reversePrimitive(selected)
        }

        optimized = append(optimized, selected)
        current = selected.GetEndPoint()
    }

    return optimized
}

// reversePrimitive reverses a primitive's direction (JS PathOptimizer parity).
func reversePrimitive(p Primitive) Primitive {
    switch p.Type {
    case PrimitiveLine:
        if p.X1 != nil && p.X2 != nil {
            x1 := *p.X1
            *p.X1 = *p.X2
            *p.X2 = x1
        }
        if p.Y1 != nil && p.Y2 != nil {
            y1 := *p.Y1
            *p.Y1 = *p.Y2
            *p.Y2 = y1
        }
    case PrimitiveArc:
        if p.X1 != nil && p.X2 != nil {
            x1 := *p.X1
            *p.X1 = *p.X2
            *p.X2 = x1
        }
        if p.Y1 != nil && p.Y2 != nil {
            y1 := *p.Y1
            *p.Y1 = *p.Y2
            *p.Y2 = y1
        }
        p.IsClockwise = !p.IsClockwise
        if p.Sweep != nil {
            sweep := -*p.Sweep
            p.Sweep = &sweep
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
