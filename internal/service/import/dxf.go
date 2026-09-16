package importservice

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/whutwxn/dxf-go/entities"
	"plotter-pen/internal/i18n"
)

// Precision constants for DXF import
const (
	// PointSimplifyTolerance is the tolerance for simplifying polyline/polygon points
	PointSimplifyTolerance = 0.02
	// ArcFitTolerance is the tolerance for fitting arcs to point sequences
	ArcFitTolerance = 0.05
)

// Primitive represents a CAD primitive for JSON output.
// Coordinate fields must remain, even when zero, to preserve geometry.
type Primitive struct {
	Type         string  `json:"type"`
	ID           string  `json:"id,omitempty"`
	Layer        string  `json:"layer,omitempty"`
	StartX       float64 `json:"startX"`
	StartY       float64 `json:"startY"`
	EndX         float64 `json:"endX"`
	EndY         float64 `json:"endY"`
	CenterX      float64 `json:"centerX"`
	CenterY      float64 `json:"centerY"`
	Radius       float64 `json:"radius"`
	StartAngle   float64 `json:"startAngle,omitempty"` // degrees (DXF export)
	EndAngle     float64 `json:"endAngle,omitempty"`   // degrees (DXF export)
	Sweep        float64 `json:"sweep,omitempty"`      // radians (JS-compatible)
	ThroughPoint *Point  `json:"throughPoint,omitempty"`
	Points       []Point `json:"points,omitempty"`
	Closed       bool    `json:"closed,omitempty"`
	Stroke       string  `json:"stroke,omitempty"`

	// Rectangle support (frontend compatibility)
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
	Width  float64 `json:"width,omitempty"`
	Height float64 `json:"height,omitempty"`
}

// Point represents a 2D point.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Bounds represents bounding box.
type Bounds struct {
	MinX float64 `json:"minX"`
	MinY float64 `json:"minY"`
	MaxX float64 `json:"maxX"`
	MaxY float64 `json:"maxY"`
}

// ParseResult contains DXF parsing results.
type ParseResult struct {
	Primitives []Primitive `json:"primitives"`
	Bounds     *Bounds     `json:"bounds,omitempty"`
	Stats      ParseStats  `json:"stats"`
}

// ParseStats contains parsing statistics.
type ParseStats struct {
	EntityCount int            `json:"entityCount"`
	ByType      map[string]int `json:"byType"`
	LayerCount  int            `json:"layerCount"`
	// Skipped counts the DXF entities, by type, that gave no primitive (text, blocks, hatches...).
	Skipped map[string]int `json:"skipped,omitempty"`
}

// ImportOptions configures smart import behavior.
type ImportOptions struct {
	Normalize    bool    `json:"normalize"`
	CenterOrigin bool    `json:"centerOrigin"`
	ScaleFactor  float64 `json:"scaleFactor"`
	ExtractPLC   bool    `json:"extractPLC"`
	FitArcs      bool    `json:"fitArcs"`
	ArcTolerance float64 `json:"arcTolerance"`
}

// SmartImportResult contains enhanced import results.
type SmartImportResult struct {
	Primitives []Primitive `json:"primitives"`
	PLCData    []PLCItem   `json:"plcData,omitempty"`
	Bounds     *Bounds     `json:"bounds"`
	Stats      ParseStats  `json:"stats"`
}

// PLCItem represents PLC-formatted primitive data.
type PLCItem struct {
	Type   string    `json:"type"` // L (line), A (arc), C (circle)
	Coords []float64 `json:"coords"`
	Layer  string    `json:"layer,omitempty"`
}

type dxfImporter struct {
	scaleFactor float64
}

