package cam

import (
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

		for pass := 0; pass < numPasses; pass++ {
			currentZ := -float64(pass+1) * settings.StepDown
			if currentZ < -settings.CutDepth {
				currentZ = -settings.CutDepth
			}

			// Rapid to start
			gc.RapidXY(path[0].X, path[0].Y)
			gc.FeedZ(currentZ, settings.FeedZ)

			// PLC: Jump to start, then Z down
			pc.Jump(path[0].X, path[0].Y, settings.FeedXY)
			pc.ZDown()

			// Cut path
			for i := 1; i < len(path); i++ {
				gc.FeedXY(path[i].X, path[i].Y, settings.FeedXY)
				pc.Line(path[i].X, path[i].Y, settings.FeedXY)
			}

			// Retract
			gc.RapidZ(settings.SafeZ)
			pc.ZUp()
		}
	}

	gc.Footer()

	return ProfileResult{
		GCode:    gc.String(),
		PLC:      pc.String(),
		Toolpath: offsetPaths,
	}
}
