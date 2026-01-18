package importservice

import (
	"bytes"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/yofu/dxf"
	"github.com/yofu/dxf/drawing"
	"github.com/yofu/dxf/entity"
)

// Primitive represents a CAD primitive for JSON output
// Note: Coordinate fields must NOT use omitempty - 0.0 is a valid coordinate!
type Primitive struct {
	Type                string  `json:"type"`
	ID                  string  `json:"id,omitempty"`
	Layer               string  `json:"layer,omitempty"`
	StartX              float64 `json:"startX"`
	StartY              float64 `json:"startY"`
	EndX                float64 `json:"endX"`
	EndY                float64 `json:"endY"`
	CenterX             float64 `json:"centerX"`
	CenterY             float64 `json:"centerY"`
	Radius              float64 `json:"radius"`
	StartAngle          float64 `json:"startAngle"`
	EndAngle            float64 `json:"endAngle"`
	ThroughX            float64 `json:"throughX,omitempty"` // For arc direction in Arc.js
	ThroughY            float64 `json:"throughY,omitempty"` // For arc direction in Arc.js
	Points              []Point `json:"points,omitempty"`
	Closed              bool    `json:"closed,omitempty"`
	Stroke              string  `json:"stroke,omitempty"`
	ScaledDuringExtract bool    `json:"-"` // Internal flag, not serialized
}

// Point represents a 2D point with optimized JSON output
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// round2 rounds to 2 decimal places (0.01mm precision - sufficient for CAD)
// Reduces JSON size significantly: 123.45678901234567 -> 123.46
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// newPoint creates a point with rounded coordinates
func newPoint(x, y float64) Point {
	return Point{X: round2(x), Y: round2(y)}
}

// Bounds represents bounding box
type Bounds struct {
	MinX float64 `json:"minX"`
	MinY float64 `json:"minY"`
	MaxX float64 `json:"maxX"`
	MaxY float64 `json:"maxY"`
}

// ParseResult contains DXF parsing results
type ParseResult struct {
	Primitives []Primitive `json:"primitives"`
	Bounds     *Bounds     `json:"bounds,omitempty"`
	Stats      ParseStats  `json:"stats"`
}

// ParseStats contains parsing statistics
type ParseStats struct {
	EntityCount int            `json:"entityCount"`
	ByType      map[string]int `json:"byType"`
	LayerCount  int            `json:"layerCount"`
}

// ImportOptions configures smart import behavior
type ImportOptions struct {
	Normalize    bool    `json:"normalize"`
	CenterOrigin bool    `json:"centerOrigin"`
	ScaleFactor  float64 `json:"scaleFactor"`
	ExtractPLC   bool    `json:"extractPLC"`
	FitArcs      bool    `json:"fitArcs"`      // Convert polyline arcs to arc primitives
	ArcTolerance float64 `json:"arcTolerance"` // Max deviation for arc fitting (mm)
}

// SmartImportResult contains enhanced import results
type SmartImportResult struct {
	Primitives []Primitive `json:"primitives"`
	PLCData    []PLCItem   `json:"plcData,omitempty"`
	Bounds     *Bounds     `json:"bounds"`
	Stats      ParseStats  `json:"stats"`
}

// PLCItem represents PLC-formatted primitive data
type PLCItem struct {
	Type   string    `json:"type"` // L (line), A (arc), C (circle)
	Coords []float64 `json:"coords"`
	Layer  string    `json:"layer,omitempty"`
}