// ParseDXF parses DXF content and returns primitives.
func ParseDXF(content string) (*ParseResult, error) {
	doc, entityTypes, err := readDXF(content)
	if err != nil {
		return nil, i18n.Errorf("failed to parse DXF: %w", err)
	}

	scaleFactor := detectUnitsScale(content)
	importer := &dxfImporter{scaleFactor: scaleFactor}

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

	for _, e := range doc.Entities.Entities {
		entityType, prims := importer.convertEntity(e, &idx)
		if len(prims) > 0 {
			entityTypes[entityType]--
		}
		for i := range prims {
			p := prims[i]
			result.Primitives = append(result.Primitives, p)
			result.Stats.ByType[p.Type]++
			if p.Layer != "" {
				layers[p.Layer] = true
			}
			updateBounds(bounds, &p)
		}
	}

	for entityType, n := range entityTypes {
		if n > 0 {
			if result.Stats.Skipped == nil {
				result.Stats.Skipped = make(map[string]int)
			}
			result.Stats.Skipped[entityType] = n
		}
	}

	result.Stats.EntityCount = len(result.Primitives)
	result.Stats.LayerCount = len(layers)

	if result.Stats.EntityCount > 0 {
		result.Bounds = bounds
	}

	return result, nil
}

// SmartImport performs intelligent DXF import with optimizations.
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

	if opts.ExtractPLC {
		result.PLCData = extractPLCData(result.Primitives)
	}

	return result, nil
}

// convertEntity gives the DXF type of an entity and its primitives, none for the types it does not import.
func (i *dxfImporter) convertEntity(e entities.Entity, idx *int) (string, []Primitive) {
	switch ent := e.(type) {
	case *entities.Line:
		start := i.toModelPoint(ent.Start.X, ent.Start.Y)
		end := i.toModelPoint(ent.End.X, ent.End.Y)
		return "LINE", []Primitive{newLinePrimitive(start, end, layerName(ent.LayerName), nextID(idx))}

	case *entities.Circle:
		center := i.toModelPoint(ent.Center.X, ent.Center.Y)
		prim := Primitive{
			Type:    "circle",
			ID:      nextID(idx),
			Layer:   layerName(ent.LayerName),
			CenterX: center.X,
			CenterY: center.Y,
			Radius:  ent.Radius * i.scaleFactor,
		}
		return "CIRCLE", []Primitive{prim}

	case *entities.Arc:
		cx, cy, r := ent.Center.X, ent.Center.Y, ent.Radius
		startRad := ent.StartAngle * (math.Pi / 180)
		endRad := ent.EndAngle * (math.Pi / 180)
		sweep := endRad - startRad
		if sweep < 0 {
			sweep += math.Pi * 2
		}
		midRad := startRad + sweep/2

		start := i.toModelPoint(cx+r*math.Cos(startRad), cy+r*math.Sin(startRad))
		mid := i.toModelPoint(cx+r*math.Cos(midRad), cy+r*math.Sin(midRad))
		end := i.toModelPoint(cx+r*math.Cos(endRad), cy+r*math.Sin(endRad))

		arc := arcFromThreePoints(start, mid, end)
		if arc == nil {
			center := i.toModelPoint(cx, cy)
			arc = newArcPrimitive(start, end, center, nil)
		}
		arc.ID = nextID(idx)
		arc.Layer = layerName(ent.LayerName)
		return "ARC", []Primitive{*arc}

	case *entities.LWPolyline:
		vertices := make([]polylineVertex, len(ent.Points))
		for k, v := range ent.Points {
			vertices[k] = polylineVertex{Point: i.toModelPoint(v.Point.X, v.Point.Y), bulge: v.Bulge}
		}
		return "LWPOLYLINE", polylinePrimitives(vertices, ent.Closed, layerName(ent.LayerName), idx)

	case *entities.Polyline:
		// meshes are surfaces, not paths
		if ent.Is3dPolygonMesh || ent.IsPolyfaceMesh {
			return "POLYLINE", nil
		}
		vertices := make([]polylineVertex, 0, len(ent.Vertices))
		for _, v := range ent.Vertices {
			// a curve-fit or spline-fit polyline keeps its frame; the path runs through the fitted vertices
			if v.SplineFrameCtrlPoint {
				continue
			}
			vertices = append(vertices, polylineVertex{Point: i.toModelPoint(v.Location.X, v.Location.Y), bulge: v.Bulge})
		}
		return "POLYLINE", polylinePrimitives(vertices, ent.Closed, layerName(ent.LayerName), idx)

	case *entities.Spline:
		return "SPLINE", i.convertSpline(ent, idx)
	}

	return "", nil
}

