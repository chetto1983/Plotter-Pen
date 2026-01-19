package geom

import "math"

// Point represents a 2D point
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Distance returns the distance to another point via Pythagoras
func (p Point) Distance(other Point) float64 {
	return math.Hypot(other.X-p.X, other.Y-p.Y)
}

// DistanceSq returns the squared distance (optimization)
func (p Point) DistanceSq(other Point) float64 {
	dx := p.X - other.X
	dy := p.Y - other.Y
	return dx*dx + dy*dy
}

// Sub subtracts another point
func (p Point) Sub(other Point) Point {
	return Point{X: p.X - other.X, Y: p.Y - other.Y}
}

// Add adds another point
func (p Point) Add(other Point) Point {
	return Point{X: p.X + other.X, Y: p.Y + other.Y}
}

// Scale multiplies point by scalar
func (p Point) Scale(s float64) Point {
	return Point{X: p.X * s, Y: p.Y * s}
}

// Circle represents a 2D circle
type Circle struct {
	Cx, Cy, Radius float64
}

// Center returns the center point
func (c Circle) Center() Point {
	return Point{X: c.Cx, Y: c.Cy}
}

// Path represents an ordered sequence of points
// Can be Open (Polyline) or Closed (Polygon) depending on usage context
type Path []Point

// IsClosed checks if first and last points are geometrically identical
func (p Path) IsClosed(tolerance float64) bool {
	if len(p) < 3 {
		return false
	}
	return p[0].Distance(p[len(p)-1]) < tolerance
}

// EnsureClosed appends the first point if not present
func (p Path) EnsureClosed(tolerance float64) Path {
	if len(p) < 3 {
		return p
	}
	if p[0].Distance(p[len(p)-1]) < tolerance {
		return p
	}
	return append(p, p[0])
}

// Bounds returns the bounding box of the path
func (p Path) Bounds() (minX, minY, maxX, maxY float64) {
	if len(p) == 0 {
		return 0, 0, 0, 0
	}
	minX, minY = p[0].X, p[0].Y
	maxX, maxY = p[0].X, p[0].Y
	for _, pt := range p[1:] {
		if pt.X < minX {
			minX = pt.X
		}
		if pt.X > maxX {
			maxX = pt.X
		}
		if pt.Y < minY {
			minY = pt.Y
		}
		if pt.Y > maxY {
			maxY = pt.Y
		}
	}
	return
}

// Reverse returns a reversed copy of the path
func (p Path) Reverse() Path {
	n := len(p)
	rev := make(Path, n)
	for i, pt := range p {
		rev[n-1-i] = pt
	}
	return rev
}
