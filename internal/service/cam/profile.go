package cam

import (
	plcfit "plotter-pen/internal/service/plc"
	"plotter-pen/pkg/clipper"
	"plotter-pen/pkg/gcode"
	"plotter-pen/pkg/geom"
	"plotter-pen/pkg/plc"
)

// ProfileSettings for profile operation
type ProfileSettings struct {
	ToolDiameter float64 `json:"toolDiameter"`
	FeedXY       float64 `json:"feedXY"`
	FeedZ        float64 `json:"feedZ"`
	SafeZ        float64 `json:"safeZ"`
	CutDepth     float64 `json:"cutDepth"`
	StepDown     float64 `json:"stepDown"`
	Tolerance    float64 `json:"tolerance"`
	Offset       string  `json:"offset"` // "inside", "outside", "on"
}

// ProfileResult contains generated toolpaths
type ProfileResult struct {
	GCode    string      `json:"gcode"`
	PLC      string      `json:"plc"`
	Toolpath []geom.Path `json:"toolpath"`
}

// GenerateProfile creates profile toolpath for given paths
func GenerateProfile(paths []geom.Path, settings ProfileSettings) ProfileResult {
	if len(paths) == 0 {
		return ProfileResult{}
	}

	toolRadius := settings.ToolDiameter / 2
	var offsetPaths []geom.Path

	// Apply offset based on setting
	for _, path := range paths {
		var offset float64
		switch settings.Offset {
		case "inside":
			offset = -toolRadius
		case "outside":
			offset = toolRadius
		default: // "on"
			offset = 0
		}

		if offset == 0 {
			offsetPaths = append(offsetPaths, path)
		} else if path.IsClosed(settings.Tolerance) {
			result := clipper.OffsetPolygon(path, offset)
			offsetPaths = append(offsetPaths, result...)
		} else {
			result := clipper.OffsetPathRound(path, offset)
			offsetPaths = append(offsetPaths, result...)
		}
	}

	// Generate G-code
	gc := gcode.NewGenerator()
	gc.Header()
	gc.Comment("Profile Operation")
	gc.RapidZ(settings.SafeZ)

	// Generate PLC
	pc := plc.NewGenerator()

	// Calculate number of passes
	numPasses := 1
	if settings.StepDown > 0 && settings.CutDepth > settings.StepDown {
		numPasses = int(settings.CutDepth/settings.StepDown) + 1
	}

	for _, path := range offsetPaths {
		if len(path) < 2 {
			continue
		}

		// Fit arcs and lines to the path points
		tolerance := settings.Tolerance
		if tolerance <= 0 {
			tolerance = 0.05
		}
		segments := plcfit.FitArcsAndLines(path, tolerance)

		for pass := 0; pass < numPasses; pass++ {
			currentZ := -float64(pass+1) * settings.StepDown
			if currentZ < -settings.CutDepth {
				currentZ = -settings.CutDepth
			}

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
					// (start-center) x (end-center)
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

	return ProfileResult{
		GCode:    gc.String(),
		PLC:      pc.String(),
		Toolpath: offsetPaths,
	}
}
