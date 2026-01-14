package main

import (
	"fmt"
	"math"
	"sort"
)

const (
	tolerance    = 0.5  // mm - endpoint connection tolerance
	gridCellSize = 5.0  // mm - spatial grid cell size
	arcSegments  = 64   // max points per arc
)

// Loop represents a closed polygon
type Loop struct {
	Points     []Point
	CircleData *CircleData
	Area       float64
	IsHole     bool
}

type CircleData struct {
	Cx, Cy, Radius float64
}

// Segment represents a line or arc segment with endpoints
type Segment struct {
	Start, End Point
	Points     []Point
}

// SpatialGrid for O(1) endpoint lookup
type SpatialGrid struct {
	cells    map[string][]gridEntry
	cellSize float64
}

type gridEntry struct {
	index   int
	reverse bool
}

func newSpatialGrid() *SpatialGrid {
	return &SpatialGrid{
		cells:    make(map[string][]gridEntry),
		cellSize: gridCellSize,
	}
}

func (g *SpatialGrid) key(x, y float64) string {
	cx := int(math.Floor(x / g.cellSize))
	cy := int(math.Floor(y / g.cellSize))
	return fmt.Sprintf("%d,%d", cx, cy)
}

func (g *SpatialGrid) add(p Point, entry gridEntry) {
	k := g.key(p.X, p.Y)
	g.cells[k] = append(g.cells[k], entry)
}

func (g *SpatialGrid) queryNear(p Point) []gridEntry {
	var results []gridEntry
	cx := int(math.Floor(p.X / g.cellSize))
	cy := int(math.Floor(p.Y / g.cellSize))

	// Check 3x3 neighborhood
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			k := fmt.Sprintf("%d,%d", cx+dx, cy+dy)
			results = append(results, g.cells[k]...)
		}
	}
	return results
}

// buildPaths converts primitives to closed loops and open paths
func buildPaths(primitives []Primitive) ([]Loop, [][]Point) {
	var loops []Loop
	var segments []Segment

	for _, prim := range primitives {
		// Try to convert to direct closed shape
		if polygon := primitiveToPolygon(prim); polygon != nil {
			var circleData *CircleData
			if prim.Type == "circle" {
				cx, cy := getCenter(prim)
				circleData = &CircleData{Cx: cx, Cy: cy, Radius: prim.Radius}
			}
			loops = append(loops, Loop{
				Points:     polygon,
				CircleData: circleData,
				Area:       polygonArea(polygon),
			})
			continue
		}

		// Convert to segment for connection
		if seg := primitiveToSegment(prim); seg != nil {
			segments = append(segments, *seg)
		}
	}

	// Connect segments into loops using spatial grid
	if len(segments) > 0 {
		connectedLoops := connectSegments(segments)
		for _, pts := range connectedLoops {
			loops = append(loops, Loop{
				Points: pts,
				Area:   polygonArea(pts),
			})
		}
	}

	// Group loops by containment (outer + holes)
	groupedLoops := groupByContainment(loops)

	return groupedLoops, nil // No open paths for now
}

func getCenter(prim Primitive) (float64, float64) {
	if prim.Center != nil {
		return prim.Center.X, prim.Center.Y
	}
	return prim.Cx, prim.Cy
}

// primitiveToPolygon converts closed shapes to polygon points
func primitiveToPolygon(prim Primitive) []Point {
	switch prim.Type {
	case "circle":
		cx, cy := getCenter(prim)
		r := prim.Radius
		if r <= 0 {
			return nil
		}
		return circleToPoints(cx, cy, r, arcSegments)

	case "rectangle":
		x, y, w, h := prim.X, prim.Y, prim.Width, prim.Height
		if w <= 0 || h <= 0 {
			return nil
		}
		return []Point{
			{x, y}, {x + w, y}, {x + w, y + h}, {x, y + h},
		}

	case "polygon":
		if len(prim.Points) >= 3 {
			return prim.Points
		}
	}
	return nil
}

// primitiveToSegment converts open shapes to segments
func primitiveToSegment(prim Primitive) *Segment {
	switch prim.Type {
	case "line":
		return &Segment{
			Start:  Point{prim.X1, prim.Y1},
			End:    Point{prim.X2, prim.Y2},
			Points: []Point{{prim.X1, prim.Y1}, {prim.X2, prim.Y2}},
		}

	case "arc":
		cx, cy := getCenter(prim)
		r := prim.Radius
		if r <= 0 {
			return nil
		}
		points := arcToPoints(cx, cy, r, prim.StartAngle, prim.Sweep)
		if len(points) < 2 {
			return nil
		}
		return &Segment{
			Start:  points[0],
			End:    points[len(points)-1],
			Points: points,
		}

	case "polyline":
		if len(prim.Points) >= 2 {
			return &Segment{
				Start:  prim.Points[0],
				End:    prim.Points[len(prim.Points)-1],
				Points: prim.Points,
			}
		}
	}
	return nil
}

