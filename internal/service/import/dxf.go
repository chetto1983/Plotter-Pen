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
type Primitive struct {
	Type       string  `json:"type"`
	ID         string  `json:"id,omitempty"`
	Layer      string  `json:"layer,omitempty"`
	StartX     float64 `json:"startX,omitempty"`
	StartY     float64 `json:"startY,omitempty"`
	EndX       float64 `json:"endX,omitempty"`
	EndY       float64 `json:"endY,omitempty"`
	CenterX    float64 `json:"centerX,omitempty"`
	CenterY    float64 `json:"centerY,omitempty"`
	Radius     float64 `json:"radius,omitempty"`
	StartAngle float64 `json:"startAngle,omitempty"`
	EndAngle   float64 `json:"endAngle,omitempty"`
	Points     []Point `json:"points,omitempty"`
	Closed     bool    `json:"closed,omitempty"`
	Stroke     string  `json:"stroke,omitempty"`
}

// Point represents a 2D point
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
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
		prims := extractEntity(e, &idx)
		for _, p := range prims {
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
func extractEntity(e entity.Entity, idx *int) []Primitive {
	var prims []Primitive

	switch ent := e.(type) {
	case *entity.Line:
		*idx++
		prims = append(prims, Primitive{
			Type: "line", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			StartX: ent.Start[0], StartY: ent.Start[1],
			EndX: ent.End[0], EndY: ent.End[1],
		})

	case *entity.Circle:
		*idx++
		prims = append(prims, Primitive{
			Type: "circle", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			CenterX: ent.Center[0], CenterY: ent.Center[1], Radius: ent.Radius,
		})

	case *entity.Arc:
		*idx++
		prims = append(prims, Primitive{
			Type: "arc", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			CenterX: ent.Center[0], CenterY: ent.Center[1], Radius: ent.Radius,
			StartAngle: ent.Angle[0], EndAngle: ent.Angle[1],
		})

	case *entity.LwPolyline:
		*idx++
		points := make([]Point, len(ent.Vertices))
		for i, v := range ent.Vertices {
			points[i] = Point{X: v[0], Y: v[1]}
		}
		prims = append(prims, Primitive{
			Type: "polyline", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			Points: points, Closed: ent.Closed,
		})

	case *entity.Polyline:
		*idx++
		points := make([]Point, len(ent.Vertices))
		for i, v := range ent.Vertices {
			points[i] = Point{X: v.Coord[0], Y: v.Coord[1]}
		}
		closed := (ent.Flag & 1) != 0
		prims = append(prims, Primitive{
			Type: "polyline", ID: fmt.Sprintf("dxf_%d", *idx), Layer: ent.Layer().Name(),
			Points: points, Closed: closed,
		})
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