func (i *dxfImporter) convertSpline(ent *entities.Spline, idx *int) []Primitive {
	degree := ent.Degree
	if degree <= 0 {
		degree = 3
	}

	controls := ent.ControlPoints
	if len(controls) < degree+1 {
		if len(ent.FitPoints) >= degree+1 {
			controls = ent.FitPoints
		} else {
			return nil
		}
	}

	controlPoints := make([][]float64, len(controls))
	for j, p := range controls {
		controlPoints[j] = []float64{p.X, p.Y}
	}

	knots := ent.KnotValues
	minT, maxT := 0.0, 1.0
	if len(knots) > 0 && degree < len(knots) {
		minT = knots[degree]
		maxIndex := len(knots) - 1 - degree
		if maxIndex >= 0 && maxIndex < len(knots) {
			maxT = knots[maxIndex]
		}
	}

	points := make([]Point, 0, 801)
	failed := false
	samples := 800
	for j := 0; j <= samples; j++ {
		t := minT + (float64(j)/float64(samples))*(maxT-minT)
		pt, err := bSpline(t, degree, controlPoints, knots)
		if err != nil {
			failed = true
			break
		}
		points = append(points, i.toModelPoint(pt.X, pt.Y))
	}

	layer := layerName(ent.LayerName)
	if failed {
		fallback := make([]Point, len(controls))
		for j, p := range controls {
			fallback[j] = i.toModelPoint(p.X, p.Y)
		}
		prim := Primitive{Type: "polyline", ID: nextID(idx), Layer: layer, Points: fallback}
		return []Primitive{prim}
	}

	if len(points) < 2 {
		return nil
	}

	if ent.Closed {
		if circle := detectCircle(points); circle != nil {
			prim := Primitive{
				Type:    "circle",
				ID:      nextID(idx),
				Layer:   layer,
				CenterX: circle.Cx,
				CenterY: circle.Cy,
				Radius:  circle.R,
			}
			return []Primitive{prim}
		}

		fitted := fitArcsToPoints(points)
		if len(fitted) > 0 && len(fitted) < len(points)/2 {
			for j := range fitted {
				fitted[j].ID = nextID(idx)
				fitted[j].Layer = layer
			}

			first := fitted[0]
			last := fitted[len(fitted)-1]
			start := primitiveStartPoint(&first)
			end := primitiveEndPoint(&last)
			gap := distance(start, end)
			if gap > 0.1 {
				fitted = append(fitted, newLinePrimitive(end, start, layer, nextID(idx)))
			}
			return fitted
		}

		simplified := simplifyPoints(points, PointSimplifyTolerance)
		prim := Primitive{Type: "polygon", ID: nextID(idx), Layer: layer, Points: simplified, Closed: true}
		return []Primitive{prim}
	}

	simplified := simplifyPoints(points, PointSimplifyTolerance)
	prim := Primitive{Type: "polyline", ID: nextID(idx), Layer: layer, Points: simplified}
	return []Primitive{prim}
}

func (i *dxfImporter) toModelPoint(x, y float64) Point {
	return Point{X: x * i.scaleFactor, Y: y * i.scaleFactor}
}

func nextID(idx *int) string {
	*idx += 1
	return fmt.Sprintf("dxf_%d", *idx)
}

// layerName gives the layer an entity names (group code 8), or layer 0 when it names none.
func layerName(name string) string {
	if name == "" {
		return "0"
	}
	return name
}

