package geom

import "math"

// Point represents a 2D point
type Point struct {
	X, Y float64
}

// DistanceTo returns the distance to another point via Pythagoras
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

// Circle represents a 2D circle
type Circle struct {
	Cx, Cy, Radius float64
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
