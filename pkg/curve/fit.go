package curve

import (
	"fmt"
	"math"
	"plotter-pen/pkg/geom"
)

// LeastSquaresCircle fits a circle to points using Kasa's method (algebraic fit)
func LeastSquaresCircle(points []geom.Point) (geom.Point, float64, error) {
	n := float64(len(points))

	// Centroid subtraction for stability
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
	A := 2 * suu
	B := 2 * suv
	C := 2 * suv
	D := 2 * svv
	E := suuu + suvv
	F := svvv + suuv

	det := A*D - B*C
	if math.Abs(det) < 1e-9 {
		return geom.Point{}, 0, fmt.Errorf("collinear or singular points")
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