// ParseDXF parses DXF content and returns primitives
func ParseDXF(content string) (*ParseResult, error) {
	d, err := dxf.FromStringData(content)
	if err != nil {
		return nil, fmt.Errorf("failed to parse DXF: %w", err)
	}

	// Detect units and get scale factor to convert to mm
	scaleFactor := detectUnitsScale(content)

	result := &ParseResult{
		Primitives: make([]Primitive, 0),
		Stats:      ParseStats{ByType: make(map[string]int)},
	}

	bounds := &Bounds{
		MinX: math.MaxFloat64, MinY: math.MaxFloat64,
		MaxX: -math.MaxFloat64, MaxY: -math.MaxFloat64,
	}

	layers := make(map[string]bool)
	idx := 0

	for _, e := range d.Entities() {
		prims := extractEntity(e, &idx, scaleFactor)
		for _, p := range prims {
			// Apply unit conversion (except polylines from splines - already scaled)
			if scaleFactor != 1.0 && !p.ScaledDuringExtract {
				scalePrimitiveInPlace(&p, scaleFactor)
			}
			result.Primitives = append(result.Primitives, p)
			result.Stats.ByType[p.Type]++
			layers[p.Layer] = true
			updateBounds(bounds, &p)
		}
	}

	result.Stats.EntityCount = len(result.Primitives)
	result.Stats.LayerCount = len(layers)

	if result.Stats.EntityCount > 0 {
		result.Bounds = bounds
	}

	return result, nil
}

// SmartImport performs intelligent DXF import with optimizations
func SmartImport(content string, opts ImportOptions) (*SmartImportResult, error) {
	parseResult, err := ParseDXF(content)
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

	result.Primitives = optimizePathOrder(result.Primitives)

	// Arc fitting: convert polyline segments to arcs
	if opts.FitArcs {
		tolerance := opts.ArcTolerance
		if tolerance <= 0 {
			tolerance = 0.1 // Default 0.1mm tolerance
		}
		result.Primitives = applyArcFitting(result.Primitives, tolerance)
		result.Stats = recalculateStats(result.Primitives)
	}

	if opts.ExtractPLC {
		result.PLCData = extractPLCData(result.Primitives)
	}

	return result, nil
}

// ExportDXF exports primitives to DXF format
func ExportDXF(primitives []Primitive, version string) (string, error) {
	d := dxf.NewDrawing()

	layers := make(map[string]bool)
	for _, p := range primitives {
		if p.Layer != "" {
			layers[p.Layer] = true
		}
	}

	for layer := range layers {
		d.AddLayer(layer, dxf.DefaultColor, dxf.DefaultLineType, true)
	}

	for _, p := range primitives {
		if p.Layer != "" {
			d.ChangeLayer(p.Layer)
		}
		addPrimitiveToDrawing(d, p)
	}

	var buf bytes.Buffer
	if _, err := d.WriteTo(&buf); err != nil {
		return "", fmt.Errorf("failed to write DXF: %w", err)
	}

	return buf.String(), nil
}

// addPrimitiveToDrawing adds a primitive to DXF drawing
func addPrimitiveToDrawing(d *drawing.Drawing, p Primitive) {
	switch p.Type {
	case "line":
		d.Line(p.StartX, p.StartY, 0, p.EndX, p.EndY, 0)
	case "circle":
		d.Circle(p.CenterX, p.CenterY, 0, p.Radius)
	case "arc":
		d.Arc(p.CenterX, p.CenterY, 0, p.Radius, p.StartAngle, p.EndAngle)
	case "polyline":
		addPolylineToDrawing(d, p)
	}
}

// addPolylineToDrawing adds polyline as connected lines
func addPolylineToDrawing(d *drawing.Drawing, p Primitive) {
	if len(p.Points) < 2 {
		return
	}
	for i := 0; i < len(p.Points)-1; i++ {
		d.Line(p.Points[i].X, p.Points[i].Y, 0, p.Points[i+1].X, p.Points[i+1].Y, 0)
	}
	if p.Closed && len(p.Points) > 2 {
		last := len(p.Points) - 1
		d.Line(p.Points[last].X, p.Points[last].Y, 0, p.Points[0].X, p.Points[0].Y, 0)
	}
}

