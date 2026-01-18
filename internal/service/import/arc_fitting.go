package importservice

import (
	"fmt"
	"math"
	"math/rand"
)

// ArcSegment represents a detected circular arc in a polyline
type ArcSegment struct {
	StartIdx int     // Starting index in points array
	EndIdx   int     // Ending index in points array (inclusive)
	CenterX  float64 // Arc center X
	CenterY  float64 // Arc center Y
	Radius   float64 // Arc radius
	Error    float64 // Fitting error (RMSE)
}

// FitPolylineToArcs detects circular arc segments in a polyline using RANSAC
func FitPolylineToArcs(points []Point, tolerance float64) []Primitive {
	if len(points) < 3 {
		return nil
	}

	result := []Primitive{}
	id := 0

	// First, check if the ENTIRE polyline is a circle (closed polyline on a circle)
	// This prevents splitting circles into dozens of tiny arcs
	if isClosedCircle(points, tolerance) {
		// Fit circle to all points
		cx, cy, r := fitCircleTaubin(points)

		// Split into 2 semicircular arcs (180° each) - industrial standard
		// Arc 1: 0° to 180°
		midIdx := len(points) / 2

		result = append(result, Primitive{
			Type:       "arc",
			ID:         fmt.Sprintf("arc_fit_%d", id),
			StartX:     points[0].X,
			StartY:     points[0].Y,
			EndX:       points[midIdx].X,
			EndY:       points[midIdx].Y,
			CenterX:    cx,
			CenterY:    cy,
			Radius:     r,
			StartAngle: math.Atan2(points[0].Y-cy, points[0].X-cx) * 180 / math.Pi,
			EndAngle:   math.Atan2(points[midIdx].Y-cy, points[midIdx].X-cx) * 180 / math.Pi,
			ThroughX:   points[len(points)/4].X,
			ThroughY:   points[len(points)/4].Y,
		})
		id++

		// Arc 2: 180° to 360°
		result = append(result, Primitive{
			Type:       "arc",
			ID:         fmt.Sprintf("arc_fit_%d", id),
			StartX:     points[midIdx].X,
			StartY:     points[midIdx].Y,
			EndX:       points[0].X,
			EndY:       points[0].Y,
			CenterX:    cx,
			CenterY:    cy,
			Radius:     r,
			StartAngle: math.Atan2(points[midIdx].Y-cy, points[midIdx].X-cx) * 180 / math.Pi,
			EndAngle:   math.Atan2(points[0].Y-cy, points[0].X-cx) * 180 / math.Pi,
			ThroughX:   points[midIdx+len(points)/4].X,
			ThroughY:   points[midIdx+len(points)/4].Y,
		})

		return result
	}

	// Otherwise, use segmented arc detection for open polylines
	i := 0
	for i < len(points) {
		// Try to fit an arc starting from point i using RANSAC
		arcSeg := detectArcRANSAC(points, i, tolerance)

		if arcSeg != nil && (arcSeg.EndIdx-arcSeg.StartIdx) >= 2 {
			// Valid arc found - convert to arc primitive
			startX := points[arcSeg.StartIdx].X
			startY := points[arcSeg.StartIdx].Y
			endX := points[arcSeg.EndIdx].X
			endY := points[arcSeg.EndIdx].Y

			// Calculate through point (midpoint on arc) for direction detection
			midIdx := arcSeg.StartIdx + (arcSeg.EndIdx-arcSeg.StartIdx)/2
			throughX := points[midIdx].X
			throughY := points[midIdx].Y

			// Calculate start and end angles (radians then to degrees)
			startAngle := math.Atan2(startY-arcSeg.CenterY, startX-arcSeg.CenterX)
			endAngle := math.Atan2(endY-arcSeg.CenterY, endX-arcSeg.CenterX)
			startAngleDeg := startAngle * 180 / math.Pi
			endAngleDeg := endAngle * 180 / math.Pi

			result = append(result, Primitive{
				Type:       "arc",
				ID:         fmt.Sprintf("arc_fit_%d", id),
				StartX:     startX,
				StartY:     startY,
				EndX:       endX,
				EndY:       endY,
				CenterX:    arcSeg.CenterX,
				CenterY:    arcSeg.CenterY,
				Radius:     arcSeg.Radius,
				StartAngle: startAngleDeg,
				EndAngle:   endAngleDeg,
				ThroughX:   throughX,
				ThroughY:   throughY,
			})
			id++

			// Skip points consumed by this arc
			i = arcSeg.EndIdx
		} else {
			// No good arc fit - create line to next point
			if i+1 < len(points) {
				result = append(result, Primitive{
					Type:   "line",
					ID:     fmt.Sprintf("line_fit_%d", id),
					StartX: points[i].X,
					StartY: points[i].Y,
					EndX:   points[i+1].X,
					EndY:   points[i+1].Y,
				})
				id++
			}
			i++
		}
	}

	return result
}

