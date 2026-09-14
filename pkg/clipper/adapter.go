package clipper

import (
	"math"

	"plotter-pen/pkg/geom"

	clipper2 "github.com/bolom009/go-clipper2"
)

// scale converts millimetres to Clipper's integer units (1 unit = 1 µm).
const scale = 1000.0

// contourArcTolerance is the largest gap, in Clipper units (µm), between a rounded corner of an
// offset contour and its chords.
const contourArcTolerance = 5

// OffsetPath offsets an open path (Polyline)
// endType: 0=Polygon, 1=Joined, 2=Butt, 3=Square, 4=Round (go-clipper2 EndType)
func OffsetPath(path geom.Path, delta float64, endType clipper2.EndType) []geom.Path {
	if len(path) < 2 {
		return nil
	}

	// NewClipperOffset(miterLimit, arcTolerance, preserveCollinear, reverseSolution)
	co := clipper2.NewClipperOffset(2.0, 0.25, false, false)
	co.AddPaths(toPaths64([]geom.Path{path}), clipper2.Round, endType) // Standard: Round Join

	var result clipper2.Paths64
	co.Execute64(delta*scale, &result)
	return fromPaths64(result)
}

// OffsetPathRound offsets an open path with round end caps
func OffsetPathRound(path geom.Path, delta float64) []geom.Path {
	// EndType: Polygon=0, Joined=1, Butt=2, Square=3, Round=4
	return OffsetPath(path, delta, clipper2.EndType(4))
}

// OffsetPolygon offsets a closed polygon
func OffsetPolygon(path geom.Path, delta float64) []geom.Path {
	co := clipper2.NewClipperOffset(2.0, 0.25, false, false)
	// JoinTypeRound, EndTypePolygon = 0 (Polygon)
	co.AddPaths(toPaths64([]geom.Path{path}), clipper2.Round, clipper2.Polygon)

	var result clipper2.Paths64
	co.Execute64(delta*scale, &result)
	return fromPaths64(result)
}

// OffsetContours offsets a set of closed contours as one material. The contours are first
// merged with the even-odd rule, so a contour inside another is a hole whatever its
// orientation; then the whole set is offset at once, so nearby parts merge instead of producing
// rings that run through each other. delta > 0 grows the material (tool outside it), delta < 0
// shrinks it (tool inside); corners that grow are rounded.
func OffsetContours(loops []geom.Path, delta float64) []geom.Path {
	rings := clipper2.InflatePaths64(mergeContours(loops), delta*scale, clipper2.Round, clipper2.Polygon,
		clipper2.WithArcTolerance(contourArcTolerance))
	return fromPaths64(rings)
}

// MergeContours returns the material that OffsetContours offsets: the closed contours merged with
// the even-odd rule into rings that do not cross, outlines counterclockwise and holes clockwise.
func MergeContours(loops []geom.Path) []geom.Path {
	return fromPaths64(mergeContours(loops))
}

func mergeContours(loops []geom.Path) clipper2.Paths64 {
	return clipper2.UnionPaths64(toPaths64(loops), clipper2.EvenOdd)
}

// Inside reports, for each ring of inner, which rings of outer enclose it: the result has a row
// per inner ring and a column per outer ring. No two rings may cross, as within the result of
// MergeContours or of OffsetContours, or between the two: then any vertex of the inner ring that
// is not on the outer ring's boundary tells whether the whole ring is inside. A ring is not inside
// itself.
func Inside(inner, outer []geom.Path) [][]bool {
	outerPaths := toPaths64(outer)
	result := make([][]bool, len(inner))
	for i, ring := range toPaths64(inner) {
		result[i] = make([]bool, len(outerPaths))
		for j, around := range outerPaths {
			for _, pt := range ring {
				if pip := clipper2.PointInPolygon(pt, around); pip != clipper2.IsOn {
					result[i][j] = pip == clipper2.IsInside
					break
				}
			}
		}
	}
	return result
}

// GeneratePocket creates a concentric pocket toolpath
// paths: Input geometry (Outer Boundary + Islands)
// toolRadius: Radius of the cutter
// stepOver: Distance between concentric passes
func GeneratePocket(paths []geom.Path, toolRadius float64, stepOver float64) []geom.Path {
	currentLayer := toPaths64(paths)

	var pocketPaths []geom.Path

	// Step 1: Initial Wall Pass (Offset by Tool Radius)
	co := clipper2.NewClipperOffset(2.0, 0.25, false, false)
	co.AddPaths(currentLayer, clipper2.Round, clipper2.Polygon)

	var nextLayer clipper2.Paths64
	co.Execute64(-toolRadius*scale, &nextLayer) // Initial shrink

	// Add initial layer to output
	currentLayer = nextLayer

	// Loop: Recursive StepOver
	for len(currentLayer) > 0 {
		pocketPaths = append(pocketPaths, fromPaths64(currentLayer)...)

		// Calculate Next Layer
		coNext := clipper2.NewClipperOffset(2.0, 0.25, false, false)
		coNext.AddPaths(currentLayer, clipper2.Round, clipper2.Polygon)

		var nextStep clipper2.Paths64
		coNext.Execute64(-stepOver*scale, &nextStep)

		currentLayer = nextStep
	}

	return pocketPaths
}

// toPaths64 rounds coordinates to whole Clipper units: truncating would move every point up to
// one unit towards the origin.
func toPaths64(paths []geom.Path) clipper2.Paths64 {
	out := make(clipper2.Paths64, 0, len(paths))
	for _, p := range paths {
		c := make(clipper2.Path64, len(p))
		for i, pt := range p {
			c[i] = clipper2.Point64{X: int64(math.Round(pt.X * scale)), Y: int64(math.Round(pt.Y * scale))}
		}
		out = append(out, c)
	}
	return out
}

func fromPaths64(paths clipper2.Paths64) []geom.Path {
	var out []geom.Path
	for _, c := range paths {
		p := make(geom.Path, len(c))
		for i, pt := range c {
			p[i] = geom.Point{X: float64(pt.X) / scale, Y: float64(pt.Y) / scale}
		}
		out = append(out, p)
	}
	return out
}
