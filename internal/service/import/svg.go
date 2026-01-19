package importservice

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
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

// parseSVGDimension parses an SVG dimension string and converts to mm
// Supported units: px, pt, mm, cm, in, pc (pica), em (treated as px)
// Default unit is px if no unit specified
func parseSVGDimension(dim string) float64 {
	if dim == "" {
		return 0
	}

	// Regex to extract number and unit
	re := regexp.MustCompile(`^([+-]?[0-9]*\.?[0-9]+)\s*(px|pt|mm|cm|in|pc|em|%)?$`)
	matches := re.FindStringSubmatch(strings.TrimSpace(dim))

	if len(matches) < 2 {
		return 0
	}

	value, err := strconv.ParseFloat(matches[1], 64)
	if err != nil {
		return 0
	}

	unit := "px"
	if len(matches) >= 3 && matches[2] != "" {
		unit = matches[2]
	}

	// Convert to mm (assuming 96 DPI for screen)
	// 1 inch = 25.4 mm
	// 1 px = 1/96 inch at 96 DPI
	// 1 pt = 1/72 inch
	// 1 pc = 12 pt = 1/6 inch
	switch unit {
	case "mm":
		return value
	case "cm":
		return value * 10
	case "in":
		return value * 25.4
	case "pt":
		return value * 25.4 / 72
	case "pc":
		return value * 25.4 / 6
	case "px", "em":
		// Default: 96 DPI
		return value * 25.4 / 96
	case "%":
		// Can't handle percentage without context, return as-is
		return value
	default:
		// Assume px
		return value * 25.4 / 96
	}
}

