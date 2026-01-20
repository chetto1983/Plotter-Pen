package importservice

import (
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
)

const (
	svgCurveSamples   = 20
	svgArcStepRadians = math.Pi / 8
	svgArcMinSteps    = 4
	svgPxPerInch      = 96.0
	svgMmPerInch      = 25.4
)

// svgSimplifyEpsilon uses shared constant from dxf.go for consistency
var svgSimplifyEpsilon = PointSimplifyTolerance

type svgParseOptions struct {
	simplifyEpsilon float64
}

// SVGImportOptions configures SVG import behavior.
type SVGImportOptions struct {
	ImportOptions
	FlipY bool `json:"flipY"`
}

// ValidateSVGContent checks if content looks like valid SVG.
func ValidateSVGContent(content string) bool {
	head := content
	if len(head) > 4096 {
		head = head[:4096]
	}
	return strings.Contains(strings.ToLower(head), "<svg")
}

// ParseSVG parses SVG content and returns primitives.
func ParseSVG(content string) (*ParseResult, error) {
	return parseSVGContent(content, svgParseOptions{simplifyEpsilon: svgSimplifyEpsilon})
}

// SmartImportSVG performs SVG import with transformations similar to DXF.
func SmartImportSVG(content string, opts SVGImportOptions) (*SmartImportResult, error) {
	parseOpts := svgParseOptions{simplifyEpsilon: svgSimplifyEpsilon}
	if opts.FitArcs {
		parseOpts.simplifyEpsilon = 0
	}

	parseResult, err := parseSVGContent(content, parseOpts)
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

	if opts.FlipY {
		flipPrimitivesY(result.Primitives, result.Bounds.MinY+result.Bounds.MaxY)
		result.Bounds = recalculateBounds(result.Primitives)
	}

	if opts.CenterOrigin {
		centerPrimitives(result.Primitives, result.Bounds)
		result.Bounds = recalculateBounds(result.Primitives)
	}

	if opts.ScaleFactor != 0 && opts.ScaleFactor != 1 {
		scalePrimitives(result.Primitives, opts.ScaleFactor)
		result.Bounds = recalculateBounds(result.Primitives)
	}

	if opts.FitArcs {
		result.Primitives = fitSVGPrimitives(result.Primitives)
		result.Bounds = recalculateBounds(result.Primitives)
		result.Stats = recalculateStats(result.Primitives)
	}

	if parseOpts.simplifyEpsilon == 0 && svgSimplifyEpsilon > 0 {
		simplifySVGPrimitives(result.Primitives, svgSimplifyEpsilon)
		result.Bounds = recalculateBounds(result.Primitives)
		result.Stats = recalculateStats(result.Primitives)
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

func fitSVGPrimitives(prims []Primitive) []Primitive {
	if len(prims) == 0 {
		return prims
	}

	out := make([]Primitive, 0, len(prims))
	idx := len(prims)
	for _, prim := range prims {
		if (prim.Type != "polyline" && prim.Type != "polygon") || len(prim.Points) < 2 {
			out = append(out, prim)
			continue
		}

		points := prim.Points
		closed := prim.Type == "polygon" || prim.Closed
		if closed {
			if circle := detectCircle(points); circle != nil {
				out = append(out, Primitive{
					Type:    "circle",
					ID:      nextSVGID(&idx),
					Layer:   prim.Layer,
					CenterX: circle.Cx,
					CenterY: circle.Cy,
					Radius:  circle.R,
				})
				continue
			}
		}

		fitted := fitArcsToPointsSVG(points)
		if len(fitted) == 0 || len(fitted) >= len(points)/2 {
			out = append(out, prim)
			continue
		}

		if closed && len(fitted) > 0 {
			first := fitted[0]
			last := fitted[len(fitted)-1]
			start := primitiveStartPoint(&first)
			end := primitiveEndPoint(&last)
			if distance(start, end) > 0.1 {
				fitted = append(fitted, newLinePrimitive(end, start, prim.Layer, ""))
			}
		}

		for i := range fitted {
			fitted[i].ID = nextSVGID(&idx)
			if prim.Layer != "" {
				fitted[i].Layer = prim.Layer
			}
			out = append(out, fitted[i])
		}
	}

	return out
}

func simplifySVGPrimitives(prims []Primitive, epsilon float64) {
	if epsilon <= 0 {
		return
	}
	for i := range prims {
		switch prims[i].Type {
		case "polyline", "polygon":
			prims[i].Points = simplifyPoints(prims[i].Points, epsilon)
		}
	}
}

func parseSVGContent(content string, opts svgParseOptions) (*ParseResult, error) {
	decoder := xml.NewDecoder(strings.NewReader(content))
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

	for {
		token, err := decoder.Token()
		if err != nil {
			if err == io.EOF {
				return nil, fmt.Errorf("no svg root element found")
			}
			return nil, err
		}
		if start, ok := token.(xml.StartElement); ok && strings.EqualFold(start.Name.Local, "svg") {
			rootTransform := svgRootTransform(start.Attr)
			if err := parseSVGElement(decoder, start, rootTransform, &idx, result, bounds, layers, opts); err != nil {
				return nil, err
			}
			result.Stats.EntityCount = len(result.Primitives)
			result.Stats.LayerCount = len(layers)
			if result.Stats.EntityCount > 0 {
				result.Bounds = bounds
			}
			return result, nil
		}
	}
}

func svgRootTransform(attrs []xml.Attr) svgTransform {
	pxToMm := svgMmPerInch / svgPxPerInch

	minX, minY, vbW, vbH, hasViewBox := parseViewBoxAttr(getAttr(attrs, "viewBox"))
	widthMM, hasW := parseLengthToMM(getAttr(attrs, "width"))
	heightMM, hasH := parseLengthToMM(getAttr(attrs, "height"))

	if hasViewBox && vbW > 0 && vbH > 0 {
		var scale float64
		if hasW && hasH {
			scale = min(widthMM/vbW, heightMM/vbH)
		} else if hasW {
			scale = widthMM / vbW
		} else if hasH {
			scale = heightMM / vbH
		} else {
			// No explicit dimensions - assume viewBox units are mm (1:1 scale)
			// This is common for CAD/plotter SVGs where viewBox = physical dimensions
			scale = 1.0
		}
		return scaleTransform(scale, scale).Multiply(translateTransform(-minX, -minY))
	}

	// No viewBox - use pixel to mm conversion
	return scaleTransform(pxToMm, pxToMm)
}

func parseSVGElement(decoder *xml.Decoder, start xml.StartElement, parentTransform svgTransform, idx *int, result *ParseResult, bounds *Bounds, layers map[string]bool, opts svgParseOptions) error {
	name := strings.ToLower(start.Name.Local)
	elementTransform := parseTransformAttr(getAttr(start.Attr, "transform"))
	transform := parentTransform.Multiply(elementTransform)

	switch name {
	case "svg", "g":
		for {
			token, err := decoder.Token()
			if err != nil {
				return err
			}
			switch tok := token.(type) {
			case xml.StartElement:
				if err := parseSVGElement(decoder, tok, transform, idx, result, bounds, layers, opts); err != nil {
					return err
				}
			case xml.EndElement:
				if strings.EqualFold(tok.Name.Local, start.Name.Local) {
					return nil
				}
			}
		}

	case "path":
		pathData := getAttr(start.Attr, "d")
		segments, err := parsePathData(pathData)
		if err != nil {
			return err
		}
		for _, seg := range segments {
			applyTransformToSegment(&seg, transform)
			prims := segmentToPrimitives(seg, idx, opts.simplifyEpsilon)
			for i := range prims {
				addPrimitive(result, bounds, layers, prims[i])
			}
		}
		return decoder.Skip()

	case "line":
		x1, ok1 := parseFloatAttr(start.Attr, "x1")
		y1, ok2 := parseFloatAttr(start.Attr, "y1")
		x2, ok3 := parseFloatAttr(start.Attr, "x2")
		y2, ok4 := parseFloatAttr(start.Attr, "y2")
		if ok1 && ok2 && ok3 && ok4 {
			p1 := transform.Apply(Point{X: x1, Y: y1})
			p2 := transform.Apply(Point{X: x2, Y: y2})
			prim := newLinePrimitive(p1, p2, "", nextSVGID(idx))
			addPrimitive(result, bounds, layers, prim)
		}
		return decoder.Skip()

	case "rect":
		x, _ := parseFloatAttr(start.Attr, "x")
		y, _ := parseFloatAttr(start.Attr, "y")
		w, okW := parseFloatAttr(start.Attr, "width")
		h, okH := parseFloatAttr(start.Attr, "height")
		if okW && okH {
			prims := rectToPrimitives(x, y, w, h, transform, idx, opts.simplifyEpsilon)
			for i := range prims {
				addPrimitive(result, bounds, layers, prims[i])
			}
		}
		return decoder.Skip()

	case "circle":
		cx, okX := parseFloatAttr(start.Attr, "cx")
		cy, okY := parseFloatAttr(start.Attr, "cy")
		r, okR := parseFloatAttr(start.Attr, "r")
		if okX && okY && okR {
			prims := circleToPrimitives(Point{X: cx, Y: cy}, r, transform, idx, opts.simplifyEpsilon)
			for i := range prims {
				addPrimitive(result, bounds, layers, prims[i])
			}
		}
		return decoder.Skip()

	case "ellipse":
		cx, okX := parseFloatAttr(start.Attr, "cx")
		cy, okY := parseFloatAttr(start.Attr, "cy")
		rx, okRX := parseFloatAttr(start.Attr, "rx")
		ry, okRY := parseFloatAttr(start.Attr, "ry")
		if okX && okY && okRX && okRY {
			prim := ellipseToPrimitive(Point{X: cx, Y: cy}, rx, ry, transform, idx, opts.simplifyEpsilon)
			if prim != nil {
				addPrimitive(result, bounds, layers, *prim)
			}
		}
		return decoder.Skip()

	case "polyline":
		points := parsePointsAttr(getAttr(start.Attr, "points"))
		if len(points) >= 2 {
			applyTransformToPoints(points, transform)
			prim := Primitive{
				Type:   "polyline",
				ID:     nextSVGID(idx),
				Points: svgSimplifyPoints(points, opts.simplifyEpsilon),
				Closed: false,
			}
			addPrimitive(result, bounds, layers, prim)
		}
		return decoder.Skip()

	case "polygon":
		points := parsePointsAttr(getAttr(start.Attr, "points"))
		if len(points) >= 3 {
			applyTransformToPoints(points, transform)
			prim := Primitive{
				Type:   "polygon",
				ID:     nextSVGID(idx),
				Points: svgSimplifyPoints(points, opts.simplifyEpsilon),
				Closed: true,
			}
			addPrimitive(result, bounds, layers, prim)
		}
		return decoder.Skip()

	default:
		return decoder.Skip()
	}
}

func addPrimitive(result *ParseResult, bounds *Bounds, layers map[string]bool, prim Primitive) {
	result.Primitives = append(result.Primitives, prim)
	result.Stats.ByType[prim.Type]++
	if prim.Layer != "" {
		layers[prim.Layer] = true
	}
	updateBounds(bounds, &prim)
}

func svgSimplifyPoints(points []Point, epsilon float64) []Point {
	if epsilon <= 0 {
		return points
	}
	return simplifyPoints(points, epsilon)
}

func parsePointsAttr(value string) []Point {
	nums := parseFloatList(value)
	if len(nums) < 2 {
		return nil
	}
	points := make([]Point, 0, len(nums)/2)
	for i := 0; i+1 < len(nums); i += 2 {
		points = append(points, Point{X: nums[i], Y: nums[i+1]})
	}
	return points
}

func parseFloatAttr(attrs []xml.Attr, name string) (float64, bool) {
	value := getAttr(attrs, name)
	if value == "" {
		return 0, false
	}
	num, ok := parseFirstNumber(value)
	return num, ok
}

func parseViewBoxAttr(value string) (float64, float64, float64, float64, bool) {
	values := parseFloatList(value)
	if len(values) < 4 {
		return 0, 0, 0, 0, false
	}
	return values[0], values[1], values[2], values[3], true
}

func parseLengthToMM(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	num, next, ok := scanNumber(value, 0)
	if !ok {
		return 0, false
	}
	unit := strings.ToLower(strings.TrimSpace(value[next:]))
	if strings.Contains(unit, "%") {
		return 0, false
	}

	pxToMm := svgMmPerInch / svgPxPerInch
	switch unit {
	case "", "px":
		return num * pxToMm, true
	case "mm":
		return num, true
	case "cm":
		return num * 10, true
	case "in":
		return num * svgMmPerInch, true
	case "pt":
		return num * (svgMmPerInch / 72), true
	case "pc":
		return num * (svgMmPerInch / 6), true
	case "q":
		return num * 0.25, true
	default:
		return num * pxToMm, true
	}
}

func parseFirstNumber(value string) (float64, bool) {
	for i := 0; i < len(value); i++ {
		if isNumberStart(value[i]) {
			num, _, ok := scanNumber(value, i)
			return num, ok
		}
	}
	return 0, false
}

func parseFloatList(value string) []float64 {
	var nums []float64
	i := 0
	for i < len(value) {
		if isSeparator(value[i]) {
			i++
			continue
		}
		if !isNumberStart(value[i]) {
			i++
			continue
		}
		num, next, ok := scanNumber(value, i)
		if !ok || next <= i {
			i++
			continue
		}
		nums = append(nums, num)
		i = next
	}
	return nums
}

func getAttr(attrs []xml.Attr, name string) string {
	for _, attr := range attrs {
		if strings.EqualFold(attr.Name.Local, name) {
			return attr.Value
		}
	}
	return ""
}

// ---- Transform parsing ----

type svgTransform struct {
	a float64
	b float64
	c float64
	d float64
	e float64
	f float64
}

func identityTransform() svgTransform {
	return svgTransform{a: 1, d: 1}
}

func (t svgTransform) Apply(p Point) Point {
	return Point{
		X: t.a*p.X + t.c*p.Y + t.e,
		Y: t.b*p.X + t.d*p.Y + t.f,
	}
}

func (t svgTransform) Multiply(o svgTransform) svgTransform {
	return svgTransform{
		a: t.a*o.a + t.c*o.b,
		b: t.b*o.a + t.d*o.b,
		c: t.a*o.c + t.c*o.d,
		d: t.b*o.c + t.d*o.d,
		e: t.a*o.e + t.c*o.f + t.e,
		f: t.b*o.e + t.d*o.f + t.f,
	}
}

func translateTransform(tx, ty float64) svgTransform {
	return svgTransform{a: 1, d: 1, e: tx, f: ty}
}

func scaleTransform(sx, sy float64) svgTransform {
	return svgTransform{a: sx, d: sy}
}

func rotateTransform(angleRad float64) svgTransform {
	cos := math.Cos(angleRad)
	sin := math.Sin(angleRad)
	return svgTransform{a: cos, b: sin, c: -sin, d: cos}
}

func skewXTransform(angleRad float64) svgTransform {
	return svgTransform{a: 1, c: math.Tan(angleRad), d: 1}
}

func skewYTransform(angleRad float64) svgTransform {
	return svgTransform{a: 1, b: math.Tan(angleRad), d: 1}
}

func parseTransformAttr(value string) svgTransform {
	value = strings.TrimSpace(value)
	if value == "" {
		return identityTransform()
	}
	current := identityTransform()
	rest := value
	for len(rest) > 0 {
		open := strings.IndexByte(rest, '(')
		if open == -1 {
			break
		}
		name := strings.TrimSpace(rest[:open])
		rest = rest[open+1:]
		closeIdx := strings.IndexByte(rest, ')')
		if closeIdx == -1 {
			break
		}
		args := rest[:closeIdx]
		rest = rest[closeIdx+1:]
		nums := parseFloatList(args)
		t := transformFromName(name, nums)
		current = current.Multiply(t)
	}
	return current
}

func transformFromName(name string, nums []float64) svgTransform {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "translate":
		if len(nums) == 1 {
			return translateTransform(nums[0], 0)
		}
		if len(nums) >= 2 {
			return translateTransform(nums[0], nums[1])
		}
	case "scale":
		if len(nums) == 1 {
			return scaleTransform(nums[0], nums[0])
		}
		if len(nums) >= 2 {
			return scaleTransform(nums[0], nums[1])
		}
	case "rotate":
		if len(nums) == 1 {
			return rotateTransform(nums[0] * math.Pi / 180)
		}
		if len(nums) >= 3 {
			angle := nums[0] * math.Pi / 180
			rotate := rotateTransform(angle)
			return translateTransform(nums[1], nums[2]).Multiply(rotate).Multiply(translateTransform(-nums[1], -nums[2]))
		}
	case "skewx":
		if len(nums) >= 1 {
			return skewXTransform(nums[0] * math.Pi / 180)
		}
	case "skewy":
		if len(nums) >= 1 {
			return skewYTransform(nums[0] * math.Pi / 180)
		}
	case "matrix":
		if len(nums) >= 6 {
			return svgTransform{
				a: nums[0],
				b: nums[1],
				c: nums[2],
				d: nums[3],
				e: nums[4],
				f: nums[5],
			}
		}
	}
	return identityTransform()
}

// ---- Shape helpers ----

func rectToPrimitives(x, y, w, h float64, transform svgTransform, idx *int, simplifyEpsilon float64) []Primitive {
	if w == 0 || h == 0 {
		return nil
	}
	corners := []Point{
		{X: x, Y: y},
		{X: x + w, Y: y},
		{X: x + w, Y: y + h},
		{X: x, Y: y + h},
	}
	applyTransformToPoints(corners, transform)
	if transformAxisAligned(transform) {
		minX, minY, maxX, maxY := boundsFromPoints(corners)
		return []Primitive{{
			Type:   "rectangle",
			ID:     nextSVGID(idx),
			X:      minX,
			Y:      minY,
			Width:  maxX - minX,
			Height: maxY - minY,
		}}
	}
	prim := Primitive{
		Type:   "polygon",
		ID:     nextSVGID(idx),
		Points: svgSimplifyPoints(corners, simplifyEpsilon),
		Closed: true,
	}
	return []Primitive{prim}
}

func circleToPrimitives(center Point, radius float64, transform svgTransform, idx *int, simplifyEpsilon float64) []Primitive {
	if radius == 0 {
		return nil
	}
	if scale, ok := transformUniformScale(transform); ok {
		c := transform.Apply(center)
		prim := Primitive{
			Type:    "circle",
			ID:      nextSVGID(idx),
			CenterX: c.X,
			CenterY: c.Y,
			Radius:  radius * scale,
		}
		return []Primitive{prim}
	}
	points := sampleEllipse(center, radius, radius, svgCurveSamples*2)
	applyTransformToPoints(points, transform)
	prim := Primitive{
		Type:   "polygon",
		ID:     nextSVGID(idx),
		Points: svgSimplifyPoints(points, simplifyEpsilon),
		Closed: true,
	}
	return []Primitive{prim}
}

func ellipseToPrimitive(center Point, rx, ry float64, transform svgTransform, idx *int, simplifyEpsilon float64) *Primitive {
	if rx == 0 || ry == 0 {
		return nil
	}
	points := sampleEllipse(center, rx, ry, svgCurveSamples*2)
	applyTransformToPoints(points, transform)
	prim := Primitive{
		Type:   "polygon",
		ID:     nextSVGID(idx),
		Points: svgSimplifyPoints(points, simplifyEpsilon),
		Closed: true,
	}
	return &prim
}

func sampleEllipse(center Point, rx, ry float64, steps int) []Point {
	if steps < 8 {
		steps = 8
	}
	points := make([]Point, 0, steps)
	for i := 0; i < steps; i++ {
		angle := float64(i) * (2 * math.Pi / float64(steps))
		points = append(points, Point{
			X: center.X + rx*math.Cos(angle),
			Y: center.Y + ry*math.Sin(angle),
		})
	}
	return points
}

func transformAxisAligned(t svgTransform) bool {
	return nearlyZero(t.b) && nearlyZero(t.c)
}

func transformUniformScale(t svgTransform) (float64, bool) {
	scaleX := math.Hypot(t.a, t.b)
	scaleY := math.Hypot(t.c, t.d)
	if math.Abs(scaleX-scaleY) > 1e-6 {
		return 0, false
	}
	if math.Abs(t.a*t.c+t.b*t.d) > 1e-6 {
		return 0, false
	}
	if scaleX == 0 {
		return 0, false
	}
	return scaleX, true
}

func boundsFromPoints(points []Point) (float64, float64, float64, float64) {
	minX := math.MaxFloat64
	minY := math.MaxFloat64
	maxX := -math.MaxFloat64
	maxY := -math.MaxFloat64
	for _, pt := range points {
		minX = min(minX, pt.X)
		minY = min(minY, pt.Y)
		maxX = max(maxX, pt.X)
		maxY = max(maxY, pt.Y)
	}
	return minX, minY, maxX, maxY
}

func applyTransformToPoints(points []Point, transform svgTransform) {
	for i := range points {
		points[i] = transform.Apply(points[i])
	}
}

func applyTransformToSegment(seg *svgPathSegment, transform svgTransform) {
	for i := range seg.Points {
		seg.Points[i] = transform.Apply(seg.Points[i])
	}
	// Also transform SubSegments (used for line/curve distinction)
	for i := range seg.SubSegments {
		for j := range seg.SubSegments[i].Points {
			seg.SubSegments[i].Points[j] = transform.Apply(seg.SubSegments[i].Points[j])
		}
	}
}

func flipPrimitivesY(prims []Primitive, baseline float64) {
	for i := range prims {
		switch prims[i].Type {
		case "line":
			prims[i].StartY = baseline - prims[i].StartY
			prims[i].EndY = baseline - prims[i].EndY
		case "circle":
			prims[i].CenterY = baseline - prims[i].CenterY
		case "arc":
			prims[i].StartY = baseline - prims[i].StartY
			prims[i].EndY = baseline - prims[i].EndY
			prims[i].CenterY = baseline - prims[i].CenterY
			if prims[i].ThroughPoint != nil {
				prims[i].ThroughPoint.Y = baseline - prims[i].ThroughPoint.Y
			}
		case "polyline", "polygon":
			for j := range prims[i].Points {
				prims[i].Points[j].Y = baseline - prims[i].Points[j].Y
			}
		case "rectangle":
			prims[i].Y = baseline - (prims[i].Y + prims[i].Height)
		}
	}
}

// ---- Path parsing ----

type pathTokenKind int

const (
	pathTokenCommand pathTokenKind = iota
	pathTokenNumber
)

type pathToken struct {
	kind pathTokenKind
	cmd  byte
	num  float64
}

// svgPathSegment represents a parsed SVG path segment.
// Instead of merging all commands into one polyline, we now track
// individual sub-segments for each SVG command (line, cubic, etc.)
// This preserves the semantic distinction between lines and curves.
type svgPathSegment struct {
	Points []Point
	Closed bool
	// SubSegments contains the individual command results.
	// Each sub-segment has its own points and type info.
	SubSegments []svgSubSegment
}

// svgSubSegment represents points from a single SVG path command.
type svgSubSegment struct {
	Points []Point
	IsLine bool // true if from L/l/H/h/V/v command (definitely a line)
}

type svgPathParser struct {
	tokens        []pathToken
	pos           int
	curr          Point
	start         Point
	segment       *svgPathSegment
	segments      []svgPathSegment
	lastCmd       byte
	lastCubicCtrl *Point
	lastQuadCtrl  *Point
}

func parsePathData(data string) ([]svgPathSegment, error) {
	tokens, err := tokenizePath(data)
	if err != nil {
		return nil, err
	}
	parser := &svgPathParser{tokens: tokens}
	if err := parser.parse(); err != nil {
		return nil, err
	}
	return parser.segments, nil
}

func tokenizePath(data string) ([]pathToken, error) {
	tokens := []pathToken{}
	for i := 0; i < len(data); {
		ch := data[i]
		if isSeparator(ch) {
			i++
			continue
		}
		if (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') {
			tokens = append(tokens, pathToken{kind: pathTokenCommand, cmd: ch})
			i++
			continue
		}
		if isNumberStart(ch) {
			num, next, ok := scanNumber(data, i)
			if ok {
				tokens = append(tokens, pathToken{kind: pathTokenNumber, num: num})
				i = next
				continue
			}
		}
		i++
	}
	return tokens, nil
}

func (p *svgPathParser) parse() error {
	var cmd byte
	for p.pos < len(p.tokens) {
		token := p.tokens[p.pos]
		if token.kind == pathTokenCommand {
			cmd = token.cmd
			p.pos++
		} else if cmd == 0 {
			p.pos++
			continue
		}

		switch cmd {
		case 'M':
			if err := p.parseMove(true); err != nil {
				return err
			}
		case 'm':
			if err := p.parseMove(false); err != nil {
				return err
			}
		case 'L':
			if err := p.parseLine(true); err != nil {
				return err
			}
		case 'l':
			if err := p.parseLine(false); err != nil {
				return err
			}
		case 'H':
			if err := p.parseHorizontal(true); err != nil {
				return err
			}
		case 'h':
			if err := p.parseHorizontal(false); err != nil {
				return err
			}
		case 'V':
			if err := p.parseVertical(true); err != nil {
				return err
			}
		case 'v':
			if err := p.parseVertical(false); err != nil {
				return err
			}
		case 'C':
			if err := p.parseCubic(true); err != nil {
				return err
			}
		case 'c':
			if err := p.parseCubic(false); err != nil {
				return err
			}
		case 'S':
			if err := p.parseSmoothCubic(true); err != nil {
				return err
			}
		case 's':
			if err := p.parseSmoothCubic(false); err != nil {
				return err
			}
		case 'Q':
			if err := p.parseQuadratic(true); err != nil {
				return err
			}
		case 'q':
			if err := p.parseQuadratic(false); err != nil {
				return err
			}
		case 'T':
			if err := p.parseSmoothQuadratic(true); err != nil {
				return err
			}
		case 't':
			if err := p.parseSmoothQuadratic(false); err != nil {
				return err
			}
		case 'A':
			if err := p.parseArc(true); err != nil {
				return err
			}
		case 'a':
			if err := p.parseArc(false); err != nil {
				return err
			}
		case 'Z', 'z':
			p.closePath()
		default:
			p.pos++
		}
		p.lastCmd = cmd
	}
	p.finishSegment()
	return nil
}

func (p *svgPathParser) parseMove(abs bool) error {
	x, ok := p.nextNumber()
	if !ok {
		return fmt.Errorf("svg path: move missing x")
	}
	y, ok := p.nextNumber()
	if !ok {
		return fmt.Errorf("svg path: move missing y")
	}
	if !abs {
		x += p.curr.X
		y += p.curr.Y
	}
	p.finishSegment()
	p.curr = Point{X: x, Y: y}
	p.start = p.curr
	p.segment = &svgPathSegment{Points: []Point{p.curr}}
	p.lastCubicCtrl = nil
	p.lastQuadCtrl = nil

	for {
		x, ok = p.nextNumber()
		if !ok {
			break
		}
		y, ok = p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: move missing y")
		}
		if !abs {
			x += p.curr.X
			y += p.curr.Y
		}
		p.lineTo(Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseLine(abs bool) error {
	for {
		x, ok := p.nextNumber()
		if !ok {
			break
		}
		y, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: line missing y")
		}
		if !abs {
			x += p.curr.X
			y += p.curr.Y
		}
		p.lineTo(Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseHorizontal(abs bool) error {
	for {
		x, ok := p.nextNumber()
		if !ok {
			break
		}
		if !abs {
			x += p.curr.X
		}
		p.lineTo(Point{X: x, Y: p.curr.Y})
	}
	return nil
}

func (p *svgPathParser) parseVertical(abs bool) error {
	for {
		y, ok := p.nextNumber()
		if !ok {
			break
		}
		if !abs {
			y += p.curr.Y
		}
		p.lineTo(Point{X: p.curr.X, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseCubic(abs bool) error {
	for {
		x1, ok := p.nextNumber()
		if !ok {
			break
		}
		y1, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: cubic missing y1")
		}
		x2, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: cubic missing x2")
		}
		y2, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: cubic missing y2")
		}
		x, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: cubic missing x")
		}
		y, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: cubic missing y")
		}
		if !abs {
			x1 += p.curr.X
			y1 += p.curr.Y
			x2 += p.curr.X
			y2 += p.curr.Y
			x += p.curr.X
			y += p.curr.Y
		}
		p.cubicTo(Point{X: x1, Y: y1}, Point{X: x2, Y: y2}, Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseSmoothCubic(abs bool) error {
	for {
		x2, ok := p.nextNumber()
		if !ok {
			break
		}
		y2, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: smooth cubic missing y2")
		}
		x, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: smooth cubic missing x")
		}
		y, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: smooth cubic missing y")
		}
		if !abs {
			x2 += p.curr.X
			y2 += p.curr.Y
			x += p.curr.X
			y += p.curr.Y
		}
		c1 := p.curr
		if p.lastCmd == 'C' || p.lastCmd == 'c' || p.lastCmd == 'S' || p.lastCmd == 's' {
			if p.lastCubicCtrl != nil {
				c1 = Point{
					X: 2*p.curr.X - p.lastCubicCtrl.X,
					Y: 2*p.curr.Y - p.lastCubicCtrl.Y,
				}
			}
		}
		p.cubicTo(c1, Point{X: x2, Y: y2}, Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseQuadratic(abs bool) error {
	for {
		x1, ok := p.nextNumber()
		if !ok {
			break
		}
		y1, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: quadratic missing y1")
		}
		x, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: quadratic missing x")
		}
		y, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: quadratic missing y")
		}
		if !abs {
			x1 += p.curr.X
			y1 += p.curr.Y
			x += p.curr.X
			y += p.curr.Y
		}
		p.quadraticTo(Point{X: x1, Y: y1}, Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseSmoothQuadratic(abs bool) error {
	for {
		x, ok := p.nextNumber()
		if !ok {
			break
		}
		y, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: smooth quadratic missing y")
		}
		if !abs {
			x += p.curr.X
			y += p.curr.Y
		}
		ctrl := p.curr
		if p.lastCmd == 'Q' || p.lastCmd == 'q' || p.lastCmd == 'T' || p.lastCmd == 't' {
			if p.lastQuadCtrl != nil {
				ctrl = Point{
					X: 2*p.curr.X - p.lastQuadCtrl.X,
					Y: 2*p.curr.Y - p.lastQuadCtrl.Y,
				}
			}
		}
		p.quadraticTo(ctrl, Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) parseArc(abs bool) error {
	for {
		rx, ok := p.nextNumber()
		if !ok {
			break
		}
		ry, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: arc missing ry")
		}
		angle, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: arc missing rotation")
		}
		largeArcFlag, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: arc missing large-arc flag")
		}
		sweepFlag, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: arc missing sweep flag")
		}
		x, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: arc missing x")
		}
		y, ok := p.nextNumber()
		if !ok {
			return fmt.Errorf("svg path: arc missing y")
		}
		if !abs {
			x += p.curr.X
			y += p.curr.Y
		}
		p.arcTo(rx, ry, angle, largeArcFlag != 0, sweepFlag != 0, Point{X: x, Y: y})
	}
	return nil
}

func (p *svgPathParser) nextNumber() (float64, bool) {
	if p.pos >= len(p.tokens) {
		return 0, false
	}
	token := p.tokens[p.pos]
	if token.kind != pathTokenNumber {
		return 0, false
	}
	p.pos++
	return token.num, true
}

func (p *svgPathParser) ensureSegment() {
	if p.segment == nil {
		p.segment = &svgPathSegment{Points: []Point{p.curr}}
		p.start = p.curr
	}
}

func (p *svgPathParser) lineTo(pt Point) {
	p.ensureSegment()
	// Track as sub-segment with IsLine=true
	p.segment.SubSegments = append(p.segment.SubSegments, svgSubSegment{
		Points: []Point{p.curr, pt},
		IsLine: true,
	})
	p.segment.Points = appendPoint(p.segment.Points, pt)
	p.curr = pt
	p.lastCubicCtrl = nil
	p.lastQuadCtrl = nil
}

func (p *svgPathParser) cubicTo(c1, c2, end Point) {
	p.ensureSegment()
	samples := cubicSample(p.curr, c1, c2, end, svgCurveSamples)
	// Check if cubic bezier is actually a straight line (control points collinear with endpoints)
	isLinear := isCubicLinear(p.curr, c1, c2, end)
	// Track as sub-segment
	subPoints := []Point{p.curr}
	for _, pt := range samples {
		p.segment.Points = appendPoint(p.segment.Points, pt)
		subPoints = append(subPoints, pt)
	}
	p.segment.SubSegments = append(p.segment.SubSegments, svgSubSegment{
		Points: subPoints,
		IsLine: isLinear,
	})
	p.curr = end
	p.lastCubicCtrl = &c2
	p.lastQuadCtrl = nil
}

// isCubicLinear checks if a cubic bezier is effectively a straight line
// by testing if control points are collinear with endpoints.
func isCubicLinear(p0, c1, c2, p3 Point) bool {
	// Calculate distance from control points to the line p0-p3
	lineLen := distance(p0, p3)
	if lineLen < 1e-9 {
		return true // Degenerate case
	}
	dist1 := pointToSegmentDistance(c1, p0, p3)
	dist2 := pointToSegmentDistance(c2, p0, p3)
	// If both control points are within 0.1% of line length from the line, it's linear
	threshold := lineLen * 0.001
	if threshold < 0.01 {
		threshold = 0.01
	}
	return dist1 < threshold && dist2 < threshold
}

func (p *svgPathParser) quadraticTo(c1, end Point) {
	p.ensureSegment()
	samples := quadraticSample(p.curr, c1, end, svgCurveSamples)
	// Check if quadratic bezier is actually a straight line (control point collinear)
	isLinear := isQuadraticLinear(p.curr, c1, end)
	// Track as sub-segment
	subPoints := []Point{p.curr}
	for _, pt := range samples {
		p.segment.Points = appendPoint(p.segment.Points, pt)
		subPoints = append(subPoints, pt)
	}
	p.segment.SubSegments = append(p.segment.SubSegments, svgSubSegment{
		Points: subPoints,
		IsLine: isLinear,
	})
	p.curr = end
	p.lastQuadCtrl = &c1
	p.lastCubicCtrl = nil
}

// isQuadraticLinear checks if a quadratic bezier is effectively a straight line.
func isQuadraticLinear(p0, c1, p2 Point) bool {
	lineLen := distance(p0, p2)
	if lineLen < 1e-9 {
		return true
	}
	dist := pointToSegmentDistance(c1, p0, p2)
	threshold := lineLen * 0.001
	if threshold < 0.01 {
		threshold = 0.01
	}
	return dist < threshold
}

func (p *svgPathParser) arcTo(rx, ry, angle float64, largeArc, sweep bool, end Point) {
	p.ensureSegment()
	samples := arcSample(p.curr, end, rx, ry, angle, largeArc, sweep)
	// Track as sub-segment (arcs are curves, not lines)
	subPoints := []Point{p.curr}
	for _, pt := range samples {
		p.segment.Points = appendPoint(p.segment.Points, pt)
		subPoints = append(subPoints, pt)
	}
	p.segment.SubSegments = append(p.segment.SubSegments, svgSubSegment{
		Points: subPoints,
		IsLine: false,
	})
	p.curr = end
	p.lastCubicCtrl = nil
	p.lastQuadCtrl = nil
}

func (p *svgPathParser) closePath() {
	if p.segment == nil {
		return
	}
	p.segment.Points = appendPoint(p.segment.Points, p.segment.Points[0])
	p.segment.Closed = true
	p.segments = append(p.segments, *p.segment)
	p.segment = nil
	p.curr = p.start
	p.lastCubicCtrl = nil
	p.lastQuadCtrl = nil
}

func (p *svgPathParser) finishSegment() {
	if p.segment == nil {
		return
	}
	p.segments = append(p.segments, *p.segment)
	p.segment = nil
}

func appendPoint(points []Point, pt Point) []Point {
	if len(points) == 0 {
		return append(points, pt)
	}
	last := points[len(points)-1]
	if math.Abs(last.X-pt.X) < 1e-9 && math.Abs(last.Y-pt.Y) < 1e-9 {
		return points
	}
	return append(points, pt)
}

func segmentToPrimitives(seg svgPathSegment, idx *int, simplifyEpsilon float64) []Primitive {
	// If we have sub-segments, use them for better line/curve distinction
	if len(seg.SubSegments) > 0 {
		return subSegmentsToPrimitives(seg, idx, simplifyEpsilon)
	}

	// Fallback to old behavior if no sub-segments tracked
	points := seg.Points
	if len(points) < 2 {
		return nil
	}
	if seg.Closed && len(points) > 1 {
		last := points[len(points)-1]
		first := points[0]
		if math.Abs(last.X-first.X) < 1e-9 && math.Abs(last.Y-first.Y) < 1e-9 {
			points = points[:len(points)-1]
		}
	}

	if seg.Closed {
		if len(points) < 3 {
			return nil
		}
		return []Primitive{{
			Type:   "polygon",
			ID:     nextSVGID(idx),
			Points: svgSimplifyPoints(points, simplifyEpsilon),
			Closed: true,
		}}
	}

	if len(points) == 2 {
		return []Primitive{newLinePrimitive(points[0], points[1], "", nextSVGID(idx))}
	}

	return []Primitive{{
		Type:   "polyline",
		ID:     nextSVGID(idx),
		Points: svgSimplifyPoints(points, simplifyEpsilon),
	}}
}

// subSegmentsToPrimitives converts SVG sub-segments to primitives,
// preserving the line/curve distinction from the original SVG commands.
func subSegmentsToPrimitives(seg svgPathSegment, idx *int, simplifyEpsilon float64) []Primitive {
	var result []Primitive

	// Group consecutive curve sub-segments into polylines for arc fitting,
	// but output line sub-segments directly as Line primitives
	var curvePoints []Point

	flushCurve := func() {
		if len(curvePoints) < 2 {
			curvePoints = nil
			return
		}
		if len(curvePoints) == 2 {
			result = append(result, newLinePrimitive(curvePoints[0], curvePoints[1], "", nextSVGID(idx)))
		} else {
			result = append(result, Primitive{
				Type:   "polyline",
				ID:     nextSVGID(idx),
				Points: svgSimplifyPoints(curvePoints, simplifyEpsilon),
			})
		}
		curvePoints = nil
	}

	for _, sub := range seg.SubSegments {
		if sub.IsLine {
			// Flush any pending curve points
			flushCurve()
			// Output line directly - this preserves the line from l/L/h/H/v/V commands
			if len(sub.Points) >= 2 {
				result = append(result, newLinePrimitive(sub.Points[0], sub.Points[len(sub.Points)-1], "", nextSVGID(idx)))
			}
		} else {
			// Curve command - accumulate points for potential arc fitting
			if len(curvePoints) == 0 && len(sub.Points) > 0 {
				curvePoints = append(curvePoints, sub.Points[0])
			}
			for i := 1; i < len(sub.Points); i++ {
				curvePoints = appendPoint(curvePoints, sub.Points[i])
			}
		}
	}

	// Flush remaining curve points
	flushCurve()

	// Handle closed paths - add closing line if needed
	if seg.Closed && len(result) > 0 {
		first := result[0]
		last := result[len(result)-1]
		startPt := primitiveStartPoint(&first)
		endPt := primitiveEndPoint(&last)
		if distance(startPt, endPt) > 0.1 {
			result = append(result, newLinePrimitive(endPt, startPt, "", nextSVGID(idx)))
		}
	}

	return result
}

func cubicSample(p0, p1, p2, p3 Point, steps int) []Point {
	if steps < 4 {
		steps = 4
	}
	points := make([]Point, 0, steps)
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		mt := 1 - t
		x := mt*mt*mt*p0.X + 3*mt*mt*t*p1.X + 3*mt*t*t*p2.X + t*t*t*p3.X
		y := mt*mt*mt*p0.Y + 3*mt*mt*t*p1.Y + 3*mt*t*t*p2.Y + t*t*t*p3.Y
		points = append(points, Point{X: x, Y: y})
	}
	return points
}

func quadraticSample(p0, p1, p2 Point, steps int) []Point {
	if steps < 4 {
		steps = 4
	}
	points := make([]Point, 0, steps)
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		mt := 1 - t
		x := mt*mt*p0.X + 2*mt*t*p1.X + t*t*p2.X
		y := mt*mt*p0.Y + 2*mt*t*p1.Y + t*t*p2.Y
		points = append(points, Point{X: x, Y: y})
	}
	return points
}

func arcSample(start, end Point, rx, ry, angle float64, largeArc, sweep bool) []Point {
	rx = math.Abs(rx)
	ry = math.Abs(ry)
	if rx == 0 || ry == 0 {
		return []Point{end}
	}
	if math.Abs(start.X-end.X) < 1e-9 && math.Abs(start.Y-end.Y) < 1e-9 {
		return nil
	}

	phi := angle * math.Pi / 180
	cosPhi := math.Cos(phi)
	sinPhi := math.Sin(phi)

	dx := (start.X - end.X) / 2
	dy := (start.Y - end.Y) / 2

	x1p := cosPhi*dx + sinPhi*dy
	y1p := -sinPhi*dx + cosPhi*dy

	lambda := (x1p*x1p)/(rx*rx) + (y1p*y1p)/(ry*ry)
	if lambda > 1 {
		scale := math.Sqrt(lambda)
		rx *= scale
		ry *= scale
	}

	sign := 1.0
	if largeArc == sweep {
		sign = -1.0
	}

	num := rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p
	den := rx*rx*y1p*y1p + ry*ry*x1p*x1p
	if den == 0 {
		return []Point{end}
	}
	coef := sign * math.Sqrt(math.Max(0, num/den))
	cxp := coef * (rx * y1p / ry)
	cyp := coef * (-ry * x1p / rx)

	cx := cosPhi*cxp - sinPhi*cyp + (start.X+end.X)/2
	cy := sinPhi*cxp + cosPhi*cyp + (start.Y+end.Y)/2

	ux := (x1p - cxp) / rx
	uy := (y1p - cyp) / ry
	vx := (-x1p - cxp) / rx
	vy := (-y1p - cyp) / ry

	theta1 := math.Atan2(uy, ux)
	delta := math.Atan2(ux*vy-uy*vx, ux*vx+uy*vy)
	if !sweep && delta > 0 {
		delta -= 2 * math.Pi
	} else if sweep && delta < 0 {
		delta += 2 * math.Pi
	}

	steps := int(math.Ceil(math.Abs(delta) / svgArcStepRadians))
	if steps < svgArcMinSteps {
		steps = svgArcMinSteps
	}
	points := make([]Point, 0, steps)
	for i := 1; i <= steps; i++ {
		t := float64(i) / float64(steps)
		angle := theta1 + delta*t
		cosA := math.Cos(angle)
		sinA := math.Sin(angle)
		x := cosPhi*rx*cosA - sinPhi*ry*sinA + cx
		y := sinPhi*rx*cosA + cosPhi*ry*sinA + cy
		points = append(points, Point{X: x, Y: y})
	}
	return points
}

func isSeparator(ch byte) bool {
	return ch == ' ' || ch == '\n' || ch == '\t' || ch == '\r' || ch == ','
}

func isNumberStart(ch byte) bool {
	return (ch >= '0' && ch <= '9') || ch == '-' || ch == '+' || ch == '.'
}

func scanNumber(s string, start int) (float64, int, bool) {
	i := start
	if i < len(s) && (s[i] == '+' || s[i] == '-') {
		i++
	}
	hasDigits := false
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		hasDigits = true
		i++
	}
	if i < len(s) && s[i] == '.' {
		i++
		for i < len(s) && s[i] >= '0' && s[i] <= '9' {
			hasDigits = true
			i++
		}
	}
	if !hasDigits {
		return 0, start, false
	}
	if i < len(s) && (s[i] == 'e' || s[i] == 'E') {
		j := i + 1
		if j < len(s) && (s[j] == '+' || s[j] == '-') {
			j++
		}
		hasExp := false
		for j < len(s) && s[j] >= '0' && s[j] <= '9' {
			hasExp = true
			j++
		}
		if hasExp {
			i = j
		}
	}

	value, err := strconv.ParseFloat(strings.TrimSpace(s[start:i]), 64)
	if err != nil {
		return 0, start, false
	}
	return value, i, true
}

func nearlyZero(v float64) bool {
	return math.Abs(v) < 1e-9
}

func nextSVGID(idx *int) string {
	*idx += 1
	return fmt.Sprintf("svg_%d", *idx)
}

// fitArcsToPointsSVG fits arcs and lines to curve polylines from SVG.
// Since lines are now separated at parse time (IsLine subsegments become Line primitives),
// this function only receives actual curve data and uses the standard DXF arc fitting.
func fitArcsToPointsSVG(points []Point) []Primitive {
	// Delegate to the proven DXF arc fitting algorithm
	return fitArcsToPoints(points)
}