// updateBounds updates bounding box with primitive.
func updateBounds(b *Bounds, p *Primitive) {
	switch p.Type {
	case "line":
		b.MinX = min(b.MinX, p.StartX, p.EndX)
		b.MinY = min(b.MinY, p.StartY, p.EndY)
		b.MaxX = max(b.MaxX, p.StartX, p.EndX)
		b.MaxY = max(b.MaxY, p.StartY, p.EndY)
	case "circle":
		b.MinX = min(b.MinX, p.CenterX-p.Radius)
		b.MinY = min(b.MinY, p.CenterY-p.Radius)
		b.MaxX = max(b.MaxX, p.CenterX+p.Radius)
		b.MaxY = max(b.MaxY, p.CenterY+p.Radius)
	case "arc":
		minX, minY, maxX, maxY := arcBounds(p)
		b.MinX = min(b.MinX, minX)
		b.MinY = min(b.MinY, minY)
		b.MaxX = max(b.MaxX, maxX)
		b.MaxY = max(b.MaxY, maxY)
	case "polyline", "polygon":
		for _, pt := range p.Points {
			b.MinX = min(b.MinX, pt.X)
			b.MinY = min(b.MinY, pt.Y)
			b.MaxX = max(b.MaxX, pt.X)
			b.MaxY = max(b.MaxY, pt.Y)
		}
	case "rectangle":
		b.MinX = min(b.MinX, p.X, p.X+p.Width)
		b.MinY = min(b.MinY, p.Y, p.Y+p.Height)
		b.MaxX = max(b.MaxX, p.X, p.X+p.Width)
		b.MaxY = max(b.MaxY, p.Y, p.Y+p.Height)
	}
}

// ValidateContent checks if content looks like valid DXF.
func ValidateContent(content string) bool {
	return strings.Contains(content, "SECTION") &&
		strings.Contains(content, "ENDSEC") &&
		strings.Contains(content, "EOF")
}

// GetLayerNames returns sorted list of layer names.
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

