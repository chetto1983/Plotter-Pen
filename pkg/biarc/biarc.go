// Package biarc implements BiArc approximation for Bezier curves
// Based on DXF Plotter C++ implementation (geometry/biarc.cpp, geometry/bezier.cpp)
package biarc

import "math"

// Vector2D represents a 2D point/vector
type Vector2D struct {
	X, Y float64
}

func (v Vector2D) Add(other Vector2D) Vector2D {
	return Vector2D{v.X + other.X, v.Y + other.Y}
}

func (v Vector2D) Sub(other Vector2D) Vector2D {
	return Vector2D{v.X - other.X, v.Y - other.Y}
}

func (v Vector2D) Mul(scalar float64) Vector2D {
	return Vector2D{v.X * scalar, v.Y * scalar}
}

func (v Vector2D) Div(scalar float64) Vector2D {
	return Vector2D{v.X / scalar, v.Y / scalar}
}

func (v Vector2D) Dot(other Vector2D) float64 {
	return v.X*other.X + v.Y*other.Y
}

func (v Vector2D) Length() float64 {
	return math.Sqrt(v.X*v.X + v.Y*v.Y)
}

// LineAngle calculates angle of vector
func LineAngle(v Vector2D) float64 {
	return math.Atan2(v.Y, v.X)
}

// Bulge represents an arc using bulge notation (DXF/AutoCAD standard)
// Bulge = tan(theta/4) where theta is the arc angle
type Bulge struct {
	Start   Vector2D
	End     Vector2D
	Tangent float64 // tan(theta/4)
}

// Bezier represents a cubic Bezier curve
type Bezier struct {
	P1, P2 Vector2D // End points
	C1, C2 Vector2D // Control points
}

// BiArc represents two connected circular arcs
type BiArc struct {
	P1, P2   Vector2D
	Middle   Vector2D
	Tangent1 Vector2D
	Tangent2 Vector2D
	Line1    Vector2D // Middle - P1
	Line2    Vector2D // P2 - Middle
}

// ForwardLineIntersection finds intersection of two lines (only forward direction)
// From utils.h
func ForwardLineIntersection(p1, c1, p2, c2 Vector2D) *Vector2D {
	dir1 := c1.Sub(p1)
	dir2 := c2.Sub(p2)

	det := dir1.X*dir2.Y - dir1.Y*dir2.X
	if math.Abs(det) < 1e-10 {
		return nil // Parallel
	}

	diff := p2.Sub(p1)
	t := (diff.X*dir2.Y - diff.Y*dir2.X) / det
	s := (diff.X*dir1.Y - diff.Y*dir1.X) / det

	// Only forward intersections
	if t < 0 || s < 0 {
		return nil
	}

	result := p1.Add(dir1.Mul(t))
	return &result
}

// TriangleIncenter calculates the incenter of a triangle
// From utils.h
func TriangleIncenter(a, b, c Vector2D) Vector2D {
	lenA := b.Sub(c).Length()
	lenB := c.Sub(a).Length()
	lenC := a.Sub(b).Length()

	perimeter := lenA + lenB + lenC
	if perimeter == 0 {
		return a
	}

	return a.Mul(lenA).Add(b.Mul(lenB)).Add(c.Mul(lenC)).Div(perimeter)
}
