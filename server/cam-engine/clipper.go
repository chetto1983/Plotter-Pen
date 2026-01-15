package main

import (
	clipper "github.com/bolom009/go-clipper2"
)

const clipperScale = 1000.0 // Convert mm to integer coords

// toClipperPath converts []Point to Clipper path
func toClipperPath(pts []Point) clipper.Path64 {
	path := make(clipper.Path64, len(pts))
	for i, p := range pts {
		path[i] = clipper.Point64{
			X: int64(p.X * clipperScale),
			Y: int64(p.Y * clipperScale),
		}
	}
	return path
}

// fromClipperPath converts Clipper path to []Point
func fromClipperPath(path clipper.Path64) []Point {
	pts := make([]Point, len(path))
	for i, p := range path {
		pts[i] = Point{
			X: float64(p.X) / clipperScale,
			Y: float64(p.Y) / clipperScale,
		}
	}
	return pts
}

// fromClipperPaths converts Clipper paths to [][]Point
func fromClipperPaths(paths clipper.Paths64) [][]Point {
	result := make([][]Point, len(paths))
	for i, path := range paths {
		result[i] = fromClipperPath(path)
	}
	return result
}

// OffsetPolygon insets or outsets a polygon by the given distance
func OffsetPolygon(polygon []Point, delta float64) [][]Point {
	if len(polygon) < 3 {
		return nil
	}

	path := toClipperPath(polygon)
	paths := clipper.Paths64{path}

	// InflatePaths (Offset)
	// Round, Polygon (no miter limit arg needed as 2.0 is default)
	result := clipper.InflatePaths64(paths, delta*clipperScale, clipper.Round, clipper.Polygon)

	return fromClipperPaths(result)
}

// OffsetPolygonWithHoles insets a polygon with holes
func OffsetPolygonWithHoles(outer []Point, holes [][]Point, delta float64) [][]Point {
	if len(outer) < 3 {
		return nil
	}

	paths := FnToClipperPaths(outer, holes)

	result := clipper.InflatePaths64(paths, delta*clipperScale, clipper.Round, clipper.Polygon)

	return fromClipperPaths(result)
}

func FnToClipperPaths(outer []Point, holes [][]Point) clipper.Paths64 {
	paths := make(clipper.Paths64, 0, 1+len(holes))
	paths = append(paths, toClipperPath(outer))
	for _, h := range holes {
		if len(h) >= 3 {
			paths = append(paths, toClipperPath(h))
		}
	}
	return paths
}

// DifferencePolygons subtracts subtractPolys from subjectPoly
func DifferencePolygons(subjectPoly []Point, subtractPolys [][]Point) [][]Point {
	if len(subjectPoly) < 3 {
		return nil
	}

	subj := clipper.Paths64{toClipperPath(subjectPoly)}

	clips := make(clipper.Paths64, 0, len(subtractPolys))
	for _, p := range subtractPolys {
		if len(p) >= 3 {
			clips = append(clips, toClipperPath(p))
		}
	}

	// BooleanOpPaths64
	result := clipper.BooleanOpPaths64(clipper.Difference, subj, clips, clipper.EvenOdd)
	return fromClipperPaths(result)
}

// UnionPolygons combines multiple polygons into one
func UnionPolygons(polygons [][]Point) [][]Point {
	if len(polygons) == 0 {
		return nil
	}

	subj := make(clipper.Paths64, 0, len(polygons))
	for _, p := range polygons {
		if len(p) >= 3 {
			subj = append(subj, toClipperPath(p))
		}
	}

	// Union
	result := clipper.BooleanOpPaths64(clipper.Union, subj, nil, clipper.NonZero)
	return fromClipperPaths(result)
}

// IntersectPolygons finds intersection of polygons
func IntersectPolygons(subject []Point, clip []Point) [][]Point {
	if len(subject) < 3 || len(clip) < 3 {
		return nil
	}

	subj := clipper.Paths64{toClipperPath(subject)}
	clips := clipper.Paths64{toClipperPath(clip)}

	result := clipper.BooleanOpPaths64(clipper.Intersection, subj, clips, clipper.NonZero)
	return fromClipperPaths(result)
}