// detectUnitsScale parses DXF content to detect units and returns scale factor to mm.
func detectUnitsScale(content string) float64 {
	idx := strings.Index(content, "$INSUNITS")
	if idx == -1 {
		return 1.0
	}

	sub := content[idx:]
	lines := strings.Split(sub, "\n")
	for i, line := range lines {
		if strings.TrimSpace(line) == "70" && i+1 < len(lines) {
			var units int
			if _, err := fmt.Sscanf(strings.TrimSpace(lines[i+1]), "%d", &units); err == nil {
				switch units {
				case 1:
					return 25.4
				case 2:
					return 304.8
				case 5:
					return 10.0
				case 6:
					return 1000.0
				case 4:
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

func arcBounds(p *Primitive) (float64, float64, float64, float64) {
	start := Point{X: p.StartX, Y: p.StartY}
	end := Point{X: p.EndX, Y: p.EndY}
	center := Point{X: p.CenterX, Y: p.CenterY}

	radius := p.Radius
	if radius == 0 {
		radius = distance(start, center)
	}

	startAngle := math.Atan2(start.Y-center.Y, start.X-center.X)
	endAngle := math.Atan2(end.Y-center.Y, end.X-center.X)
	sweep := p.Sweep
	if sweep == 0 {
		sweep = calcSweep(startAngle, endAngle, center, p.ThroughPoint)
	}

	minX := min(start.X, end.X)
	minY := min(start.Y, end.Y)
	maxX := max(start.X, end.X)
	maxY := max(start.Y, end.Y)

	angles := []float64{0, math.Pi / 2, math.Pi, -math.Pi / 2}
	for _, angle := range angles {
		if angleInArc(angle, startAngle, sweep) {
			x := center.X + radius*math.Cos(angle)
			y := center.Y + radius*math.Sin(angle)
			minX = min(minX, x)
			minY = min(minY, y)
			maxX = max(maxX, x)
			maxY = max(maxY, y)
		}
	}

	return minX, minY, maxX, maxY
}

func angleInArc(angle, startAngle, sweep float64) bool {
	start := normalizeAngle(startAngle)
	end := normalizeAngle(startAngle + sweep)
	angle = normalizeAngle(angle)

	if sweep >= 0 {
		if start <= end {
			return angle >= start && angle <= end
		}
		return angle >= start || angle <= end
	}

	if end <= start {
		return angle <= start && angle >= end
	}
	return angle <= start || angle >= end
}

func normalizeAngle(angle float64) float64 {
	angle = math.Mod(angle, 2*math.Pi)
	if angle < 0 {
		angle += 2 * math.Pi
	}
	return angle
}

func calcSweep(startAngle, endAngle float64, center Point, through *Point) float64 {
	sweep := endAngle - startAngle
	if through != nil {
		throughAngle := math.Atan2(through.Y-center.Y, through.X-center.X)
		normStart := normalizeAngle(startAngle)
		normEnd := normalizeAngle(endAngle)
		normThrough := normalizeAngle(throughAngle)

		throughRel := normalizeAngle(normThrough - normStart)
		endRel := normalizeAngle(normEnd - normStart)

		if throughRel < endRel && throughRel > 0 {
			for sweep < 0 {
				sweep += 2 * math.Pi
			}
			if sweep > 2*math.Pi-1e-6 {
				sweep -= 2 * math.Pi
			}
		} else {
			for sweep > 0 {
				sweep -= 2 * math.Pi
			}
			if sweep < -2*math.Pi+1e-6 {
				sweep += 2 * math.Pi
			}
		}
		return sweep
	}

	if sweep > math.Pi {
		sweep -= 2 * math.Pi
	}
	if sweep < -math.Pi {
		sweep += 2 * math.Pi
	}

	return sweep
}

type circleFit struct {
	Cx float64
	Cy float64
	R  float64
}

func circleFromThreePoints(p1, p2, p3 Point) *circleFit {
	d := 2 * (p1.X*(p2.Y-p3.Y) + p2.X*(p3.Y-p1.Y) + p3.X*(p1.Y-p2.Y))
	if math.Abs(d) < 1e-6 {
		return nil
	}

	p1Sq := p1.X*p1.X + p1.Y*p1.Y
	p2Sq := p2.X*p2.X + p2.Y*p2.Y
	p3Sq := p3.X*p3.X + p3.Y*p3.Y

	cx := (p1Sq*(p2.Y-p3.Y) + p2Sq*(p3.Y-p1.Y) + p3Sq*(p1.Y-p2.Y)) / d
	cy := (p1Sq*(p3.X-p2.X) + p2Sq*(p1.X-p3.X) + p3Sq*(p2.X-p1.X)) / d
	r := math.Sqrt((p1.X-cx)*(p1.X-cx) + (p1.Y-cy)*(p1.Y-cy))

	if !isFinite(r) || r < 1e-6 {
		return nil
	}

	return &circleFit{Cx: cx, Cy: cy, R: r}
}

func arcFromThreePoints(start, through, end Point) *Primitive {
	circle := circleFromThreePoints(start, through, end)
	if circle == nil {
		return nil
	}
	center := Point{X: circle.Cx, Y: circle.Cy}
	return newArcPrimitive(start, end, center, &through)
}

func newLinePrimitive(start, end Point, layer, id string) Primitive {
	return Primitive{
		Type:   "line",
		ID:     id,
		Layer:  layer,
		StartX: start.X,
		StartY: start.Y,
		EndX:   end.X,
		EndY:   end.Y,
	}
}

func newArcPrimitive(start, end, center Point, through *Point) *Primitive {
	radius := distance(start, center)
	startAngle := math.Atan2(start.Y-center.Y, start.X-center.X)
	endAngle := math.Atan2(end.Y-center.Y, end.X-center.X)
	sweep := calcSweep(startAngle, endAngle, center, through)

	return &Primitive{
		Type:         "arc",
		StartX:       start.X,
		StartY:       start.Y,
		EndX:         end.X,
		EndY:         end.Y,
		CenterX:      center.X,
		CenterY:      center.Y,
		Radius:       radius,
		StartAngle:   startAngle * 180 / math.Pi,
		EndAngle:     endAngle * 180 / math.Pi,
		Sweep:        sweep,
		ThroughPoint: through,
	}
}

func primitiveStartPoint(p *Primitive) Point {
	switch p.Type {
	case "circle":
		return Point{X: p.CenterX + p.Radius, Y: p.CenterY}
	case "polygon", "polyline":
		if len(p.Points) > 0 {
			return p.Points[0]
		}
	default:
		return Point{X: p.StartX, Y: p.StartY}
	}
	return Point{}
}

func primitiveEndPoint(p *Primitive) Point {
	switch p.Type {
	case "circle":
		return Point{X: p.CenterX + p.Radius, Y: p.CenterY}
	case "polygon":
		if len(p.Points) > 0 {
			return p.Points[0]
		}
	case "polyline":
		if len(p.Points) > 0 {
			if p.Closed {
				return p.Points[0]
			}
			return p.Points[len(p.Points)-1]
		}
	default:
		return Point{X: p.EndX, Y: p.EndY}
	}
	return Point{}
}

func fitArcsToPoints(points []Point) []Primitive {
	tolerance := ArcFitTolerance
	result := []Primitive{}

	i := 0
	for i < len(points)-1 {
		bestArcEnd := -1
		var bestCircle *circleFit

		if i+2 < len(points) {
			for j := i + 2; j < len(points) && j < i+350; j++ {
				mid := (i + j) / 2
				circle := circleFromThreePoints(points[i], points[mid], points[j])
				if circle == nil || circle.R < 0.005 || circle.R > 1000000 {
					continue
				}

				// Vertices alone prove nothing (any three points are concyclic): the chord
				// midpoints must stay on the circle too, or the arc leaves the drawn path.
				fits := true
				for k := i; k <= j && fits; k++ {
					dist := distance(points[k], Point{X: circle.Cx, Y: circle.Cy})
					fits = math.Abs(dist-circle.R) <= tolerance
					if fits && k < j {
						chordMid := Point{X: (points[k].X + points[k+1].X) / 2, Y: (points[k].Y + points[k+1].Y) / 2}
						fits = math.Abs(distance(chordMid, Point{X: circle.Cx, Y: circle.Cy})-circle.R) <= tolerance
					}
				}

				if fits {
					bestArcEnd = j
					bestCircle = circle
				}
			}
		}

		if bestArcEnd > i+1 && bestCircle != nil {
			midIdx := (i + bestArcEnd) / 2
			through := points[midIdx]
			arc := newArcPrimitive(points[i], points[bestArcEnd], Point{X: bestCircle.Cx, Y: bestCircle.Cy}, &through)
			result = append(result, *arc)
			i = bestArcEnd
			continue
		}

		lineEnd := i + 1
		for j := i + 2; j < len(points) && j < i+120; j++ {
			fits := true
			start := points[i]
			end := points[j]

			for k := i + 1; k < j; k++ {
				dist := pointToSegmentDistance(points[k], start, end)
				if dist > tolerance {
					fits = false
					break
				}
			}

			if fits {
				lineEnd = j
			} else {
				break
			}
		}

		result = append(result, newLinePrimitive(points[i], points[lineEnd], "", ""))
		i = lineEnd
	}

	return result
}

func detectCircle(points []Point) *circleFit {
	if len(points) < 10 {
		return nil
	}

	p1 := points[0]
	p2 := points[len(points)/3]
	p3 := points[len(points)*2/3]

	circle := circleFromThreePoints(p1, p2, p3)
	if circle == nil {
		return nil
	}
	if circle.R < 0.01 || circle.R > 500000 {
		return nil
	}

	tolerance := circle.R * 0.01
	for _, p := range points {
		dist := distance(p, Point{X: circle.Cx, Y: circle.Cy})
		if math.Abs(dist-circle.R) > tolerance {
			return nil
		}
	}

	return circle
}

func simplifyPoints(points []Point, epsilon float64) []Point {
	if len(points) <= 2 {
		return points
	}

	dmax := 0.0
	index := 0
	end := len(points) - 1

	for i := 1; i < end; i++ {
		d := pointToSegmentDistance(points[i], points[0], points[end])
		if d > dmax {
			dmax = d
			index = i
		}
	}

	if dmax > epsilon {
		left := simplifyPoints(points[:index+1], epsilon)
		right := simplifyPoints(points[index:], epsilon)
		return append(left[:len(left)-1], right...)
	}

	return []Point{points[0], points[end]}
}

func pointToSegmentDistance(pt, lineStart, lineEnd Point) float64 {
	dx := lineEnd.X - lineStart.X
	dy := lineEnd.Y - lineStart.Y
	lenSq := dx*dx + dy*dy
	if lenSq < 1e-6 {
		return distance(pt, lineStart)
	}
	t := ((pt.X-lineStart.X)*dx + (pt.Y-lineStart.Y)*dy) / lenSq
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	proj := Point{X: lineStart.X + t*dx, Y: lineStart.Y + t*dy}
	return distance(pt, proj)
}

func isFinite(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

// recalculateStats recalculates statistics after arc fitting.
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
