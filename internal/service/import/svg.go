package importservice

import (
	"fmt"
	"math"
	"strings"

	"github.com/rustyoz/svg"
)

// SVGResult contains SVG parsing results
type SVGResult struct {
	Primitives []Primitive `json:"primitives"`
	Bounds     *Bounds     `json:"bounds,omitempty"`
	Stats      ParseStats  `json:"stats"`
	Width      string      `json:"width,omitempty"`
	Height     string      `json:"height,omitempty"`
	ViewBox    []float64   `json:"viewBox,omitempty"`
}

// ParseSVG parses SVG content and returns primitives
func ParseSVG(content string, scale float64) (*SVGResult, error) {
	if scale <= 0 {
		scale = 1.0
	}

	parsed, err := svg.ParseSvg(content, "input", scale)
	if err != nil {
		return nil, fmt.Errorf("failed to parse SVG: %w", err)
	}

	result := &SVGResult{
		Primitives: make([]Primitive, 0),
		Stats:      ParseStats{ByType: make(map[string]int)},
		Width:      parsed.Width,
		Height:     parsed.Height,
	}

	// Parse viewBox
	if vb, err := parsed.ViewBoxValues(); err == nil && len(vb) >= 4 {
		result.ViewBox = vb
	}

	bounds := &Bounds{
		MinX: math.MaxFloat64, MinY: math.MaxFloat64,
		MaxX: -math.MaxFloat64, MaxY: -math.MaxFloat64,
	}

	// Get drawing instructions
	instructions, errors := parsed.ParseDrawingInstructions()
	idx := 0

	// Collect errors in background
	go func() {
		for range errors {
			// Ignore parsing errors for now
		}
	}()

	// Process instructions into primitives
	var currentPath []Point
	var lastPoint Point

	for inst := range instructions {
		switch inst.Kind {
		case svg.MoveInstruction:
			// Flush current path if any
			if len(currentPath) > 1 {
				idx++
				prim := createPolylinePrimitive(currentPath, false, idx)
				result.Primitives = append(result.Primitives, prim)
				result.Stats.ByType["polyline"]++
				updateBoundsFromPoints(bounds, currentPath)
			}
			currentPath = nil
			if inst.M != nil {
				lastPoint = Point{X: inst.M[0], Y: inst.M[1]}
				currentPath = append(currentPath, lastPoint)
			}

		case svg.LineInstruction:
			if inst.M != nil {
				lastPoint = Point{X: inst.M[0], Y: inst.M[1]}
				currentPath = append(currentPath, lastPoint)
			}

		case svg.CurveInstruction:
			if inst.CurvePoints != nil && inst.CurvePoints.T != nil {
				// Flatten bezier curve to line segments
				curvePoints := flattenBezier(lastPoint, inst.CurvePoints, 0.5)
				currentPath = append(currentPath, curvePoints...)
				if len(curvePoints) > 0 {
					lastPoint = curvePoints[len(curvePoints)-1]
				}
			}

		case svg.CircleInstruction:
			if inst.M != nil && inst.Radius != nil {
				idx++
				prim := Primitive{
					Type:    "circle",
					ID:      fmt.Sprintf("svg_%d", idx),
					CenterX: inst.M[0],
					CenterY: inst.M[1],
					Radius:  *inst.Radius,
				}
				result.Primitives = append(result.Primitives, prim)
				result.Stats.ByType["circle"]++
				updateBoundsFromCircle(bounds, prim)
			}

		case svg.CloseInstruction:
			if len(currentPath) > 2 {
				// Close the path
				currentPath = append(currentPath, currentPath[0])
				idx++
				prim := createPolylinePrimitive(currentPath, true, idx)
				result.Primitives = append(result.Primitives, prim)
				result.Stats.ByType["polyline"]++
				updateBoundsFromPoints(bounds, currentPath)
			}
			currentPath = nil
		}
	}

	// Flush any remaining path
	if len(currentPath) > 1 {
		idx++
		prim := createPolylinePrimitive(currentPath, false, idx)
		result.Primitives = append(result.Primitives, prim)
		result.Stats.ByType["polyline"]++
		updateBoundsFromPoints(bounds, currentPath)
	}

	result.Stats.EntityCount = len(result.Primitives)
	result.Stats.LayerCount = 1

	if result.Stats.EntityCount > 0 {
		result.Bounds = bounds
	}

	return result, nil
}

