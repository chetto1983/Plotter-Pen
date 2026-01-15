package clipper

import (
	"cam-engine/pkg/geom"

	clipper2 "github.com/bolom009/go-clipper2"
)

// OffsetPath offsets an open path (Polyline)
// endType: 0=Square, 1=Round, 2=Butt
// OffsetPath offsets an open path (Polyline)
// endType: 0=Square, 1=Round, 2=Butt
func OffsetPath(path geom.Path, delta float64, endType clipper2.EndType) []geom.Path {
	if len(path) < 2 {
		return nil
	}

	// Convert geom.Path to clipper2.Path64
	// We scale up float coordinates to int64 for robustness
	const scale = 1000.0
	cPath := make(clipper2.Path64, len(path))
	for i, p := range path {
		cPath[i] = clipper2.Point64{
			X: int64(p.X * scale),
			Y: int64(p.Y * scale),
		}
	}

	// NewClipperOffset(miterLimit, arcTolerance, preserveCollinear, reverseSolution)
	co := clipper2.NewClipperOffset(2.0, 0.25, false, false)
	co.AddPaths(clipper2.Paths64{cPath}, clipper2.Round, endType) // Standard: Round Join

	// Execute offset
	var result clipper2.Paths64
	co.Execute64(delta*scale, &result)

	// Convert back to geom.Path
	var output []geom.Path
	for _, cPoly := range result {
		var gPoly geom.Path
		for _, pt := range cPoly {
			gPoly = append(gPoly, geom.Point{
				X: float64(pt.X) / scale,
				Y: float64(pt.Y) / scale,
			})
		}
		output = append(output, gPoly)
	}

	return output
}

// OffsetPolygon offsets a closed polygon
func OffsetPolygon(path geom.Path, delta float64) []geom.Path {
	// Similar implementation but with EndTypePolygon
	const scale = 1000.0
	cPath := make(clipper2.Path64, len(path))
	for i, p := range path {
		cPath[i] = clipper2.Point64{
			X: int64(p.X * scale),
			Y: int64(p.Y * scale),
		}
	}

	co := clipper2.NewClipperOffset(2.0, 0.25, false, false)
	// JoinTypeRound, EndTypePolygon = 0 (Polygon)
	co.AddPaths(clipper2.Paths64{cPath}, clipper2.Round, clipper2.Polygon)

	var result clipper2.Paths64
	co.Execute64(delta*scale, &result)

	var output []geom.Path
	for _, cPoly := range result {
		var gPoly geom.Path
		for _, pt := range cPoly {
			gPoly = append(gPoly, geom.Point{
				X: float64(pt.X) / scale,
				Y: float64(pt.Y) / scale,
			})
		}
		output = append(output, gPoly)
	}
	return output
}

// GeneratePocket creates a concentric pocket toolpath
// paths: Input geometry (Outer Boundary + Islands)
// toolRadius: Radius of the cutter
// stepOver: Distance between concentric passes
func GeneratePocket(paths []geom.Path, toolRadius float64, stepOver float64) []geom.Path {
	const scale = 1000.0

	// Convert input to Clipper Paths64
	var currentLayer clipper2.Paths64
	for _, p := range paths {
		cPoly := make(clipper2.Path64, len(p))
		for i, pt := range p {
			cPoly[i] = clipper2.Point64{
				X: int64(pt.X * scale),
				Y: int64(pt.Y * scale),
			}
		}
		currentLayer = append(currentLayer, cPoly)
	}

	var pocketPaths []geom.Path

	// Step 1: Initial Wall Pass (Offset by Tool Radius)
	// This clears the boundary and islands.

	co := clipper2.NewClipperOffset(2.0, 0.25, false, false)
	co.AddPaths(currentLayer, clipper2.Round, clipper2.Polygon)

	var nextLayer clipper2.Paths64
	co.Execute64(-toolRadius*scale, &nextLayer) // Initial shrink

	// Add initial layer to output
	currentLayer = nextLayer

	// Loop: Recursive StepOver
	for len(currentLayer) > 0 {
		// Convert current layer to Geom for output
		for _, cPoly := range currentLayer {
			var gPoly geom.Path
			for _, pt := range cPoly {
				gPoly = append(gPoly, geom.Point{
					X: float64(pt.X) / scale,
					Y: float64(pt.Y) / scale,
				})
			}
			pocketPaths = append(pocketPaths, gPoly)
		}

		// Calculate Next Layer
		coNext := clipper2.NewClipperOffset(2.0, 0.25, false, false)
		coNext.AddPaths(currentLayer, clipper2.Round, clipper2.Polygon)

		var nextStep clipper2.Paths64
		coNext.Execute64(-stepOver*scale, &nextStep)

		currentLayer = nextStep
	}

	return pocketPaths
}
