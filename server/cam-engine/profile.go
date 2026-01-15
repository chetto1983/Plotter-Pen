package main

import (
	"fmt"
	"math"
	"strings"
)

// generateProfiles creates profile toolpaths for all loops and open paths
func generateProfiles(loops []Loop, openPaths [][]Point, settings Settings) (string, int) {
	gen := NewGCodeGenerator(settings)
	opCount := 0

	gen.WriteHeader()

	toolRadius := settings.ToolDiameter / 2
	baseSide := settings.ProfileSide

	for i, loop := range loops {
		side := resolveProfileSide(loop, baseSide)
		if loop.IsHole {
			gen.Comment("Profile %d (hole)", i+1)
			writeProfileOp(gen, loop, toolRadius, side, settings)
		} else {
			gen.Comment("Profile %d", i+1)
			writeProfileOp(gen, loop, toolRadius, side, settings)
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

func normalizeProfileSide(value string) string {
	side := strings.ToLower(strings.TrimSpace(value))
	switch side {
	case "inside", "outside", "online":
		return side
	default:
		return "outside"
	}
}

func resolveProfileSide(loop Loop, baseSide string) string {
	side := normalizeProfileSide(baseSide)
	if side == "online" {
		return side
	}
	if loop.IsHole {
		if side == "outside" {
			return "inside"
		}
		if side == "inside" {
			return "outside"
		}
	}
	return side
}

func writeProfileOp(gen *GCodeGenerator, loop Loop, toolRadius float64, side string, settings Settings) {
	var offsetDelta float64
	switch side {
	case "outside":
		offsetDelta = toolRadius
	case "inside":
		offsetDelta = -toolRadius
	case "online":
		offsetDelta = 0
	default:
		offsetDelta = toolRadius
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
	if offsetDelta == 0 {
		writeClosedPath(gen, loop.Points, settings, true)
		return
	}

	offsetPaths := OffsetPolygon(loop.Points, offsetDelta)
	if len(offsetPaths) == 0 {
		return
	}

	for _, p := range offsetPaths {
		// Densify path to prevent false circular fits on long straight segments
		// p = DensifyPath(p, 5.0) // Not needed for G1 mode
		writeClosedPath(gen, p, settings, true) // ENABLE ARC FIT
	}
}

func getBounds(pts []Point) string {
	if len(pts) == 0 {
		return "empty"
	}
	minx, miny := pts[0].X, pts[0].Y
	maxx, maxy := minx, miny
	for _, p := range pts {
		if p.X < minx {
			minx = p.X
		}
		if p.Y < miny {
			miny = p.Y
		}
		if p.X > maxx {
			maxx = p.X
		}
		if p.Y > maxy {
			maxy = p.Y
		}
	}
	return fmt.Sprintf("[%.2f,%.2f] -> [%.2f,%.2f]", minx, miny, maxx, maxy)
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

func writeClosedPath(gen *GCodeGenerator, path []Point, settings Settings, allowArcFit bool) {
	if len(path) < 2 {
		return
	}

	points := normalizeFitPoints(path, true, fitPointEpsilon)
	if len(points) < 2 {
		return
	}

	var segments []FitSegment
	if allowArcFit {
		segments = FitArcsAndLines(points, FitOptions{Tolerance: settings.Tolerance, AllowFullCircle: false})
	}
	if len(segments) == 0 {
		currentZ := settings.StartZ
		for currentZ > settings.TargetZ {
			nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

			gen.RapidZ(settings.SafetyHeight)
			gen.RapidXY(points[0].X, points[0].Y)
			gen.LinearZ(nextZ, settings.FeedZ)

			for i := 1; i < len(points); i++ {
				gen.LinearXY(points[i].X, points[i].Y, settings.FeedXY)
			}
			if !pointsNearlyEqual(points[0], points[len(points)-1], fitPointEpsilon) {
				gen.LinearXY(points[0].X, points[0].Y, settings.FeedXY)
			}

			currentZ = nextZ
		}

		gen.RapidZ(settings.SafetyHeight)
		return
	}

	currentZ := settings.StartZ
	for currentZ > settings.TargetZ {
		nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

		gen.RapidZ(settings.SafetyHeight)
		gen.RapidXY(segments[0].Start.X, segments[0].Start.Y)
		gen.LinearZ(nextZ, settings.FeedZ)

		emitSegments(gen, segments, settings.FeedXY)

		currentZ = nextZ
	}

	gen.RapidZ(settings.SafetyHeight)
}

func writeOpenPath(gen *GCodeGenerator, path []Point, settings Settings) {
	if len(path) < 2 {
		return
	}

	points := normalizeFitPoints(path, false, fitPointEpsilon)
	if len(points) < 2 {
		return
	}

	segments := FitArcsAndLines(points, FitOptions{Tolerance: settings.Tolerance, AllowFullCircle: false})
	if len(segments) == 0 {
		currentZ := settings.StartZ
		for currentZ > settings.TargetZ {
			nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

			gen.RapidZ(settings.SafetyHeight)
			gen.RapidXY(points[0].X, points[0].Y)
			gen.LinearZ(nextZ, settings.FeedZ)

			for i := 1; i < len(points); i++ {
				gen.LinearXY(points[i].X, points[i].Y, settings.FeedXY)
			}

			currentZ = nextZ
		}

		gen.RapidZ(settings.SafetyHeight)
		return
	}

	currentZ := settings.StartZ
	for currentZ > settings.TargetZ {
		nextZ := math.Max(currentZ-settings.StepDown, settings.TargetZ)

		gen.RapidZ(settings.SafetyHeight)
		gen.RapidXY(segments[0].Start.X, segments[0].Start.Y)
		gen.LinearZ(nextZ, settings.FeedZ)

		emitSegments(gen, segments, settings.FeedXY)

		currentZ = nextZ
	}

	gen.RapidZ(settings.SafetyHeight)
}
