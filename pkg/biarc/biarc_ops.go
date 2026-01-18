// Package biarc - BiArc operations
// Based on DXF Plotter C++ implementation (geometry/biarc.cpp)
package biarc

import "math"

// ToPolyline converts BiArc to polyline with Bulges
// From biarc.cpp line 58-73
func (ba *BiArc) ToPolyline() []Bulge {
	// Half angle from tangent1 to line1
	thetab1 := (LineAngle(ba.Line1) - LineAngle(ba.Tangent1)) / 2.0
	// Half angle from line2 to tangent2
	thetab2 := (LineAngle(ba.Tangent2) - LineAngle(ba.Line2)) / 2.0

	b1 := Bulge{Start: ba.P1, End: ba.Middle, Tangent: math.Tan(thetab1)}
	b2 := Bulge{Start: ba.Middle, End: ba.P2, Tangent: math.Tan(thetab2)}

	return []Bulge{b1, b2}
}

// TangentAtMiddle calculates tangent at BiArc middle point
// From biarc.cpp line 37-45
func (ba *BiArc) TangentAtMiddle() Vector2D {
	// Normalize line1
	line1Len := ba.Line1.Length()
	if line1Len < 1e-10 {
		return ba.Tangent1
	}
	normalizedLine1 := ba.Line1.Div(line1Len)

	// Perpendicular to line1
	perpendicularLine1 := Vector2D{X: -normalizedLine1.Y, Y: normalizedLine1.X}

	// Reflect tangent1 by perpendicular
	tangent1Len := ba.Tangent1.Length()
	if tangent1Len < 1e-10 {
		return ba.Tangent1
	}
	normalizedTangent1 := ba.Tangent1.Div(tangent1Len)

	// Reflect: v - 2*(v·n)*n
	dot := normalizedTangent1.Dot(perpendicularLine1)
	return normalizedTangent1.Sub(perpendicularLine1.Mul(2.0 * dot))
}

// ApproximateLength estimates BiArc length
// From biarc.cpp line 47-50
func (ba *BiArc) ApproximateLength() float64 {
	return ba.Line1.Length() + ba.Line2.Length()
}

// ToLinePolyline converts BiArc to line (fallback)
func (ba *BiArc) ToLinePolyline() Bulge {
	return Bulge{Start: ba.P1, End: ba.P2, Tangent: 0.0}
}

// PointAt evaluates BiArc at parameter t (0-1)
// From JavaScript biarc.js biArcPointAt (lines 388-403)
func (ba *BiArc) PointAt(t float64) Vector2D {
	// Convert BiArc to bulges to get arc parameters
	bulges := ba.ToPolyline()
	b1 := bulges[0]
	b2 := bulges[1]

	// Calculate arc lengths
	r1 := b1.ArcRadius()
	r2 := b2.ArcRadius()
	_, _, startAngle1, endAngle1 := b1.ToArc()
	_, _, startAngle2, endAngle2 := b2.ToArc()

	sweepAngle1 := endAngle1 - startAngle1
	sweepAngle2 := endAngle2 - startAngle2

	arcLength1 := r1 * math.Abs(sweepAngle1)
	arcLength2 := r2 * math.Abs(sweepAngle2)

	// Parametric split point
	s := arcLength1 / (arcLength1 + arcLength2)

	if t <= s {
		// Point is on first arc
		center1, _, _, _ := b1.ToArc()
		tLocal := t / s
		angle := startAngle1 + tLocal*sweepAngle1
		return Vector2D{
			X: center1.X + r1*math.Cos(angle),
			Y: center1.Y + r1*math.Sin(angle),
		}
	} else {
		// Point is on second arc
		center2, _, _, _ := b2.ToArc()
		tLocal := (t - s) / (1 - s)
		angle := startAngle2 + tLocal*sweepAngle2
		return Vector2D{
			X: center2.X + r2*math.Cos(angle),
			Y: center2.Y + r2*math.Sin(angle),
		}
	}
}