// detectArcRANSAC uses RANSAC to detect the longest circular arc starting from startIdx
func detectArcRANSAC(points []Point, startIdx int, tolerance float64) *ArcSegment {
	minPoints := 3
	maxIter := 20
	bestSeg := (*ArcSegment)(nil)
	maxInliers := 0

	// Try different arc lengths (up to 100 points to match max tessellation)
	for endIdx := startIdx + minPoints - 1; endIdx < len(points) && endIdx < startIdx+100; endIdx++ {
		segment := points[startIdx : endIdx+1]
		if len(segment) < minPoints {
			continue
		}

		// Run RANSAC iterations
		for iter := 0; iter < maxIter; iter++ {
			// Randomly sample 3 points
			samples := samplePoints(segment, 3)
			if len(samples) < 3 {
				continue
			}

			// Fit circle to samples using Taubin method
			cx, cy, r := fitCircleTaubin(samples)
			if r <= 0.5 || r > 50000 {
				continue // Accept larger radii for shallow arcs (smiles)
			}

			// Count inliers
			inliers := 0
			maxErr := 0.0
			for _, p := range segment {
				dist := math.Abs(pointDistance(p.X, p.Y, cx, cy) - r)
				if dist <= tolerance {
					inliers++
					if dist > maxErr {
						maxErr = dist
					}
				}
			}

			// Check if this is the best fit
			inlierRatio := float64(inliers) / float64(len(segment))
			if inlierRatio >= 0.75 && inliers > maxInliers {
				maxInliers = inliers
				bestSeg = &ArcSegment{
					StartIdx: startIdx,
					EndIdx:   endIdx,
					CenterX:  cx,
					CenterY:  cy,
					Radius:   r,
					Error:    maxErr,
				}
			}
		}

		// If we found a good fit, stop extending
		if bestSeg != nil && float64(maxInliers)/float64(len(segment)) >= 0.95 {
			break
		}
	}

	return bestSeg
}

// fitCircleTaubin fits a circle using Taubin's algebraic method
// Based on "Error analysis for circle fitting algorithms" by Chernov & Lesort
// Reference: https://people.cas.uab.edu/~mosya/cl/CPPcircle.html
func fitCircleTaubin(points []Point) (cx, cy, radius float64) {
	n := len(points)
	if n < 3 {
		return 0, 0, 0
	}

	// Step 1: Calculate centroid
	var meanX, meanY float64
	for _, p := range points {
		meanX += p.X
		meanY += p.Y
	}
	meanX /= float64(n)
	meanY /= float64(n)

	// Step 2: Calculate moments (centered coordinates)
	var Mxx, Myy, Mxy, Mxz, Myz, Mzz float64
	for _, p := range points {
		Xi := p.X - meanX
		Yi := p.Y - meanY
		Zi := Xi*Xi + Yi*Yi

		Mxy += Xi * Yi
		Mxx += Xi * Xi
		Myy += Yi * Yi
		Mxz += Xi * Zi
		Myz += Yi * Zi
		Mzz += Zi * Zi
	}
	Mxx /= float64(n)
	Myy /= float64(n)
	Mxy /= float64(n)
	Mxz /= float64(n)
	Myz /= float64(n)
	Mzz /= float64(n)

	// Step 3: Solve the linear system (Taubin method)
	Mz := Mxx + Myy
	Cov_xy := Mxx*Myy - Mxy*Mxy
	Var_z := Mzz - Mz*Mz

	A3 := 4 * Mz
	A2 := -3*Mz*Mz - Mzz
	A1 := Var_z*Mz + 4*Cov_xy*Mz - Mxz*Mxz - Myz*Myz
	A0 := Mxz*(Mxz*Myy-Myz*Mxy) + Myz*(Myz*Mxx-Mxz*Mxy) - Var_z*Cov_xy

	A22 := A2 + A2
	A33 := A3 + A3 + A3

	// Newton's method for root finding
	x := 0.0
	y := A0
	for iter := 0; iter < 99; iter++ {
		Dy := A1 + x*(A22+A33*x)
		xnew := x - y/Dy
		if xnew == x || math.Abs(xnew-x) < 1e-12 {
			break
		}
		ynew := A0 + xnew*(A1+xnew*(A2+xnew*A3))
		if math.Abs(ynew) >= math.Abs(y) {
			break
		}
		x, y = xnew, ynew
	}

	// Step 4: Calculate center from solution
	det := x*x - x*Mz + Cov_xy
	if math.Abs(det) < 1e-12 {
		return 0, 0, 0
	}

	Xcenter := (Mxz*(Myy-x) - Myz*Mxy) / det / 2.0
	Ycenter := (Myz*(Mxx-x) - Mxz*Mxy) / det / 2.0

	// Step 5: Calculate radius
	cx = Xcenter + meanX
	cy = Ycenter + meanY
	radius = math.Sqrt(Xcenter*Xcenter + Ycenter*Ycenter + Mz)

	return cx, cy, radius
}

// isClosedCircle checks if a polyline forms a complete circle
// Returns true if all points lie on a circle within tolerance
func isClosedCircle(points []Point, tolerance float64) bool {
	if len(points) < 8 {
		return false // Need at least 8 points for a circle
	}

	// Check if start and end are close (closed polyline)
	startEnd := pointDistance(points[0].X, points[0].Y, points[len(points)-1].X, points[len(points)-1].Y)
	if startEnd > tolerance*2 {
		return false // Not closed
	}

	// Fit circle to all points
	cx, cy, r := fitCircleTaubin(points)

	if r <= 0.5 || r > 10000 {
		return false // Invalid radius
	}

	// Check if at least 95% of points lie on the circle
	inliers := 0
	for _, p := range points {
		dist := math.Abs(pointDistance(p.X, p.Y, cx, cy) - r)
		if dist <= tolerance {
			inliers++
		}
	}

	inlierRatio := float64(inliers) / float64(len(points))
	return inlierRatio >= 0.95
}

// samplePoints randomly samples k points from the slice
func samplePoints(points []Point, k int) []Point {
	if k >= len(points) {
		return points
	}

	// Fisher-Yates shuffle for first k elements
	samples := make([]Point, len(points))
	copy(samples, points)

	for i := 0; i < k; i++ {
		j := i + rand.Intn(len(samples)-i)
		samples[i], samples[j] = samples[j], samples[i]
	}

	return samples[:k]
}

// pointDistance calculates Euclidean distance from point to center
func pointDistance(x, y, cx, cy float64) float64 {
	dx := x - cx
	dy := y - cy
	return math.Sqrt(dx*dx + dy*dy)
}
