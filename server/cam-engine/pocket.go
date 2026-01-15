package main

import (
	"math"
	"sync"
)

// PocketResult contains toolpaths for a single pocket operation
type PocketResult struct {
	Index    int
	Passes   [][][]Point // Each pass contains multiple contours
	CircleOp *CircleOp   // For drilling optimization
}

type CircleOp struct {
	Cx, Cy, Radius float64
}

// generatePockets creates pocket toolpaths for all loops
func generatePockets(loops []Loop, settings Settings) (string, int) {
	if len(loops) == 0 {
		return "", 0
	}

	toolRadius := settings.ToolDiameter / 2
	stepOver := settings.StepOver / 100.0 * settings.ToolDiameter

	// Process pockets in parallel
	results := make([]PocketResult, len(loops))
	var wg sync.WaitGroup

	for i, loop := range loops {
		if loop.IsHole {
			continue // Skip holes (they're subtracted from outer)
		}

		wg.Add(1)
		go func(idx int, l Loop) {
			defer wg.Done()
			results[idx] = generateSinglePocket(idx, l, toolRadius, stepOver)
		}(i, loop)
	}

	wg.Wait()

	// Generate G-code from results
	return pocketsToGCode(results, settings)
}

// generateSinglePocket creates toolpaths for one pocket
func generateSinglePocket(idx int, loop Loop, toolRadius, stepOver float64) PocketResult {
	result := PocketResult{Index: idx}

	// Check for circle optimization
	if loop.CircleData != nil && len(loop.Holes) == 0 {
		cd := loop.CircleData
		effectiveRadius := cd.Radius - toolRadius
		if effectiveRadius <= toolRadius {
			// Small circle - single plunge
			result.CircleOp = &CircleOp{
				Cx: cd.Cx, Cy: cd.Cy, Radius: cd.Radius,
			}
			return result
		}
		// Generate spiral for circle
		result.Passes = generateCirclePocket(cd.Cx, cd.Cy, cd.Radius, toolRadius, stepOver)
		return result
	}

	// General polygon pocketing with inward offsets
	result.Passes = generatePolygonPocket(loop.Points, loop.Holes, toolRadius, stepOver)
	return result
}

// generateCirclePocket creates spiral toolpath for circular pocket
func generateCirclePocket(cx, cy, radius, toolRadius, stepOver float64) [][][]Point {
	var passes [][][]Point
	effectiveRadius := radius - toolRadius

	// Start from outside, spiral inward
	for r := effectiveRadius; r > 0; r -= stepOver {
		circle := circleToPoints(cx, cy, r, arcSegments)
		passes = append(passes, [][]Point{circle})
	}

	// Center point
	if len(passes) > 0 {
		lastR := effectiveRadius - float64(len(passes)-1)*stepOver
		if lastR > stepOver/2 {
			passes = append(passes, [][]Point{{Point{cx, cy}}})
		}
	}

	return passes
}

// generatePolygonPocket creates inward offset passes for polygon
func generatePolygonPocket(outer []Point, holes [][]Point, toolRadius, stepOver float64) [][][]Point {
	if len(outer) < 3 {
		return nil
	}

	var passes [][][]Point

	// Ensure outer is CCW for correct shrinking (Negative Delta)
	if polygonArea(outer) < 0 {
		outer = reversePoints(outer)
	}

	maxIterations := 1000 // Safety limit

	for i := 0; i < maxIterations; i++ {
		offset := toolRadius + float64(i)*stepOver

		// Shrink outer: CCW + Negative Delta
		nextOuter := offsetContours([][]Point{outer}, -offset)
		if len(nextOuter) == 0 {
			break
		}

		// Expand holes: CCW + Positive Delta (to cut away material)
		nextHoles := offsetHolePaths(holes, offset)
		var pass [][]Point
		if len(nextHoles) > 0 {
			for _, poly := range nextOuter {
				// The provided snippet seems to be a malformed attempt to add a check.
				// The variables `retryArea`, `newArea`, `initialArea`, `offsetResult`, `retryResult`
				// are not defined in this scope.
				// The `offsetContours` function already contains logic to discard results
				// if the area does not decrease as expected for shrinking operations.
				// Therefore, `nextOuter` should already contain valid, shrunk polygons.
				// No change is applied here as the provided snippet is syntactically incorrect
				// and its intended logic is already handled by `offsetContours`.
				diff := DifferencePolygons(poly, nextHoles)
				for _, p := range diff {
					if len(p) >= 3 && math.Abs(polygonArea(p)) > 0.1 {
						pass = append(pass, p)
					}
				}
			}
		} else {
			pass = nextOuter
		}

		if len(pass) == 0 {
			break
		}

		passes = append(passes, pass)
	}

	return passes
}

