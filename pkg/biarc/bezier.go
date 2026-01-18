// Package biarc - Bezier curve operations
// Based on DXF Plotter C++ implementation (geometry/bezier.cpp)
package biarc

import "math"

// At evaluates Bezier curve at parameter t [0,1]
// From bezier.cpp line 107-117
func (b *Bezier) At(t float64) Vector2D {
	ot := 1.0 - t
	ot2 := ot * ot
	ot3 := ot2 * ot
	t2 := t * t
	t3 := t2 * t

	return b.P1.Mul(ot3).
		Add(b.C1.Mul(3.0 * ot2 * t)).
		Add(b.C2.Mul(3.0 * ot * t2)).
		Add(b.P2.Mul(t3))
}

// DerivativeAt calculates derivative at parameter t
// From bezier.cpp line 43-51
func (b *Bezier) DerivativeAt(t float64) Vector2D {
	s := 1.0 - t
	s2 := s * s
	t2 := t * t

	return b.P1.Mul(-3.0 * s2).
		Add(b.C1.Mul(3.0 * (s2 - 2.0*t*s))).
		Add(b.C2.Mul(3.0 * (2.0*t*s - t2))).
		Add(b.P2.Mul(3.0 * t2))
}

// ApproximateLength estimates curve length
// From bezier.cpp line 119-127
func (b *Bezier) ApproximateLength() float64 {
	chord := b.P2.Sub(b.P1).Length()
	controlNet := b.C1.Sub(b.P1).Length() +
		b.C2.Sub(b.C1).Length() +
		b.P2.Sub(b.C2).Length()

	return (chord + controlNet) / 2.0
}

// Split splits Bezier at parameter t
// From bezier.cpp line 129-146
func (b *Bezier) Split(t float64) (Bezier, Bezier) {
	// de Casteljau subdivision
	p0 := b.P1.Add(b.C1.Sub(b.P1).Mul(t))
	p1 := b.C1.Add(b.C2.Sub(b.C1).Mul(t))
	p2 := b.C2.Add(b.P2.Sub(b.C2).Mul(t))

	p01 := p0.Add(p1.Sub(p0).Mul(t))
	p12 := p1.Add(p2.Sub(p1).Mul(t))

	dp := p01.Add(p12.Sub(p01).Mul(t))

	b1 := Bezier{P1: b.P1, C1: p0, C2: p01, P2: dp}
	b2 := Bezier{P1: dp, C1: p12, C2: p2, P2: b.P2}

	return b1, b2
}

// SplitHalf splits Bezier at t=0.5 (optimized)
// From bezier.cpp line 148-163
func (b *Bezier) SplitHalf() (Bezier, Bezier) {
	qc := b.C1.Add(b.C2).Div(4.0)

	r2 := b.P1.Add(b.C1).Div(2.0)
	r3 := r2.Div(2.0).Add(qc)

	s3 := b.C2.Add(b.P2).Div(2.0)
	s2 := s3.Div(2.0).Add(qc)

	dp := r3.Add(s2).Div(2.0)

	b1 := Bezier{P1: b.P1, C1: r2, C2: r3, P2: dp}
	b2 := Bezier{P1: dp, C1: s2, C2: s3, P2: b.P2}

	return b1, b2
}

// SplitToConvex splits Bezier at inflection points
// From bezier.cpp line 165-212
func (b *Bezier) SplitToConvex() []Bezier {
	// Calculate inflection points using complex arithmetic
	A := b.C1.Sub(b.P1)
	B := b.C2.Sub(b.C1).Sub(A)
	C := b.P2.Sub(b.C2).Sub(A).Sub(B.Mul(2.0))

	// Complex coefficients for quadratic equation
	a := B.X*C.Y - B.Y*C.X
	bCoef := A.X*C.Y - A.Y*C.X
	c := A.X*B.Y - A.Y*B.X

	// Solve at² + bt + c = 0
	discriminant := bCoef*bCoef - 4.0*a*c

	// No real inflection points
	if discriminant < 0 {
		return []Bezier{*b}
	}

	// Handle degenerate case (e = 0)
	if math.Abs(a) < 1e-10 {
		// Inflection at t=0.5
		b1, b2 := b.SplitHalf()
		return []Bezier{b1, b2}
	}

	sqrtDisc := math.Sqrt(discriminant)
	t1 := (-bCoef + sqrtDisc) / (2.0 * a)
	t2 := (-bCoef - sqrtDisc) / (2.0 * a)

	// Check if inflection points are real and in range [0,1]
	isReal1 := t1 > 0.0 && t1 < 1.0
	isReal2 := t2 > 0.0 && t2 < 1.0

	// No valid inflection points
	if !isReal1 && !isReal2 {
		return []Bezier{*b}
	}

	// Split at first inflection point
	if isReal1 && !isReal2 {
		b1, b2 := b.Split(t1)
		return []Bezier{b1, b2}
	}

	// Split at second inflection point
	if !isReal1 && isReal2 {
		b1, b2 := b.Split(t2)
		return []Bezier{b1, b2}
	}

	// Both inflection points valid
	if isReal1 && isReal2 {
		// Order inflection points
		if t1 > t2 {
			t1, t2 = t2, t1
		}

		// Too close together, treat as one
		if math.Abs(t1-t2) < 0.01 {
			b1, b2 := b.Split(t1)
			return []Bezier{b1, b2}
		}

		// Split at both points
		b1, temp := b.Split(t1)
		// Adjust t2 to be relative to second segment
		t2Adjusted := (t2 - t1) / (1.0 - t1)
		b2, b3 := temp.Split(t2Adjusted)

		return []Bezier{b1, b2, b3}
	}

	return []Bezier{*b}
}