// extractEntity converts DXF entity to primitives
func extractEntity(e entity.Entity, idx *int, scaleFactor float64) []Primitive {
	var prims []Primitive

	switch ent := e.(type) {
	case *entity.Line:
		*idx++
		prims = append(prims, Primitive{
			Type: "line", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			StartX: round2(ent.Start[0]), StartY: round2(ent.Start[1]),
			EndX: round2(ent.End[0]), EndY: round2(ent.End[1]),
		})

	case *entity.Circle:
		*idx++
		prims = append(prims, Primitive{
			Type: "circle", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			CenterX: round2(ent.Center[0]), CenterY: round2(ent.Center[1]), Radius: round2(ent.Radius),
		})

	case *entity.Arc:
		*idx++
		// Calculate start and end points from center, radius, and angles
		cx, cy, r := ent.Center[0], ent.Center[1], ent.Radius
		startAngle, endAngle := ent.Angle[0], ent.Angle[1]
		startX := cx + r*math.Cos(startAngle*math.Pi/180)
		startY := cy + r*math.Sin(startAngle*math.Pi/180)
		endX := cx + r*math.Cos(endAngle*math.Pi/180)
		endY := cy + r*math.Sin(endAngle*math.Pi/180)

		prims = append(prims, Primitive{
			Type: "arc", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			StartX: round2(startX), StartY: round2(startY),
			EndX: round2(endX), EndY: round2(endY),
			CenterX: round2(cx), CenterY: round2(cy),
			Radius: round2(r),
			StartAngle: round2(startAngle), EndAngle: round2(endAngle),
		})

	case *entity.LwPolyline:
		*idx++
		points := make([]Point, len(ent.Vertices))
		for i, v := range ent.Vertices {
			points[i] = newPoint(v[0], v[1])
		}
		prims = append(prims, Primitive{
			Type: "polyline", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			Points: points, Closed: ent.Closed,
		})

	case *entity.Polyline:
		*idx++
		points := make([]Point, len(ent.Vertices))
		for i, v := range ent.Vertices {
			points[i] = newPoint(v.Coord[0], v.Coord[1])
		}
		closed := (ent.Flag & 1) != 0
		prims = append(prims, Primitive{
			Type: "polyline", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			Points: points, Closed: closed,
		})

	case *entity.Spline:
		*idx++
		// Tessellate B-spline curve using proven De Boor algorithm
		var points []Point
		if len(ent.Controls) >= 2 {
			numSamples := calculateSplineSamplesWithScale(ent.Controls, scaleFactor)
			rawPoints := evaluateBSpline(ent.Controls, ent.Knots, ent.Degree, numSamples)

			// Scale and round points to mm with 0.01mm precision
			points = make([]Point, len(rawPoints))
			for i, p := range rawPoints {
				points[i] = newPoint(p.X*scaleFactor, p.Y*scaleFactor)
			}
		} else if len(ent.Fits) >= 2 {
			// Fallback: use fit points if control points unavailable
			points = make([]Point, len(ent.Fits))
			for i, f := range ent.Fits {
				points[i] = newPoint(f[0]*scaleFactor, f[1]*scaleFactor)
			}
		}

		if len(points) >= 2 {
			closed := (ent.Flag & 1) != 0
			prims = append(prims, Primitive{
				Type:                "polyline",
				ID:                  fmt.Sprintf("dxf_%d", *idx),
				Layer:               ent.Layer().Name(),
				Points:              points,
				Closed:              closed,
				ScaledDuringExtract: true, // Already scaled during tessellation
			})
		}
	}

	return prims
}

// updateBounds updates bounding box with primitive
func updateBounds(b *Bounds, p *Primitive) {
	switch p.Type {
	case "line":
		b.MinX = min(b.MinX, p.StartX, p.EndX)
		b.MinY = min(b.MinY, p.StartY, p.EndY)
		b.MaxX = max(b.MaxX, p.StartX, p.EndX)
		b.MaxY = max(b.MaxY, p.StartY, p.EndY)
	case "circle", "arc":
		b.MinX = min(b.MinX, p.CenterX-p.Radius)
		b.MinY = min(b.MinY, p.CenterY-p.Radius)
		b.MaxX = max(b.MaxX, p.CenterX+p.Radius)
		b.MaxY = max(b.MaxY, p.CenterY+p.Radius)
	case "polyline":
		for _, pt := range p.Points {
			b.MinX = min(b.MinX, pt.X)
			b.MinY = min(b.MinY, pt.Y)
			b.MaxX = max(b.MaxX, pt.X)
			b.MaxY = max(b.MaxY, pt.Y)
		}
	}
}