// createPolylinePrimitive creates a polyline primitive from points
func createPolylinePrimitive(points []Point, closed bool, idx int) Primitive {
	return Primitive{
		Type:   "polyline",
		ID:     fmt.Sprintf("svg_%d", idx),
		Points: append([]Point{}, points...), // Copy slice
		Closed: closed,
	}
}

// flattenBezier converts a bezier curve to line segments
func flattenBezier(start Point, cp *svg.CurvePoints, tolerance float64) []Point {
	if cp == nil || cp.T == nil {
		return nil
	}

	end := Point{X: cp.T[0], Y: cp.T[1]}

	// If control points are nil, it's a line
	if cp.C1 == nil && cp.C2 == nil {
		return []Point{end}
	}

	// Cubic or quadratic bezier
	var c1, c2 Point
	if cp.C1 != nil {
		c1 = Point{X: cp.C1[0], Y: cp.C1[1]}
	} else {
		c1 = start
	}
	if cp.C2 != nil {
		c2 = Point{X: cp.C2[0], Y: cp.C2[1]}
	} else {
		c2 = end
	}

	// Flatten using subdivision
	return flattenCubicBezier(start, c1, c2, end, tolerance)
}

// flattenCubicBezier flattens a cubic bezier curve
func flattenCubicBezier(p0, p1, p2, p3 Point, tolerance float64) []Point {
	// Calculate flatness using control point distance from baseline
	d := maxControlPointDist(p0, p1, p2, p3)

	if d < tolerance {
		return []Point{p3}
	}

	// Subdivide
	m01 := midpoint(p0, p1)
	m12 := midpoint(p1, p2)
	m23 := midpoint(p2, p3)
	m012 := midpoint(m01, m12)
	m123 := midpoint(m12, m23)
	m0123 := midpoint(m012, m123)

	left := flattenCubicBezier(p0, m01, m012, m0123, tolerance)
	right := flattenCubicBezier(m0123, m123, m23, p3, tolerance)

	return append(left, right...)
}

// maxControlPointDist calculates max distance of control points from baseline
func maxControlPointDist(p0, p1, p2, p3 Point) float64 {
	d1 := pointToLineDist(p1, p0, p3)
	d2 := pointToLineDist(p2, p0, p3)
	return max(d1, d2)
}

// pointToLineDist calculates perpendicular distance from point to line
func pointToLineDist(p, l0, l1 Point) float64 {
	dx := l1.X - l0.X
	dy := l1.Y - l0.Y
	lenSq := dx*dx + dy*dy
	if lenSq < 1e-10 {
		return distance(p, l0)
	}
	// Perpendicular distance formula
	return math.Abs((dy*p.X - dx*p.Y + l1.X*l0.Y - l1.Y*l0.X) / math.Sqrt(lenSq))
}

// midpoint calculates midpoint between two points
func midpoint(a, b Point) Point {
	return Point{X: (a.X + b.X) / 2, Y: (a.Y + b.Y) / 2}
}

// updateBoundsFromPoints updates bounds from a slice of points
func updateBoundsFromPoints(b *Bounds, points []Point) {
	for _, p := range points {
		b.MinX = min(b.MinX, p.X)
		b.MinY = min(b.MinY, p.Y)
		b.MaxX = max(b.MaxX, p.X)
		b.MaxY = max(b.MaxY, p.Y)
	}
}

// updateBoundsFromCircle updates bounds from a circle primitive
func updateBoundsFromCircle(b *Bounds, c Primitive) {
	b.MinX = min(b.MinX, c.CenterX-c.Radius)
	b.MinY = min(b.MinY, c.CenterY-c.Radius)
	b.MaxX = max(b.MaxX, c.CenterX+c.Radius)
	b.MaxY = max(b.MaxY, c.CenterY+c.Radius)
}

// ValidateSVGContent checks if content looks like valid SVG
func ValidateSVGContent(content string) bool {
	lower := strings.ToLower(content)
	return strings.Contains(lower, "<svg") && strings.Contains(lower, "</svg>")
}
