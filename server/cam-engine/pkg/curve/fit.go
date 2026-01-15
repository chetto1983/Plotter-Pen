package curve

import (
	"cam-engine/pkg/geom"
	"fmt"
	"math"
)

// LeastSquaresCircle fits a circle to points using Kasa's method (algebraic fit)
func LeastSquaresCircle(points []geom.Point) (geom.Point, float64, error) {
	n := float64(len(points))
	// var sumX, sumY, sumX2, sumY2, sumXY, sumX3, sumY3, sumXY2, sumX2Y float64

	// For Kasa method (modified A(x^2+y^2) + Dx + Ey + F = 0)
	// Actually typical geometric fit minimizes (R^2 - (x-xc)^2 - (y-yc)^2)^2
	// A simpler linear approach exists.

	// Let's use the simple centroid subtraction for stability
	var cx, cy float64
	for _, p := range points {
		cx += p.X
		cy += p.Y
	}
	cx /= n
	cy /= n

	var suu, suv, svv, suuu, svvv, suuv, suvv float64
	for _, p := range points {
		u := p.X - cx
		v := p.Y - cy
		suu += u * u
		svv += v * v
		suv += u * v
		suuu += u * u * u
		svvv += v * v * v
		suuv += u * u * v
		suvv += u * v * v
	}

	// Solve linear system for (uc, vc)
	// uc * 2*suu + vc * 2*suv = suuu + suvv
	// uc * 2*suv + vc * 2*svv = svvv + suuv

	A := 2 * suu
	B := 2 * suv
	C := 2 * suv
	D := 2 * svv
	E := suuu + suvv
	F := svvv + suuv

	det := A*D - B*C
	if math.Abs(det) < 1e-9 {
		return geom.Point{}, 0, fmt.Errorf("collinear or singular points") // Collinear or singular
	}

	uc := (E*D - B*F) / det
	vc := (A*F - E*C) / det

	center := geom.Point{X: uc + cx, Y: vc + cy}

	// Calculate Radius (Average distance)
	var sumR float64
	for _, p := range points {
		sumR += p.Distance(center)
	}
	radius := sumR / n

	return center, radius, nil
}