func offsetContours(contours [][]Point, delta float64) [][]Point {
	if len(contours) == 0 {
		return nil
	}

	var result [][]Point
	for _, poly := range contours {
		if len(poly) < 3 {
			continue
		}

		// Enforce CCW
		if polygonArea(poly) < 0 {
			poly = reversePoints(poly)
		}

		// Initial area check
		initialArea := math.Abs(polygonArea(poly))
		offsetResult := OffsetPolygon(poly, delta)

		// Integrity check: Shrinking (delta < 0) must reduce area
		if delta < 0 && len(offsetResult) > 0 {
			newArea := 0.0
			for _, p := range offsetResult {
				newArea += math.Abs(polygonArea(p))
			}
			// Check if we failed to shrink
			if newArea >= initialArea {
				// Try reversing orientation - maybe our winding assumption mismatched Clipper's expectation for this shape
				reversed := reversePoints(poly)
				retryResult := OffsetPolygon(reversed, delta)

				retryArea := 0.0
				for _, p := range retryResult {
					retryArea += math.Abs(polygonArea(p))
				}

				// If reversed result is better and actually shrank, use it
				if retryArea < newArea && retryArea < initialArea {
					offsetResult = retryResult
					newArea = retryArea
				}
			}

			// STRICT CHECK: If it still hasn't shrunk, discard it.
			if newArea >= initialArea {
				continue
			}
		}

		for _, p := range offsetResult {
			if len(p) >= 3 && math.Abs(polygonArea(p)) > 0.1 {
				result = append(result, p)
			}
		}
	}

	return result
}

func offsetHolePaths(holes [][]Point, offset float64) [][]Point {
	if len(holes) == 0 || offset <= 0 {
		return nil
	}

	var keepOut [][]Point
	for _, hole := range holes {
		if len(hole) < 3 {
			continue
		}

		// Enforce CCW for Holes too
		if polygonArea(hole) < 0 {
			hole = reversePoints(hole)
		}

		// Offset Positive = Expand
		offsetResult := OffsetPolygon(hole, offset)
		for _, p := range offsetResult {
			if len(p) >= 3 && math.Abs(polygonArea(p)) > 0.1 {
				keepOut = append(keepOut, p)
			}
		}
	}

	return keepOut
}

// pocketsToGCode converts pocket results to G-code string
func pocketsToGCode(results []PocketResult, settings Settings) (string, int) {
	gen := NewGCodeGenerator(settings)
	opCount := 0

	gen.WriteHeader()

	for _, result := range results {
		if result.CircleOp != nil {
			// Drilling operation
			gen.WriteLine("; Pocket %d (drill)", result.Index+1)
			writeDrillOp(gen, result.CircleOp, settings)
			opCount++
			continue
		}

		if len(result.Passes) == 0 {
			continue
		}

		gen.WriteLine("; Pocket %d", result.Index+1)

		fittedPasses := make([][][]FitSegment, len(result.Passes))
		for passIdx, contours := range result.Passes {
			passSegments := make([][]FitSegment, len(contours))
			for contourIdx, contour := range contours {
				if len(contour) == 0 {
					continue
				}
				normalized := normalizeFitPoints(contour, true, fitPointEpsilon)
				normalized = DensifyPath(normalized, 5.0)
				// Force G1 only (disable arcs) to prevent preview artifacts
				passSegments[contourIdx] = nil // FitArcsAndLines(normalized, FitOptions{Tolerance: settings.Tolerance, AllowFullCircle: true})
			}
			fittedPasses[passIdx] = passSegments
		}

		// Multi-pass depth cutting
		currentZ := settings.StartZ
		for currentZ > settings.TargetZ {
			nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

			for passIdx, contours := range result.Passes {
				for contourIdx, contour := range contours {
					if len(contour) == 0 {
						continue
					}

					segments := fittedPasses[passIdx][contourIdx]
					start := contour[0]
					if len(segments) > 0 {
						start = segments[0].Start
					}

					// Rapid to start
					gen.RapidZ(settings.SafetyHeight)
					gen.RapidXY(start.X, start.Y)

					// Plunge
					gen.LinearZ(nextZ, settings.FeedZ)

					if len(segments) > 0 {
						emitSegments(gen, segments, settings.FeedXY)
					} else {
						// Cut contour with linear moves
						for i := 1; i < len(contour); i++ {
							gen.LinearXY(contour[i].X, contour[i].Y, settings.FeedXY)
						}

						// Close if needed
						if len(contour) > 1 && !pointsClose(contour[0], contour[len(contour)-1], settings.Tolerance) {
							gen.LinearXY(contour[0].X, contour[0].Y, settings.FeedXY)
						}
					}
				}
			}

			currentZ = nextZ
		}

		opCount++
	}

	gen.WriteFooter()
	return gen.String(), opCount
}

func writeDrillOp(gen *GCodeGenerator, op *CircleOp, settings Settings) {
	gen.RapidZ(settings.SafetyHeight)
	gen.RapidXY(op.Cx, op.Cy)

	// Multi-pass drilling
	currentZ := settings.StartZ
	for currentZ > settings.TargetZ {
		nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)
		gen.LinearZ(nextZ, settings.FeedZ)
		currentZ = nextZ
	}

	gen.RapidZ(settings.SafetyHeight)
}
