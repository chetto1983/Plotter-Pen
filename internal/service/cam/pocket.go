package cam

import (
	plcfit "plotter-pen/internal/service/plc"
	"plotter-pen/pkg/clipper"
	"plotter-pen/pkg/gcode"
	"plotter-pen/pkg/geom"
	"plotter-pen/pkg/plc"
)

// PocketSettings for pocket operation
type PocketSettings struct {
	ToolDiameter float64 `json:"toolDiameter"`
	Stepover     float64 `json:"stepover"`
	FeedXY       float64 `json:"feedXY"`
	FeedZ        float64 `json:"feedZ"`
	SafeZ        float64 `json:"safeZ"`
	CutDepth     float64 `json:"cutDepth"`
	StepDown     float64 `json:"stepDown"`
	Tolerance    float64 `json:"tolerance"`
}

// PocketResult contains generated pocket toolpaths
type PocketResult struct {
	GCode    string      `json:"gcode"`
	PLC      string      `json:"plc"`
	Toolpath []geom.Path `json:"toolpath"`
}

// GeneratePocket creates pocket toolpath for closed paths
func GeneratePocket(paths []geom.Path, settings PocketSettings) PocketResult {
	if len(paths) == 0 {
		return PocketResult{}
	}

	toolRadius := settings.ToolDiameter / 2
	stepover := settings.Stepover
	if stepover <= 0 {
		stepover = toolRadius * 0.8 // Default 40% overlap
	}

	// Ensure paths are closed
	var closedPaths []geom.Path
	for _, p := range paths {
		closedPaths = append(closedPaths, p.EnsureClosed(settings.Tolerance))
	}

	// Generate concentric pocket paths using Clipper2
	pocketPaths := clipper.GeneratePocket(closedPaths, toolRadius, stepover)

	// Generate G-code
	gc := gcode.NewGenerator()
	gc.Header()
	gc.Comment("Pocket Operation")
	gc.RapidZ(settings.SafeZ)

	// Generate PLC
	pc := plc.NewGenerator()

	// Calculate number of Z passes
	numPasses := 1
	if settings.StepDown > 0 && settings.CutDepth > settings.StepDown {
		numPasses = int(settings.CutDepth/settings.StepDown) + 1
	}

	for pass := 0; pass < numPasses; pass++ {
		currentZ := -float64(pass+1) * settings.StepDown
		if currentZ < -settings.CutDepth {
			currentZ = -settings.CutDepth
		}

		gc.Comment("Pass " + string(rune('0'+pass+1)))

		for _, path := range pocketPaths {
			if len(path) < 2 {
				continue
			}

			// Fit arcs and lines to the path points
			tolerance := settings.Tolerance
			if tolerance <= 0 {
				tolerance = 0.05
			}
			segments := plcfit.FitArcsAndLines(path, tolerance)

			// Rapid to start
			gc.RapidXY(path[0].X, path[0].Y)
			gc.FeedZ(currentZ, settings.FeedZ)

			// PLC: 3D interpolation - Jump to start at safe Z, then plunge
			pc.Jump(path[0].X, path[0].Y, settings.SafeZ, settings.FeedXY*2) // Rapid at safe Z
			pc.Line(path[0].X, path[0].Y, currentZ, settings.FeedZ)          // Plunge to work depth

			// Cut path using fitted arcs and lines
			for _, seg := range segments {
				if seg.Type == "arc" {
					// Determine arc direction (CW or CCW)
					start := geom.Point{X: seg.X1, Y: seg.Y1}
					end := geom.Point{X: seg.X2, Y: seg.Y2}
					center := geom.Point{X: seg.Cx, Y: seg.Cy}

					// Calculate cross product to determine direction
					v1x, v1y := start.X-center.X, start.Y-center.Y
					v2x, v2y := end.X-center.X, end.Y-center.Y
					cross := v1x*v2y - v1y*v2x
					isCW := cross < 0

					// G-code: G2 (CW) or G3 (CCW)
					gc.Arc(end, center, start, isCW, settings.FeedXY)

					// PLC: Arc command with through-point
					pc.Arc(end, center, start, isCW, currentZ, settings.FeedXY)
				} else {
					// Line segment
					end := geom.Point{X: seg.X2, Y: seg.Y2}
					gc.FeedXY(end.X, end.Y, settings.FeedXY)
					pc.Line(end.X, end.Y, currentZ, settings.FeedXY)
				}
			}

			// Retract to safe Z
			gc.RapidZ(settings.SafeZ)
			lastPt := path[len(path)-1]
			pc.Jump(lastPt.X, lastPt.Y, settings.SafeZ, settings.FeedXY*2)
		}
	}

	gc.Footer()

	return PocketResult{
		GCode:    gc.String(),
		PLC:      pc.String(),
		Toolpath: pocketPaths,
	}
}

// OptimizePathOrder reorders paths using nearest-neighbor heuristic
func OptimizePathOrder(paths []geom.Path) []geom.Path {
	if len(paths) <= 1 {
		return paths
	}

	optimized := make([]geom.Path, 0, len(paths))
	used := make([]bool, len(paths))
	current := geom.Point{X: 0, Y: 0}

	for len(optimized) < len(paths) {
		bestIdx := -1
		bestDist := float64(1e18)

		for i, path := range paths {
			if used[i] || len(path) == 0 {
				continue
			}

			// Check distance to start
			d1 := current.DistanceSq(path[0])
			if d1 < bestDist {
				bestDist = d1
				bestIdx = i
			}

			// Check distance to end (can reverse open paths)
			if !path.IsClosed(0.01) {
				d2 := current.DistanceSq(path[len(path)-1])
				if d2 < bestDist {
					bestDist = d2
					bestIdx = i
				}
			}
		}

		if bestIdx < 0 {
			// No valid path found (all remaining are empty) - exit to prevent infinite loop
			break
		}

		path := paths[bestIdx]
		used[bestIdx] = true

		// Reverse if end is closer
		if !path.IsClosed(0.01) && len(path) > 0 {
			endDist := current.DistanceSq(path[len(path)-1])
			startDist := current.DistanceSq(path[0])
			if endDist < startDist {
				path = path.Reverse()
			}
		}

		optimized = append(optimized, path)
		if len(path) > 0 {
			current = path[len(path)-1]
		}
	}

	return optimized
}
