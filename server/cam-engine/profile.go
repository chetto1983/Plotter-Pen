package main

import (
	"math"
)

// generateProfiles creates profile toolpaths for all loops and open paths
func generateProfiles(loops []Loop, openPaths [][]Point, settings Settings) (string, int) {
	gen := NewGCodeGenerator(settings)
	opCount := 0

	gen.WriteHeader()

	toolRadius := settings.ToolDiameter / 2

	for i, loop := range loops {
		if loop.IsHole {
			gen.Comment("Profile %d (hole)", i+1)
			writeProfileOp(gen, loop, toolRadius, "inside", settings)
		} else {
			gen.Comment("Profile %d", i+1)
			writeProfileOp(gen, loop, toolRadius, "outside", settings)
		}
		opCount++
	}

	for i, path := range openPaths {
		if len(path) < 2 {
			continue
		}
		gen.Comment("Open path %d", i+1)
		writeOpenPath(gen, path, settings)
		opCount++
	}

	gen.WriteFooter()
	return gen.String(), opCount
}

func writeProfileOp(gen *GCodeGenerator, loop Loop, toolRadius float64, side string, settings Settings) {
	var offsetDelta float64
	if side == "outside" {
		offsetDelta = toolRadius
	} else {
		offsetDelta = -toolRadius
	}

	// Circle: use G2/G3 arc
	if loop.CircleData != nil {
		cd := loop.CircleData
		effectiveRadius := cd.Radius + offsetDelta
		if effectiveRadius <= 0 {
			return
		}
		writeCircleArc(gen, cd.Cx, cd.Cy, effectiveRadius, settings)
		return
	}

	// Polygon: offset and cut with G1
	offsetPaths := OffsetPolygon(loop.Points, offsetDelta)
	if len(offsetPaths) == 0 {
		offsetPaths = [][]Point{loop.Points}
	}

	for _, path := range offsetPaths {
		writeClosedPath(gen, path, settings)
	}
}

// writeCircleArc writes circle profile using G2/G3 arcs
func writeCircleArc(gen *GCodeGenerator, cx, cy, radius float64, settings Settings) {
	startX := cx + radius
	startY := cy

	currentZ := settings.StartZ
	for currentZ > settings.TargetZ {
		nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

		gen.RapidZ(settings.SafetyHeight)
		gen.RapidXY(startX, startY)
		gen.LinearZ(nextZ, settings.FeedZ)

		// Full circle with G2 (clockwise)
		gen.FullCircle(cx, cy, radius, true, settings.FeedXY)

		currentZ = nextZ
	}

	gen.RapidZ(settings.SafetyHeight)
}

func writeClosedPath(gen *GCodeGenerator, path []Point, settings Settings) {
	if len(path) < 2 {
		return
	}

	currentZ := settings.StartZ
	for currentZ > settings.TargetZ {
		nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

		gen.RapidZ(settings.SafetyHeight)
		gen.RapidXY(path[0].X, path[0].Y)
		gen.LinearZ(nextZ, settings.FeedZ)

		for i := 1; i < len(path); i++ {
			gen.LinearXY(path[i].X, path[i].Y, settings.FeedXY)
		}
		gen.LinearXY(path[0].X, path[0].Y, settings.FeedXY)

		currentZ = nextZ
	}

	gen.RapidZ(settings.SafetyHeight)
}

func writeOpenPath(gen *GCodeGenerator, path []Point, settings Settings) {
	if len(path) < 2 {
		return
	}

	currentZ := settings.StartZ
	for currentZ > settings.TargetZ {
		nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

		gen.RapidZ(settings.SafetyHeight)
		gen.RapidXY(path[0].X, path[0].Y)
		gen.LinearZ(nextZ, settings.FeedZ)

		for i := 1; i < len(path); i++ {
			gen.LinearXY(path[i].X, path[i].Y, settings.FeedXY)
		}

		currentZ = nextZ
	}

	gen.RapidZ(settings.SafetyHeight)
}
