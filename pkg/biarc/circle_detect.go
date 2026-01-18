// Package biarc - Circle detection from control points
package biarc

import "math"

// CircleFromPoints detects if points form a perfect circle
// Returns center, radius, and true if circle detected
func CircleFromPoints(points []Vector2D, tolerance float64) (center Vector2D, radius float64, isCircle bool) {
	if len(points) < 3 {
		return Vector2D{}, 0, false
	}

	// Use least-squares circle fitting
	center, radius = leastSquareCircleFit(points)

	// Verify all points are within tolerance of the circle
	maxError := 0.0
	for _, p := range points {
		dist := math.Sqrt((p.X-center.X)*(p.X-center.X) + (p.Y-center.Y)*(p.Y-center.Y))
		error := math.Abs(dist - radius)
		if error > maxError {
			maxError = error
		}
	}

	// If max error is within tolerance, it's a circle
	isCircle = maxError < tolerance
	return center, radius, isCircle
}

// leastSquareCircleFit computes best-fit circle using least squares
// Algorithm from: https://dtcenter.org/met/users/docs/write_ups/circle_fit.pdf
func leastSquareCircleFit(points []Vector2D) (center Vector2D, radius float64) {
	n := float64(len(points))
	if n == 0 {
		return Vector2D{}, 0
	}

	// Calculate sums
	var sumX, sumY, sumX2, sumY2, sumXY, sumX3, sumY3, sumXY2, sumX2Y float64

	for _, p := range points {
		x := p.X
		y := p.Y
		x2 := x * x
		y2 := y * y

		sumX += x
		sumY += y
		sumX2 += x2
		sumY2 += y2
		sumXY += x * y
		sumX3 += x2 * x
		sumY3 += y2 * y
		sumXY2 += x * y2
		sumX2Y += x2 * y
	}

	// Calculate coefficients
	C := n*sumX2 - sumX*sumX
	D := n*sumXY - sumX*sumY
	E := n*sumX3 + n*sumXY2 - (sumX2+sumY2)*sumX
	G := n*sumY2 - sumY*sumY
	H := n*sumX2Y + n*sumY3 - (sumX2+sumY2)*sumY

	// Solve for center
	denominator := C*G - D*D
	if math.Abs(denominator) < 1e-10 {
		// Fallback to centroid
		center.X = sumX / n
		center.Y = sumY / n
		radius = 0
		return center, radius
	}

	a := (H*D - E*G) / denominator
	b := (H*C - E*D) / denominator

	center.X = a / 2.0
	center.Y = b / 2.0

	// Calculate radius
	c := (sumX2 + sumY2 - a*sumX - b*sumY) / n
	radius = math.Sqrt(center.X*center.X + center.Y*center.Y + c)

	return center, radius
}

// CircleToTwoArcs converts a circle to 2 semicircular bulges (180° each)
func CircleToTwoArcs(center Vector2D, radius float64) []Bulge {
	// First semicircle: left to right (180°)
	p1 := Vector2D{X: center.X - radius, Y: center.Y}
	p2 := Vector2D{X: center.X + radius, Y: center.Y}

	// Bulge tangent for 180° arc = tan(180°/4) = tan(45°) = 1.0
	bulge1 := Bulge{
		Start:   p1,
		End:     p2,
		Tangent: 1.0, // 180° arc, CCW
	}

	// Second semicircle: right to left (180°)
	bulge2 := Bulge{
		Start:   p2,
		End:     p1,
		Tangent: 1.0, // 180° arc, CCW
	}

	return []Bulge{bulge1, bulge2}
}

// ArcFromPoints detects if points form a circular arc (not closed)
// Returns center, radius, start/end points, and true if arc detected
func ArcFromPoints(points []Vector2D, tolerance float64) (center Vector2D, radius float64, isArc bool) {
	if len(points) < 3 {
		return Vector2D{}, 0, false
	}

	// Use least-squares circle fitting
	center, radius = leastSquareCircleFit(points)

	// Verify all points are within tolerance of the circle
	maxError := 0.0
	for _, p := range points {
		dist := math.Sqrt((p.X-center.X)*(p.X-center.X) + (p.Y-center.Y)*(p.Y-center.Y))
		error := math.Abs(dist - radius)
		if error > maxError {
			maxError = error
		}
	}

	// If max error is within tolerance, it's an arc
	isArc = maxError < tolerance
	return center, radius, isArc
}

// ArcToSingleBulge converts arc points to a single bulge
func ArcToSingleBulge(points []Vector2D, center Vector2D, radius float64) Bulge {
	if len(points) < 2 {
		return Bulge{Start: points[0], End: points[0], Tangent: 0}
	}

	start := points[0]
	end := points[len(points)-1]

	// Calculate angles
	startAngle := math.Atan2(start.Y-center.Y, start.X-center.X)
	endAngle := math.Atan2(end.Y-center.Y, end.X-center.X)

	// Calculate sweep angle
	sweepAngle := endAngle - startAngle

	// Normalize to -2π to 2π
	for sweepAngle > 2*math.Pi {
		sweepAngle -= 2 * math.Pi
	}
	for sweepAngle < -2*math.Pi {
		sweepAngle += 2 * math.Pi
	}

	// Bulge tangent = tan(sweep/4)
	tangent := math.Tan(sweepAngle / 4.0)

	return Bulge{
		Start:   start,
		End:     end,
		Tangent: tangent,
	}
}
