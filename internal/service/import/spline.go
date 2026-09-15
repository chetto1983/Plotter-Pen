package importservice

import (
	"errors"
	"math"
)

const bsplineTolerance = 1e-5

// bSpline interpolates a point on a B-spline curve.
// Ported from src/geometry/b-spline.js in the legacy JS implementation.
func bSpline(t float64, degree int, points [][]float64, knots []float64) (Point, error) {
	n := len(points)
	if n == 0 {
		return Point{}, errors.New("no control points")
	}
	if degree < 1 {
		return Point{}, errors.New("degree must be at least 1")
	}
	if degree > n-1 {
		return Point{}, errors.New("degree must be less than or equal to point count - 1")
	}

	// Build knot vector if missing.
	if len(knots) == 0 {
		knots = make([]float64, n+degree+1)
		for i := range knots {
			knots[i] = float64(i)
		}
	}

	domainMin := degree
	domainMax := len(knots) - 1 - degree
	if domainMax <= domainMin {
		return Point{}, errors.New("invalid knot domain")
	}

	low := knots[domainMin]
	high := knots[domainMax]
	t = t*(high-low) + low

	if t < low || t > high {
		if math.Abs(t-low) < bsplineTolerance {
			t = low
		} else if math.Abs(t-high) < bsplineTolerance {
			t = high
		} else {
			return Point{}, errors.New("parameter out of bounds")
		}
	}

	s := domainMin
	for s < domainMax {
		if t >= knots[s] && t <= knots[s+1] {
			break
		}
		s++
	}

	// Homogeneous coordinates (weights default to 1).
	v := make([][]float64, n)
	for i := range n {
		v[i] = []float64{points[i][0], points[i][1], 1}
	}

	for l := 1; l <= degree+1; l++ {
		for i := s; i > s-degree-1+l; i-- {
			denom := knots[i+degree+1-l] - knots[i]
			alpha := 0.0
			if denom != 0 {
				alpha = (t - knots[i]) / denom
			}
			v[i][0] = (1-alpha)*v[i-1][0] + alpha*v[i][0]
			v[i][1] = (1-alpha)*v[i-1][1] + alpha*v[i][1]
			v[i][2] = (1-alpha)*v[i-1][2] + alpha*v[i][2]
		}
	}

	if v[s][2] == 0 {
		return Point{X: v[s][0], Y: v[s][1]}, nil
	}

	return Point{X: v[s][0] / v[s][2], Y: v[s][1] / v[s][2]}, nil
}
