// Package biarc - Bulge operations
// Based on DXF Plotter C++ implementation (geometry/bulge.cpp)
package biarc

import "math"

// ArcRadius calculates arc radius from bulge
// From bulge.cpp line 13-22
func (b *Bulge) ArcRadius() float64 {
	absTangent := math.Abs(b.Tangent)
	if absTangent < 1e-10 {
		return 0 // Line segment
	}

	line := b.End.Sub(b.Start)
	lineLength := line.Length()
	radius := (lineLength * (1.0 + b.Tangent*b.Tangent)) / (4.0 * absTangent)
	return radius
}

// RelativeArcCenter calculates center offset from start
// From bulge.cpp line 24-42
func (b *Bulge) RelativeArcCenter() Vector2D {
	line := b.End.Sub(b.Start)
	halfLine := line.Div(2.0)

	theta4 := math.Atan(b.Tangent)
	lineToCenterAngle := math.Pi/2 - theta4*2.0

	if lineToCenterAngle < 1e-5 {
		return halfLine
	}

	lineToCenterTangent := math.Tan(lineToCenterAngle)
	perpendicularHalfLine := Vector2D{X: -halfLine.Y, Y: halfLine.X}
	return halfLine.Add(perpendicularHalfLine.Mul(lineToCenterTangent))
}

// ToCircle converts bulge to circle parameters
// From bulge.cpp line 201-208
func (b *Bulge) ToCircle() (center Vector2D, radius float64, ccw bool) {
	center = b.Start.Add(b.RelativeArcCenter())
	radius = b.ArcRadius()
	ccw = b.Tangent > 0 // positive = CCW, negative = CW
	return
}

// ToArc converts bulge to arc with angles
// From bulge.cpp line 210-218
func (b *Bulge) ToArc() (center Vector2D, radius float64, startAngle, endAngle float64) {
	center, radius, _ = b.ToCircle()
	startAngle = LineAngle(b.Start.Sub(center))
	endAngle = LineAngle(b.End.Sub(center))
	return
}

// IsLine checks if bulge represents a line
func (b *Bulge) IsLine() bool {
	return math.Abs(b.Tangent) < 1e-10
}