func circleToPoints(cx, cy, r float64, segments int) []Point {
	points := make([]Point, segments)
	for i := 0; i < segments; i++ {
		angle := float64(i) / float64(segments) * 2 * math.Pi
		points[i] = Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		}
	}
	return points
}

func arcToPoints(cx, cy, r, startAngle, sweep float64) []Point {
	steps := int(math.Min(float64(arcSegments), math.Max(8, math.Ceil(math.Abs(sweep)/(math.Pi/18)))))
	points := make([]Point, steps+1)
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		angle := startAngle + sweep*t
		points[i] = Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		}
	}
	return points
}

// connectSegments chains segments into closed loops using spatial grid
func connectSegments(segments []Segment) [][]Point {
	if len(segments) == 0 {
		return nil
	}

	var loops [][]Point
	used := make([]bool, len(segments))

	// Build spatial grids for start and end points
	startGrid := newSpatialGrid()
	endGrid := newSpatialGrid()

	for i, seg := range segments {
		startGrid.add(seg.Start, gridEntry{index: i, reverse: false})
		endGrid.add(seg.End, gridEntry{index: i, reverse: true})
	}

	// Find next segment connecting to current endpoint
	findNext := func(end Point, excludeIdx int) (int, bool, bool) {
		// Check segments starting near 'end'
		for _, entry := range startGrid.queryNear(end) {
			if !used[entry.index] && entry.index != excludeIdx {
				if pointsClose(end, segments[entry.index].Start) {
					return entry.index, false, true
				}
			}
		}
		// Check segments ending near 'end' (need to reverse)
		for _, entry := range endGrid.queryNear(end) {
			if !used[entry.index] && entry.index != excludeIdx {
				if pointsClose(end, segments[entry.index].End) {
					return entry.index, true, true
				}
			}
		}
		return -1, false, false
	}

	// Build loops
	for i := range segments {
		if used[i] {
			continue
		}

		used[i] = true
		pathPoints := append([]Point{}, segments[i].Points...)
		start := pathPoints[0]
		end := pathPoints[len(pathPoints)-1]
		maxIter := len(segments) * 2

		for iter := 0; iter < maxIter; iter++ {
			// Check if closed
			if pointsClose(end, start) && len(pathPoints) >= 3 {
				loops = append(loops, pathPoints)
				break
			}

			// Find next segment
			nextIdx, reverse, found := findNext(end, i)
			if !found {
				break
			}

			used[nextIdx] = true
			nextPts := segments[nextIdx].Points
			if reverse {
				nextPts = reversePoints(nextPts)
			}

			// Append (skip first point to avoid duplicate)
			pathPoints = append(pathPoints, nextPts[1:]...)
			end = pathPoints[len(pathPoints)-1]
		}
	}

	return loops
}

func pointsClose(a, b Point) bool {
	dx := a.X - b.X
	dy := a.Y - b.Y
	return dx*dx+dy*dy <= tolerance*tolerance
}

func reversePoints(pts []Point) []Point {
	n := len(pts)
	result := make([]Point, n)
	for i := 0; i < n; i++ {
		result[i] = pts[n-1-i]
	}
	return result
}

// polygonArea calculates signed area (positive = CCW)
func polygonArea(pts []Point) float64 {
	if len(pts) < 3 {
		return 0
	}
	area := 0.0
	n := len(pts)
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		area += pts[i].X*pts[j].Y - pts[j].X*pts[i].Y
	}
	return area / 2
}

// groupByContainment groups loops into outer boundaries with holes
func groupByContainment(loops []Loop) []Loop {
	if len(loops) == 0 {
		return nil
	}

	// Sort by absolute area (largest first = outer boundaries)
	sort.Slice(loops, func(i, j int) bool {
		return math.Abs(loops[i].Area) > math.Abs(loops[j].Area)
	})

	// For now, just return all loops (containment grouping can be added later)
	// Mark negative area as holes
	for i := range loops {
		loops[i].IsHole = loops[i].Area < 0
	}

	return loops
}

// pointInPolygon checks if point is inside polygon using ray casting
func pointInPolygon(p Point, polygon []Point) bool {
	n := len(polygon)
	if n < 3 {
		return false
	}

	inside := false
	j := n - 1
	for i := 0; i < n; i++ {
		if ((polygon[i].Y > p.Y) != (polygon[j].Y > p.Y)) &&
			(p.X < (polygon[j].X-polygon[i].X)*(p.Y-polygon[i].Y)/(polygon[j].Y-polygon[i].Y)+polygon[i].X) {
			inside = !inside
		}
		j = i
	}
	return inside
}
