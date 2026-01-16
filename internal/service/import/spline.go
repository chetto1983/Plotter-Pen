package importservice

import "math"

// evaluateBSpline evaluates a B-spline curve and returns sampled points
// Uses De Boor's algorithm for numerical stability
func evaluateBSpline(controls [][]float64, knots []float64, degree int, numSamples int) []Point {
	if len(controls) < 2 || degree < 1 {
		return nil
	}

	// Generate knot vector if not provided or invalid
	if len(knots) < len(controls)+degree+1 {
		knots = generateUniformKnots(len(controls), degree)
	}

	// Find valid parameter range
	tMin := knots[degree]
	tMax := knots[len(knots)-degree-1]
	if tMax <= tMin {
		tMax = tMin + 1.0
	}

	// Sample the curve
	points := make([]Point, 0, numSamples)
	for i := 0; i < numSamples; i++ {
		t := tMin + (tMax-tMin)*float64(i)/float64(numSamples-1)
		// Clamp to avoid numerical issues at boundaries
		if t >= tMax {
			t = tMax - 1e-10
		}
		pt := deBoor(controls, knots, degree, t)
		points = append(points, Point{X: pt[0], Y: pt[1]})
	}

	return points
}

// deBoor evaluates a B-spline at parameter t using De Boor's algorithm
func deBoor(controls [][]float64, knots []float64, degree int, t float64) []float64 {
	n := len(controls)
	k := findKnotSpan(knots, n, degree, t)

	// Copy affected control points
	d := make([][]float64, degree+1)
	for j := 0; j <= degree; j++ {
		idx := k - degree + j
		if idx >= 0 && idx < n {
			d[j] = []float64{controls[idx][0], controls[idx][1]}
		} else {
			d[j] = []float64{0, 0}
		}
	}

	// De Boor recursion
	for r := 1; r <= degree; r++ {
		for j := degree; j >= r; j-- {
			idx := k - degree + j
			denom := knots[idx+degree-r+1] - knots[idx]
			if denom < 1e-10 {
				continue
			}
			alpha := (t - knots[idx]) / denom
			d[j][0] = (1-alpha)*d[j-1][0] + alpha*d[j][0]
			d[j][1] = (1-alpha)*d[j-1][1] + alpha*d[j][1]
		}
	}

	return d[degree]
}

// findKnotSpan finds the knot span index for parameter t
func findKnotSpan(knots []float64, n, degree int, t float64) int {
	if t >= knots[n] {
		return n - 1
	}
	if t <= knots[degree] {
		return degree
	}

	// Binary search
	low, high := degree, n
	mid := (low + high) / 2
	for t < knots[mid] || t >= knots[mid+1] {
		if t < knots[mid] {
			high = mid
		} else {
			low = mid
		}
		mid = (low + high) / 2
	}
	return mid
}

// generateUniformKnots creates a clamped uniform knot vector
func generateUniformKnots(numControls, degree int) []float64 {
	numKnots := numControls + degree + 1
	knots := make([]float64, numKnots)

	for i := 0; i < numKnots; i++ {
		if i <= degree {
			knots[i] = 0.0
		} else if i >= numKnots-degree-1 {
			knots[i] = 1.0
		} else {
			knots[i] = float64(i-degree) / float64(numControls-degree)
		}
	}
	return knots
}

// calculateSplineSamples determines optimal sample count based on control points and curve length
func calculateSplineSamples(controls [][]float64) int {
	return calculateSplineSamplesWithScale(controls, 1.0)
}

// calculateSplineSamplesWithScale determines samples with unit scale factor
// Scale factor converts original units to mm (e.g., 25.4 for inches)
func calculateSplineSamplesWithScale(controls [][]float64, scaleFactor float64) int {
	if len(controls) < 2 {
		return 2
	}

	// Estimate curve length from control polygon IN FINAL UNITS (mm)
	length := 0.0
	for i := 1; i < len(controls); i++ {
		dx := (controls[i][0] - controls[i-1][0]) * scaleFactor
		dy := (controls[i][1] - controls[i-1][1]) * scaleFactor
		length += math.Sqrt(dx*dx + dy*dy)
	}

	// Sample based on length: ~1 point per 1mm - balanced quality vs performance
	samples := int(length)

	// Clamp to reasonable range
	if samples < 50 {
		samples = 50
	}
	if samples > 300 {
		samples = 300
	}
	return samples
}
