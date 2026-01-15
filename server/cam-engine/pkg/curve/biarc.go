package curve

import (
	"cam-engine/pkg/geom"
	"math"
)

// FitResult represents a segment (Line or Arc)
type FitResult struct {
	IsArc bool
	Path  geom.Path // The points in this segment (start to end)
}

// FitArcsAndLines fits arcs and lines to a sequence of points using a greedy approach.
// This matches the logic of `src/geometry/biarc.js`.
func FitSimpleArc(points []geom.Point, tolerance float64) ([]geom.Path, []bool) {
	if len(points) < 2 {
		return []geom.Path{}, []bool{}
	}

	var results []geom.Path
	var areArcs []bool

	minRadius := 0.5
	maxRadius := 50000.0

	i := 0
	for i < len(points)-1 {
		bestArcEnd := -1
		var bestCircle *geom.Circle

		// Try arc fitting (need at least 3 points)
		if i+2 < len(points) {
			// Look ahead window (similar to JS: j < i + 80)
			limit := i + 80
			if limit > len(points) {
				limit = len(points)
			}

			for j := i + 2; j < limit; j++ {
				mid := (i + j) / 2
				circle := CircleFrom3Points(points[i], points[mid], points[j])

				if circle == nil || circle.Radius < minRadius || circle.Radius > maxRadius {
					continue
				}

				// Check error for all points in range [i, j]
				fits := true
				for k := i; k <= j; k++ {
					dist := math.Abs(points[k].Distance(geom.Point{X: circle.Cx, Y: circle.Cy}) - circle.Radius)
					if dist > tolerance {
						fits = false
						break
					}
				}

				if fits {
					bestArcEnd = j
					bestCircle = circle
				}
				// Keep searching for longer arcs
			}
		}

		if bestArcEnd > i+1 && bestCircle != nil {
			// Found an arc
			// Extract segment
			segment := make(geom.Path, bestArcEnd-i+1)
			copy(segment, points[i:bestArcEnd+1])

			results = append(results, segment)
			areArcs = append(areArcs, true)

			i = bestArcEnd
		} else {
			// Try line fitting
			lineEnd := i + 1
			limit := i + 50
			if limit > len(points) {
				limit = len(points)
			}

			// Greedy line expansion
			for j := i + 2; j < limit; j++ {
				fits := true
				start := points[i]
				end := points[j]

				for k := i + 1; k < j; k++ {
					dist := PointToLineDistance(points[k], start, end)
					if dist > tolerance {
						fits = false
						break
					}
				}

				if fits {
					lineEnd = j
				} else {
					break
				}
			}

			segment := make(geom.Path, lineEnd-i+1)
			copy(segment, points[i:lineEnd+1])

			results = append(results, segment)
			areArcs = append(areArcs, false)

			i = lineEnd
		}
	}

	return results, areArcs
}

// CircleFrom3Points calculates the circle passing through 3 points.
func CircleFrom3Points(p1, p2, p3 geom.Point) *geom.Circle {
	x1, y1 := p1.X, p1.Y
	x2, y2 := p2.X, p2.Y
	x3, y3 := p3.X, p3.Y

	D := 2 * (x1*(y2-y3) + x2*(y3-y1) + x3*(y1-y2))
	if math.Abs(D) < 1e-9 {
		return nil // Collinear
	}

	Ux := ((x1*x1+y1*y1)*(y2-y3) + (x2*x2+y2*y2)*(y3-y1) + (x3*x3+y3*y3)*(y1-y2)) / D
	Uy := ((x1*x1+y1*y1)*(x3-x2) + (x2*x2+y2*y2)*(x1-x3) + (x3*x3+y3*y3)*(x2-x1)) / D

	center := geom.Point{X: Ux, Y: Uy}
	radius := center.Distance(p1)

	return &geom.Circle{Cx: Ux, Cy: Uy, Radius: radius}
}

// PointToLineDistance fits JS pointToLineDistance
func PointToLineDistance(p, start, end geom.Point) float64 {
	l2 := start.DistanceSq(end)
	if l2 == 0 {
		return p.Distance(start)
	}

	t := ((p.X-start.X)*(end.X-start.X) + (p.Y-start.Y)*(end.Y-start.Y)) / l2
	if t < 0 {
		return p.Distance(start)
	}
	if t > 1 {
		return p.Distance(end)
	}

	proj := geom.Point{
		X: start.X + t*(end.X-start.X),
		Y: start.Y + t*(end.Y-start.Y),
	}
	return p.Distance(proj)
}
