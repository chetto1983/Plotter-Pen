// Package biarc - Cubic spline to Bezier conversion
// Based on DXF Plotter C++ implementation (geometry/cubicspline.cpp)
package biarc

// CubicSplineToBeziers converts cubic B-spline control points to Bezier curves
// From cubicspline.cpp line 13-112
func CubicSplineToBeziers(controls []Vector2D, closed bool) []Bezier {
	if closed {
		return cubicSplineClosedToBeziers(controls)
	}
	return cubicSplineOpenToBeziers(controls)
}

func cubicSplineClosedToBeziers(controls []Vector2D) []Bezier {
	nbControl := len(controls)
	size := nbControl*3 + 1

	bezierPoints := make([]Vector2D, size)

	// Copy control points to 0, 3, 6, ...
	for i := 0; i <= nbControl; i++ {
		src := i % nbControl
		dst := i * 3
		bezierPoints[dst] = controls[src]
	}

	// Calculate intermediate control points
	for src := 0; src < nbControl; src++ {
		dst := src*3 + 1
		srcNext := (src + 1) % nbControl

		bezierPoints[dst] = controls[src].Mul(2.0).Add(controls[srcNext]).Div(3.0)
		bezierPoints[dst+1] = controls[src].Add(controls[srcNext].Mul(2.0)).Div(3.0)
	}

	// Smooth junction points
	for i := 3; i < size-3; i += 3 {
		bezierPoints[i] = bezierPoints[i-1].Add(bezierPoints[i+1]).Div(2.0)
	}

	// Handle wraparound
	bezierPoints[0] = bezierPoints[size-2].Add(bezierPoints[1]).Div(2.0)
	bezierPoints[size-1] = bezierPoints[0]

	// Convert to Bezier curves
	return pointsToBeziers(bezierPoints)
}

func cubicSplineOpenToBeziers(controls []Vector2D) []Bezier {
	nbControl := len(controls)
	if nbControl < 2 {
		return nil
	}

	lastControl := nbControl - 1
	size := nbControl

	if nbControl > 4 {
		nbPairs := nbControl - 1
		size += 2                 // 2nd and penultimate points
		size += (nbPairs - 4) * 2 // Remaining pairs
	}

	bezierPoints := make([]Vector2D, size)
	last := size - 1

	// Copy begin and end raw points
	for src := 0; src < 2; src++ {
		bezierPoints[src] = controls[src]
		bezierPoints[last-src] = controls[lastControl-src]
	}

	// Copy remaining raw points to 3, 6, 9, ...
	for src, dst := 2, 3; src < nbControl-2; src, dst = src+1, dst+3 {
		bezierPoints[dst] = controls[src]
	}

	if nbControl > 4 {
		// Half points 2 and -3
		bezierPoints[2] = controls[1].Add(controls[2]).Div(2.0)
		bezierPoints[last-2] = controls[lastControl-1].Add(controls[lastControl-2]).Div(2.0)
	}

	// Third points
	for src, dst := 2, 4; src < nbControl-3; src, dst = src+1, dst+3 {
		bezierPoints[dst] = controls[src].Mul(2.0).Add(controls[src+1]).Div(3.0)
		bezierPoints[dst+1] = controls[src].Add(controls[src+1].Mul(2.0)).Div(3.0)
	}

	// Smooth
	for i := 3; i < size-1; i += 3 {
		bezierPoints[i] = bezierPoints[i-1].Add(bezierPoints[i+1]).Div(2.0)
	}

	return pointsToBeziers(bezierPoints)
}

func pointsToBeziers(bezierPoints []Vector2D) []Bezier {
	size := len(bezierPoints)
	numBeziers := size / 3

	if numBeziers == 0 {
		return nil
	}

	beziers := make([]Bezier, numBeziers)

	for src, dst := 0, 0; src < size-1; src, dst = src+3, dst+1 {
		beziers[dst] = Bezier{
			P1: bezierPoints[src],
			C1: bezierPoints[src+1],
			C2: bezierPoints[src+2],
			P2: bezierPoints[src+3],
		}
	}

	return beziers
}
