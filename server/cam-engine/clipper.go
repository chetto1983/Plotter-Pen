package main

import (
	clipper "github.com/ctessum/go.clipper"
)

const clipperScale = 1000.0 // Convert mm to integer coords

// toClipperPath converts []Point to Clipper path
func toClipperPath(pts []Point) clipper.Path {
	path := make(clipper.Path, len(pts))
	for i, p := range pts {
		path[i] = clipper.NewIntPoint(
			clipper.CInt(p.X*clipperScale),
			clipper.CInt(p.Y*clipperScale),
		)
	}
	return path
}

// fromClipperPath converts Clipper path to []Point
func fromClipperPath(path clipper.Path) []Point {
	pts := make([]Point, len(path))
	for i, p := range path {
		pts[i] = Point{
			X: float64(p.X) / clipperScale,
			Y: float64(p.Y) / clipperScale,
		}
	}
	return pts
}

// toClipperPaths converts [][]Point to Clipper paths
func toClipperPaths(polygons [][]Point) clipper.Paths {
	paths := make(clipper.Paths, len(polygons))
	for i, poly := range polygons {
		paths[i] = toClipperPath(poly)
	}
	return paths
}

// fromClipperPaths converts Clipper paths to [][]Point
func fromClipperPaths(paths clipper.Paths) [][]Point {
	result := make([][]Point, len(paths))
	for i, path := range paths {
		result[i] = fromClipperPath(path)
	}
	return result
}

// OffsetPolygon insets or outsets a polygon by the given distance
// positive delta = outset (expand), negative delta = inset (shrink)
func OffsetPolygon(polygon []Point, delta float64) [][]Point {
	if len(polygon) < 3 {
		return nil
	}

	co := clipper.NewClipperOffset()
	co.ArcTolerance = 0.25 * clipperScale // Smooth arcs
	co.MiterLimit = 2.0

	path := toClipperPath(polygon)
	co.AddPath(path, clipper.JtRound, clipper.EtClosedPolygon)

	scaledDelta := delta * clipperScale
	result := co.Execute(scaledDelta)

	return fromClipperPaths(result)
}

// OffsetPolygonWithHoles insets a polygon with holes
func OffsetPolygonWithHoles(outer []Point, holes [][]Point, delta float64) [][]Point {
	if len(outer) < 3 {
		return nil
	}

	co := clipper.NewClipperOffset()
	co.ArcTolerance = 0.25 * clipperScale
	co.MiterLimit = 2.0

	// Add outer boundary
	co.AddPath(toClipperPath(outer), clipper.JtRound, clipper.EtClosedPolygon)

	// Add holes (they will be handled by their winding direction)
	for _, hole := range holes {
		if len(hole) >= 3 {
			co.AddPath(toClipperPath(hole), clipper.JtRound, clipper.EtClosedPolygon)
		}
	}

	scaledDelta := delta * clipperScale
	result := co.Execute(scaledDelta)

	return fromClipperPaths(result)
}

// DifferencePolygons subtracts subtractPolys from subjectPoly
func DifferencePolygons(subjectPoly []Point, subtractPolys [][]Point) [][]Point {
	if len(subjectPoly) < 3 {
		return nil
	}

	c := clipper.NewClipper(clipper.IoNone)

	// Add subject
	c.AddPath(toClipperPath(subjectPoly), clipper.PtSubject, true)

	// Add clips
	for _, poly := range subtractPolys {
		if len(poly) >= 3 {
			c.AddPath(toClipperPath(poly), clipper.PtClip, true)
		}
	}

	result, ok := c.Execute1(clipper.CtDifference, clipper.PftNonZero, clipper.PftNonZero)
	if !ok {
		return nil
	}

	return fromClipperPaths(result)
}

// UnionPolygons combines multiple polygons into one
func UnionPolygons(polygons [][]Point) [][]Point {
	if len(polygons) == 0 {
		return nil
	}

	c := clipper.NewClipper(clipper.IoNone)

	for _, poly := range polygons {
		if len(poly) >= 3 {
			c.AddPath(toClipperPath(poly), clipper.PtSubject, true)
		}
	}

	result, ok := c.Execute1(clipper.CtUnion, clipper.PftNonZero, clipper.PftNonZero)
	if !ok {
		return nil
	}

	return fromClipperPaths(result)
}

// IntersectPolygons finds intersection of polygons
func IntersectPolygons(subject []Point, clip []Point) [][]Point {
	if len(subject) < 3 || len(clip) < 3 {
		return nil
	}

	c := clipper.NewClipper(clipper.IoNone)
	c.AddPath(toClipperPath(subject), clipper.PtSubject, true)
	c.AddPath(toClipperPath(clip), clipper.PtClip, true)

	result, ok := c.Execute1(clipper.CtIntersection, clipper.PftNonZero, clipper.PftNonZero)
	if !ok {
		return nil
	}

	return fromClipperPaths(result)
}
