package importservice

import "math"

// centerPrimitives moves primitives so bounds center is at origin
func centerPrimitives(prims []Primitive, b *Bounds) {
	cx := (b.MinX + b.MaxX) / 2
	cy := (b.MinY + b.MaxY) / 2
	for i := range prims {
		translatePrimitive(&prims[i], -cx, -cy)
	}
}

// translatePrimitive moves a primitive by offset
func translatePrimitive(p *Primitive, dx, dy float64) {
	switch p.Type {
	case "line":
		p.StartX += dx
		p.StartY += dy
		p.EndX += dx
		p.EndY += dy
	case "circle", "arc":
		p.CenterX += dx
		p.CenterY += dy
		p.StartX += dx
		p.StartY += dy
		p.EndX += dx
		p.EndY += dy
		if p.ThroughPoint != nil {
			p.ThroughPoint.X += dx
			p.ThroughPoint.Y += dy
		}
	case "polyline", "polygon":
		for i := range p.Points {
			p.Points[i].X += dx
			p.Points[i].Y += dy
		}
	case "rectangle":
		p.X += dx
		p.Y += dy
	}
}

// scalePrimitives scales primitives by factor
func scalePrimitives(prims []Primitive, factor float64) {
	for i := range prims {
		scalePrimitive(&prims[i], factor)
	}
}

// scalePrimitive scales a single primitive
func scalePrimitive(p *Primitive, factor float64) {
	switch p.Type {
	case "line":
		p.StartX *= factor
		p.StartY *= factor
		p.EndX *= factor
		p.EndY *= factor
	case "circle", "arc":
		p.CenterX *= factor
		p.CenterY *= factor
		p.Radius *= factor
		p.StartX *= factor
		p.StartY *= factor
		p.EndX *= factor
		p.EndY *= factor
		if p.ThroughPoint != nil {
			p.ThroughPoint.X *= factor
			p.ThroughPoint.Y *= factor
		}
	case "polyline", "polygon":
		for i := range p.Points {
			p.Points[i].X *= factor
			p.Points[i].Y *= factor
		}
	case "rectangle":
		p.X *= factor
		p.Y *= factor
		p.Width *= factor
		p.Height *= factor
	}
}

// normalizePrimitives scales to fit 0-100 range
func normalizePrimitives(prims []Primitive, b *Bounds) {
	w := b.MaxX - b.MinX
	h := b.MaxY - b.MinY
	maxDim := max(w, h)
	if maxDim == 0 {
		return
	}
	scalePrimitives(prims, 100.0/maxDim)
}

// recalculateBounds recalculates bounds after transformation
func recalculateBounds(prims []Primitive) *Bounds {
	if len(prims) == 0 {
		return nil
	}
	b := &Bounds{
		MinX: math.MaxFloat64, MinY: math.MaxFloat64,
		MaxX: -math.MaxFloat64, MaxY: -math.MaxFloat64,
	}
	for i := range prims {
		updateBounds(b, &prims[i])
	}
	return b
}

// distance calculates distance between two points
func distance(a, b Point) float64 {
	dx := b.X - a.X
	dy := b.Y - a.Y
	return math.Sqrt(dx*dx + dy*dy)
}

// extractPLCData converts primitives to PLC format
func extractPLCData(prims []Primitive) []PLCItem {
	items := make([]PLCItem, 0, len(prims))
	for _, p := range prims {
		switch p.Type {
		case "line":
			items = append(items, PLCItem{Type: "L", Coords: []float64{p.StartX, p.StartY, p.EndX, p.EndY}, Layer: p.Layer})
		case "arc":
			items = append(items, PLCItem{Type: "A", Coords: []float64{p.CenterX, p.CenterY, p.Radius, p.StartAngle, p.EndAngle}, Layer: p.Layer})
		case "circle":
			items = append(items, PLCItem{Type: "C", Coords: []float64{p.CenterX, p.CenterY, p.Radius}, Layer: p.Layer})
		case "polyline", "polygon":
			coords := make([]float64, 0, len(p.Points)*2)
			for _, pt := range p.Points {
				coords = append(coords, pt.X, pt.Y)
			}
			items = append(items, PLCItem{Type: "P", Coords: coords, Layer: p.Layer})
		}
	}
	return items
}