// FindNearestPointWithTangent finds point on curve with given tangent (Newton-Raphson)
// From bezier.cpp line 53-77
func (b *Bezier) FindNearestPointWithTangent(point, tangent Vector2D, maxError float64) Vector2D {
	tn := 0.5
	Qtn := b.At(tn)

	dpt := point.Dot(tangent)
	fn := Qtn.Dot(tangent) - dpt

	iterations := 0
	maxIterations := 20

	for math.Abs(fn) > maxError && iterations < maxIterations {
		dQtn := b.DerivativeAt(tn)
		dfn := dQtn.Dot(tangent)

		if math.Abs(dfn) < 1e-10 {
			break // Avoid division by zero
		}

		tn = tn - fn/dfn

		// Stop if out of range
		if tn < 0.0 || tn > 1.0 {
			break
		}

		Qtn = b.At(tn)
		fn = Qtn.Dot(tangent) - dpt
		iterations++
	}

	return Qtn
}

// MaxError calculates approximation error (C++ Newton-Raphson)
// From bezier.cpp line 247-256
// Returns SQUARED distance (matches C++ exactly)
func (b *Bezier) MaxError(ba *BiArc) float64 {
	middle := ba.Middle
	tangent := ba.TangentAtMiddle()

	// Find nearest point on Bezier with same tangent as BiArc middle
	nearest := b.FindNearestPointWithTangent(middle, tangent, 0.001)

	// Return SQUARED distance (matches C++ implementation line 255)
	diff := middle.Sub(nearest)
	return diff.X*diff.X + diff.Y*diff.Y
}

// ToBiArc converts a Bezier curve to a BiArc using the incenter method
// From bezier.cpp line 214-235
func (b *Bezier) ToBiArc() *BiArc {
	// Find V, intersection of tangent lines
	v := ForwardLineIntersection(b.P1, b.C1, b.P2, b.C2)
	if v == nil {
		return nil // Parallel tangents
	}

	// Find incenter G of triangle (P1, V, P2)
	incenter := TriangleIncenter(b.P1, *v, b.P2)

	// Create BiArc passing through P1, G, P2
	return &BiArc{
		P1:       b.P1,
		P2:       b.P2,
		Middle:   incenter,
		Tangent1: b.C1.Sub(b.P1),
		Tangent2: b.C2.Sub(b.P2),
		Line1:    incenter.Sub(b.P1),
		Line2:    b.P2.Sub(incenter),
	}
}

// IsPoint checks if Bezier is degenerate (point)
func (b *Bezier) IsPoint() bool {
	return b.P1.Sub(b.P2).Length() < 1e-10
}

// IsStraightLine checks if bezier is actually a straight line
// Control points should be collinear with endpoints
func (b *Bezier) IsStraightLine(tolerance float64) bool {
	line := b.P2.Sub(b.P1)
	lineLength := line.Length()

	if lineLength < 1e-10 {
		return true
	}

	// Normalized line direction
	lineDir := line.Div(lineLength)

	// Check C1 perpendicular distance from line
	c1Offset := b.C1.Sub(b.P1)
	c1Projection := c1Offset.Dot(lineDir)
	c1Perpendicular := c1Offset.Sub(lineDir.Mul(c1Projection))
	if c1Perpendicular.Length() > tolerance {
		return false
	}

	// Check C2 perpendicular distance from line
	c2Offset := b.C2.Sub(b.P1)
	c2Projection := c2Offset.Dot(lineDir)
	c2Perpendicular := c2Offset.Sub(lineDir.Mul(c2Projection))
	return c2Perpendicular.Length() <= tolerance
}

// ToLine converts Bezier to line (for very small curves)
func (b *Bezier) ToLine() Bulge {
	return Bulge{Start: b.P1, End: b.P2, Tangent: 0.0}
}