// ValidateContent checks if content looks like valid DXF
func ValidateContent(content string) bool {
	return strings.Contains(content, "SECTION") &&
		strings.Contains(content, "ENDSEC") &&
		strings.Contains(content, "EOF")
}

// GetLayerNames returns sorted list of layer names
func GetLayerNames(prims []Primitive) []string {
	layers := make(map[string]bool)
	for _, p := range prims {
		layer := p.Layer
		if layer == "" {
			layer = "0"
		}
		layers[layer] = true
	}
	names := make([]string, 0, len(layers))
	for name := range layers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// GetSupportedFormats returns supported DXF versions
func GetSupportedFormats() []string {
	return []string{"AC2000"}
}

// detectUnitsScale parses DXF content to detect units and returns scale factor to mm
func detectUnitsScale(content string) float64 {
	// Look for $INSUNITS in the header
	// $INSUNITS values: 0=Unitless, 1=Inches, 2=Feet, 3=Miles, 4=Millimeters, 5=Centimeters, 6=Meters
	idx := strings.Index(content, "$INSUNITS")
	if idx == -1 {
		return 1.0 // Default: assume mm
	}

	// Find the 70 code value after $INSUNITS
	sub := content[idx:]
	lines := strings.Split(sub, "\n")
	for i, line := range lines {
		if strings.TrimSpace(line) == "70" && i+1 < len(lines) {
			var units int
			if _, err := fmt.Sscanf(strings.TrimSpace(lines[i+1]), "%d", &units); err == nil {
				switch units {
				case 1: // Inches
					return 25.4
				case 2: // Feet
					return 304.8
				case 5: // Centimeters
					return 10.0
				case 6: // Meters
					return 1000.0
				case 4: // Millimeters
					return 1.0
				default:
					return 1.0
				}
			}
			break
		}
	}
	return 1.0
}

// scalePrimitiveInPlace scales a primitive's coordinates in place with rounding
func scalePrimitiveInPlace(p *Primitive, factor float64) {
	switch p.Type {
	case "line":
		p.StartX = round2(p.StartX * factor)
		p.StartY = round2(p.StartY * factor)
		p.EndX = round2(p.EndX * factor)
		p.EndY = round2(p.EndY * factor)
	case "circle", "arc":
		p.CenterX = round2(p.CenterX * factor)
		p.CenterY = round2(p.CenterY * factor)
		p.Radius = round2(p.Radius * factor)
	case "polyline":
		for i := range p.Points {
			p.Points[i].X = round2(p.Points[i].X * factor)
			p.Points[i].Y = round2(p.Points[i].Y * factor)
		}
	}
}

// applyArcFitting replaces polylines with fitted arcs using RANSAC + Taubin
func applyArcFitting(primitives []Primitive, tolerance float64) []Primitive {
	result := make([]Primitive, 0, len(primitives))

	for _, prim := range primitives {
		if prim.Type == "polyline" && len(prim.Points) >= 3 {
			// Apply arc fitting to ALL polylines (coarse tessellation ensures proper detection)
			fitted := FitPolylineToArcs(prim.Points, tolerance)

			if len(fitted) > 0 {
				for _, f := range fitted {
					f.Layer = prim.Layer
					result = append(result, f)
				}
			} else {
				result = append(result, prim)
			}
		} else {
			result = append(result, prim)
		}
	}

	return result
}

// recalculateStats recalculates statistics after arc fitting
func recalculateStats(primitives []Primitive) ParseStats {
	stats := ParseStats{
		EntityCount: len(primitives),
		ByType:      make(map[string]int),
	}

	layers := make(map[string]bool)
	for _, p := range primitives {
		stats.ByType[p.Type]++
		if p.Layer != "" {
			layers[p.Layer] = true
		}
	}
	stats.LayerCount = len(layers)

	return stats
}