// ParseSVG parses SVG content and returns primitives
// Coordinates are converted to mm and Y-axis is flipped (SVG Y-down to CAD Y-up)
func ParseSVG(content string, scale float64) (*SVGResult, error) {
	if scale <= 0 {
		scale = 1.0
	}

	parsed, err := svg.ParseSvg(content, "input", 1.0) // Parse at 1:1 scale, we'll handle unit conversion
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
	var viewBox []float64
	if vb, err := parsed.ViewBoxValues(); err == nil && len(vb) >= 4 {
		viewBox = vb
		result.ViewBox = vb
	}

	// Determine SVG height for Y-axis flipping
	// Priority: viewBox height > height attribute
	var svgHeight float64
	if len(viewBox) >= 4 {
		svgHeight = viewBox[3] // viewBox: minX, minY, width, height
	} else if parsed.Height != "" {
		svgHeight = parseSVGDimension(parsed.Height)
	}

	// Determine unit conversion factor to mm
	// If viewBox exists, coordinates are in viewBox units
	// Map viewBox to actual dimensions (width/height attributes)
	var unitScale float64 = 1.0
	if len(viewBox) >= 4 && viewBox[2] > 0 {
		// viewBox exists - calculate scale from viewBox to mm
		actualWidth := parseSVGDimension(parsed.Width)
		if actualWidth > 0 {
			unitScale = actualWidth / viewBox[2]
		} else {
			// No width attribute, assume viewBox units are in px
			unitScale = 25.4 / 96
		}
	} else if parsed.Width != "" {
		// No viewBox, use width attribute units directly
		unitScale = 25.4 / 96 // Assume px by default
	}

	// Apply user scale
	unitScale *= scale

	bounds := &Bounds{
		MinX: math.MaxFloat64, MinY: math.MaxFloat64,
		MaxX: -math.MaxFloat64, MaxY: -math.MaxFloat64,
	}

	// Helper to transform coordinates: apply unit scale and flip Y-axis
	transformX := func(x float64) float64 {
		return x * unitScale
	}
	transformY := func(y float64) float64 {
		// Flip Y-axis: SVG Y-down to CAD Y-up
		if svgHeight > 0 {
			return (svgHeight - y) * unitScale
		}
		return y * unitScale
	}
	transformPoint := func(x, y float64) Point {
		return Point{X: transformX(x), Y: transformY(y)}
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

	// Helper: flush path with arc fitting (same as DXF spline handling)
	flushPathWithArcFitting := func(path []Point) {
		if len(path) < 2 {
			return
		}
		updateBoundsFromPoints(bounds, path)
		// Use arc fitting like DXF does for splines
		fitted := fitArcsToPoints(path)
		for _, prim := range fitted {
			idx++
			prim.ID = fmt.Sprintf("svg_%d", idx)
			result.Primitives = append(result.Primitives, prim)
			result.Stats.ByType[prim.Type]++
		}
	}

	// Process instructions into primitives
	var currentPath []Point
	var lastPoint Point
	var lastPointRaw Point // Raw coordinates for bezier calculations

	for inst := range instructions {
		switch inst.Kind {
		case svg.MoveInstruction:
			// Flush current path with arc fitting
			flushPathWithArcFitting(currentPath)
			currentPath = nil
			if inst.M != nil {
				lastPointRaw = Point{X: inst.M[0], Y: inst.M[1]}
				lastPoint = transformPoint(inst.M[0], inst.M[1])
				currentPath = append(currentPath, lastPoint)
			}

		case svg.LineInstruction:
			if inst.M != nil {
				lastPointRaw = Point{X: inst.M[0], Y: inst.M[1]}
				lastPoint = transformPoint(inst.M[0], inst.M[1])
				currentPath = append(currentPath, lastPoint)
			}

		case svg.CurveInstruction:
			if inst.CurvePoints != nil && inst.CurvePoints.T != nil {
				// Flatten bezier curve to line segments (in raw coordinates)
				curvePoints := flattenBezier(lastPointRaw, inst.CurvePoints, 0.5)
				// Transform each point
				for _, p := range curvePoints {
					transformed := transformPoint(p.X, p.Y)
					currentPath = append(currentPath, transformed)
					lastPoint = transformed
				}
				if len(curvePoints) > 0 {
					lastPointRaw = curvePoints[len(curvePoints)-1]
				}
			}

		case svg.CircleInstruction:
			if inst.M != nil && inst.Radius != nil {
				idx++
				prim := Primitive{
					Type:    "circle",
					ID:      fmt.Sprintf("svg_%d", idx),
					CenterX: transformX(inst.M[0]),
					CenterY: transformY(inst.M[1]),
					Radius:  *inst.Radius * unitScale,
				}
				result.Primitives = append(result.Primitives, prim)
				result.Stats.ByType["circle"]++
				updateBoundsFromCircle(bounds, prim)
			}

		case svg.CloseInstruction:
			if len(currentPath) > 2 {
				// Close the path and apply arc fitting
				currentPath = append(currentPath, currentPath[0])
				flushPathWithArcFitting(currentPath)
			}
			currentPath = nil
		}
	}

	// Flush any remaining path with arc fitting
	flushPathWithArcFitting(currentPath)

	result.Stats.EntityCount = len(result.Primitives)
	result.Stats.LayerCount = 1

	if result.Stats.EntityCount > 0 {
		result.Bounds = bounds
	}

	return result, nil
}

// createPolylinePrimitive creates a polyline primitive from points
func createPolylinePrimitive(points []Point, closed bool, idx int) Primitive {
	primType := "polyline"
	if closed {
		primType = "polygon"
	}
	return Primitive{
		Type:   primType,
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

// SmartImportSVG performs intelligent SVG import with optimizations (same as DXF smart import)
func SmartImportSVG(content string, opts ImportOptions) (*SmartImportResult, error) {
	parseResult, err := ParseSVG(content, 1.0)
	if err != nil {
		return nil, err
	}

	result := &SmartImportResult{
		Primitives: parseResult.Primitives,
		Bounds:     parseResult.Bounds,
		Stats:      parseResult.Stats,
	}

	if result.Bounds == nil {
		return result, nil
	}

	if opts.CenterOrigin {
		centerPrimitives(result.Primitives, result.Bounds)
		result.Bounds = recalculateBounds(result.Primitives)
	}

	if opts.ScaleFactor != 0 && opts.ScaleFactor != 1 {
		scalePrimitives(result.Primitives, opts.ScaleFactor)
		result.Bounds = recalculateBounds(result.Primitives)
	}

	if opts.Normalize {
		normalizePrimitives(result.Primitives, result.Bounds)
		result.Bounds = recalculateBounds(result.Primitives)
	}

	if opts.ExtractPLC {
		result.PLCData = extractPLCData(result.Primitives)
	}

	return result, nil
}
