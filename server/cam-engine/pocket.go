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
	if loop.CircleData != nil {
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
	result.Passes = generatePolygonPocket(loop.Points, toolRadius, stepOver)
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
func generatePolygonPocket(outer []Point, toolRadius, stepOver float64) [][][]Point {
	if len(outer) < 3 {
		return nil
	}

	var passes [][][]Point
	current := [][]Point{outer}
	maxIterations := 1000 // Safety limit

	for i := 0; i < maxIterations; i++ {
		// First pass: offset by tool radius
		// Subsequent passes: offset by stepOver
		offset := -toolRadius
		if i > 0 {
			offset = -stepOver
		}

		var nextPaths [][]Point
		for _, poly := range current {
			if len(poly) < 3 {
				continue
			}
			offsetResult := OffsetPolygon(poly, offset)
			for _, p := range offsetResult {
				if len(p) >= 3 && polygonArea(p) > 0.1 { // Min area threshold
					nextPaths = append(nextPaths, p)
				}
			}
		}

		if len(nextPaths) == 0 {
			break
		}

		passes = append(passes, nextPaths)
		current = nextPaths
	}

	return passes
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

		// Multi-pass depth cutting
		currentZ := settings.StartZ
		for currentZ > settings.TargetZ {
			nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

			for _, contours := range result.Passes {
				for _, contour := range contours {
					if len(contour) == 0 {
						continue
					}

					// Rapid to start
					gen.RapidZ(settings.SafetyHeight)
					gen.RapidXY(contour[0].X, contour[0].Y)

					// Plunge
					gen.LinearZ(nextZ, settings.FeedZ)

					// Cut contour
					for i := 1; i < len(contour); i++ {
						gen.LinearXY(contour[i].X, contour[i].Y, settings.FeedXY)
					}

					// Close if needed
					if !pointsClose(contour[0], contour[len(contour)-1]) {
						gen.LinearXY(contour[0].X, contour[0].Y, settings.FeedXY)
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
