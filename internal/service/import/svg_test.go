package importservice

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/rustyoz/svg"
)

func TestParseSVG_SimpleFile(t *testing.T) {
	testFile := filepath.Join("..", "..", "..", "Svg", "cat-svgrepo-com.svg")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("Test SVG file not found: %v", err)
	}

	result, err := ParseSVG(string(content), 1.0)
	if err != nil {
		t.Fatalf("ParseSVG failed: %v", err)
	}

	if result == nil {
		t.Fatal("ParseSVG returned nil result")
	}

	t.Logf("Parsed %d primitives", result.Stats.EntityCount)
	t.Logf("Entity types: %v", result.Stats.ByType)
	t.Logf("Width: %s, Height: %s", result.Width, result.Height)

	if result.Bounds != nil {
		t.Logf("Bounds: (%.2f, %.2f) - (%.2f, %.2f)",
			result.Bounds.MinX, result.Bounds.MinY,
			result.Bounds.MaxX, result.Bounds.MaxY)
	}
}

func TestParseSVG_WithScale(t *testing.T) {
	testFile := filepath.Join("..", "..", "..", "Svg", "pie-chart-svgrepo-com.svg")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("Test SVG file not found: %v", err)
	}

	result1, err := ParseSVG(string(content), 1.0)
	if err != nil {
		t.Fatalf("ParseSVG (scale=1) failed: %v", err)
	}

	result2, err := ParseSVG(string(content), 2.0)
	if err != nil {
		t.Fatalf("ParseSVG (scale=2) failed: %v", err)
	}

	t.Logf("Scale 1.0: %d primitives", result1.Stats.EntityCount)
	t.Logf("Scale 2.0: %d primitives", result2.Stats.EntityCount)

	// Both should have same number of primitives
	if result1.Stats.EntityCount != result2.Stats.EntityCount {
		t.Errorf("Entity counts should match: %d vs %d",
			result1.Stats.EntityCount, result2.Stats.EntityCount)
	}
}

func TestParseSVG_InlineSVG(t *testing.T) {
	svgContent := `<svg width="100" height="100" viewBox="0 0 100 100">
		<rect x="10" y="10" width="30" height="30"/>
		<circle cx="70" cy="25" r="15"/>
		<line x1="10" y1="70" x2="90" y2="70"/>
		<path d="M10 90 L50 90 L30 80 Z"/>
	</svg>`

	result, err := ParseSVG(svgContent, 1.0)
	if err != nil {
		t.Fatalf("ParseSVG failed: %v", err)
	}

	t.Logf("Parsed %d primitives", result.Stats.EntityCount)
	t.Logf("Entity types: %v", result.Stats.ByType)

	if result.Stats.EntityCount == 0 {
		t.Error("Expected at least some primitives from inline SVG")
	}
}

func TestValidateSVGContent(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    bool
	}{
		{"valid_svg", "<svg><circle/></svg>", true},
		{"valid_complex", `<svg width="100"><path d="M0 0"/></svg>`, true},
		{"missing_svg", "<circle/>", false},
		{"missing_close", "<svg><circle/>", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidateSVGContent(tt.content); got != tt.want {
				t.Errorf("ValidateSVGContent() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFlattenBezier(t *testing.T) {
	start := Point{X: 0, Y: 0}

	// Test quadratic bezier (control point 1 only)
	// This should produce some points between start and end
	points := flattenCubicBezier(
		start,
		Point{X: 50, Y: 100}, // Control point 1
		Point{X: 50, Y: 100}, // Control point 2 (same for quadratic)
		Point{X: 100, Y: 0},  // End point
		1.0,
	)

	if len(points) == 0 {
		t.Error("Expected some points from bezier flattening")
	}

	t.Logf("Flattened bezier to %d points", len(points))

	// Last point should be near the end point
	last := points[len(points)-1]
	if last.X != 100 || last.Y != 0 {
		t.Errorf("Last point should be (100,0), got (%.2f, %.2f)", last.X, last.Y)
	}
}

func TestFlattenBezier_NilCurvePoints(t *testing.T) {
	start := Point{X: 0, Y: 0}
	result := flattenBezier(start, nil, 0.5)
	if result != nil {
		t.Error("Expected nil for nil curve points")
	}
}

func TestFlattenBezier_NilT(t *testing.T) {
	start := Point{X: 0, Y: 0}
	cp := &svg.CurvePoints{T: nil}
	result := flattenBezier(start, cp, 0.5)
	if result != nil {
		t.Error("Expected nil for nil T in curve points")
	}
}

func TestFlattenBezier_LineOnly(t *testing.T) {
	// Line (no control points)
	start := Point{X: 0, Y: 0}
	tEnd := svg.Tuple{10, 10}
	cp := &svg.CurvePoints{
		T:  &tEnd,
		C1: nil,
		C2: nil,
	}
	result := flattenBezier(start, cp, 0.5)
	if len(result) != 1 {
		t.Errorf("Line should produce 1 point, got %d", len(result))
	}
	if result[0].X != 10 || result[0].Y != 10 {
		t.Error("Line endpoint incorrect")
	}
}

func TestFlattenBezier_QuadraticC1Only(t *testing.T) {
	start := Point{X: 0, Y: 0}
	tEnd := svg.Tuple{100, 0}
	c1 := svg.Tuple{50, 50}
	cp := &svg.CurvePoints{
		T:  &tEnd,
		C1: &c1,
		C2: nil, // Nil C2 should default to end
	}
	result := flattenBezier(start, cp, 0.5)
	if len(result) == 0 {
		t.Error("Expected points from quadratic bezier")
	}
}

func TestFlattenBezier_QuadraticC2Only(t *testing.T) {
	start := Point{X: 0, Y: 0}
	tEnd := svg.Tuple{100, 0}
	c2 := svg.Tuple{50, 50}
	cp := &svg.CurvePoints{
		T:  &tEnd,
		C1: nil, // Nil C1 should default to start
		C2: &c2,
	}
	result := flattenBezier(start, cp, 0.5)
	if len(result) == 0 {
		t.Error("Expected points from quadratic bezier")
	}
}

func TestFlattenBezier_CubicBezier(t *testing.T) {
	start := Point{X: 0, Y: 0}
	tEnd := svg.Tuple{100, 0}
	c1 := svg.Tuple{30, 80}
	c2 := svg.Tuple{70, 80}
	cp := &svg.CurvePoints{
		T:  &tEnd,
		C1: &c1,
		C2: &c2,
	}
	result := flattenBezier(start, cp, 0.5)
	if len(result) == 0 {
		t.Error("Expected points from cubic bezier")
	}
	// Last point should be endpoint
	last := result[len(result)-1]
	if last.X != 100 || last.Y != 0 {
		t.Errorf("Last point should be (100,0), got (%.2f,%.2f)", last.X, last.Y)
	}
}

func TestPointToLineDist_DegenerateLine(t *testing.T) {
	// Test when line endpoints are same (degenerate line)
	p := Point{X: 5, Y: 5}
	l0 := Point{X: 0, Y: 0}
	l1 := Point{X: 0, Y: 0} // Same as l0
	dist := pointToLineDist(p, l0, l1)
	// Should return distance from p to l0
	expected := distance(p, l0)
	if dist != expected {
		t.Errorf("Expected %v, got %v", expected, dist)
	}
}

func TestMidpoint(t *testing.T) {
	a := Point{X: 0, Y: 0}
	b := Point{X: 10, Y: 20}
	m := midpoint(a, b)
	if m.X != 5 || m.Y != 10 {
		t.Errorf("Midpoint should be (5,10), got (%.2f,%.2f)", m.X, m.Y)
	}
}

func TestUpdateBoundsFromPoints(t *testing.T) {
	b := &Bounds{MinX: 100, MinY: 100, MaxX: -100, MaxY: -100}
	points := []Point{{X: 0, Y: 0}, {X: 50, Y: 50}, {X: 25, Y: 75}}
	updateBoundsFromPoints(b, points)
	if b.MinX != 0 || b.MinY != 0 || b.MaxX != 50 || b.MaxY != 75 {
		t.Errorf("Bounds not updated correctly: %+v", b)
	}
}

func TestUpdateBoundsFromCircle(t *testing.T) {
	b := &Bounds{MinX: 100, MinY: 100, MaxX: -100, MaxY: -100}
	c := Primitive{CenterX: 10, CenterY: 10, Radius: 5}
	updateBoundsFromCircle(b, c)
	if b.MinX != 5 || b.MinY != 5 || b.MaxX != 15 || b.MaxY != 15 {
		t.Errorf("Circle bounds not updated correctly: %+v", b)
	}
}

func TestCreatePolylinePrimitive(t *testing.T) {
	points := []Point{{X: 0, Y: 0}, {X: 10, Y: 10}}
	prim := createPolylinePrimitive(points, true, 42)
	if prim.Type != "polygon" {
		t.Error("Type should be polygon")
	}
	if prim.ID != "svg_42" {
		t.Errorf("ID should be svg_42, got %s", prim.ID)
	}
	if !prim.Closed {
		t.Error("Should be closed")
	}
	if len(prim.Points) != 2 {
		t.Error("Points count mismatch")
	}
}

func TestParseSVG_NegativeScale(t *testing.T) {
	svgContent := `<svg width="100" height="100"><rect x="10" y="10" width="30" height="30"/></svg>`
	result, err := ParseSVG(svgContent, -1.0)
	if err != nil {
		t.Fatalf("ParseSVG failed: %v", err)
	}
	if result == nil {
		t.Fatal("Result should not be nil")
	}
	// Negative scale should default to 1.0
}

func TestParseSVG_ZeroScale(t *testing.T) {
	svgContent := `<svg width="100" height="100"><circle cx="50" cy="50" r="25"/></svg>`
	result, err := ParseSVG(svgContent, 0)
	if err != nil {
		t.Fatalf("ParseSVG failed: %v", err)
	}
	if result == nil {
		t.Fatal("Result should not be nil")
	}
	// Zero scale should default to 1.0
}

func TestParseSVG_RealFile_ArcFitting(t *testing.T) {
	// Try to find the real test file
	testFiles := []string{
		"../../../DXF/DXF/m1dgw2d1/Laser Cut Modern Love Theme Wall Clock.svg",
		"DXF/DXF/m1dgw2d1/Laser Cut Modern Love Theme Wall Clock.svg",
	}

	var content []byte
	var err error
	var foundPath string

	for _, path := range testFiles {
		content, err = os.ReadFile(path)
		if err == nil {
			foundPath = path
			break
		}
	}

	if content == nil {
		t.Skipf("Test SVG file not found: tried %v", testFiles)
	}

	t.Logf("Using test file: %s (%d bytes)", foundPath, len(content))

	// Test ParseSVG with arc fitting
	result, err := ParseSVG(string(content), 1.0)
	if err != nil {
		t.Fatalf("ParseSVG failed: %v", err)
	}

	t.Logf("Parsed %d primitives", len(result.Primitives))
	t.Logf("Stats: %+v", result.Stats)

	if len(result.Primitives) == 0 {
		t.Error("Expected at least one primitive")
	}

	// Count primitive types
	typeCounts := make(map[string]int)
	for _, p := range result.Primitives {
		typeCounts[p.Type]++
	}

	t.Logf("Primitive types: %v", typeCounts)

	// Check that we have arcs (from arc fitting)
	if arcCount, ok := typeCounts["arc"]; ok && arcCount > 0 {
		t.Logf("SUCCESS: Found %d arc primitives (arc fitting working)", arcCount)
	} else {
		t.Error("FAILED: No arc primitives found - arc fitting may not be working")
	}

	if lineCount, ok := typeCounts["line"]; ok && lineCount > 0 {
		t.Logf("Found %d line primitives", lineCount)
	}
}

func TestCompareSVGvsDXF_ArcFitting(t *testing.T) {
	// Find test files
	baseDir := "../../../DXF/DXF/m1dgw2d1"
	svgPath := filepath.Join(baseDir, "Laser Cut Modern Love Theme Wall Clock.svg")
	dxfPath := filepath.Join(baseDir, "Laser Cut Modern Love Theme Wall Clock.dxf")

	svgContent, err := os.ReadFile(svgPath)
	if err != nil {
		t.Skipf("SVG test file not found: %v", err)
	}

	dxfContent, err := os.ReadFile(dxfPath)
	if err != nil {
		t.Skipf("DXF test file not found: %v", err)
	}

	// Parse SVG
	svgResult, err := ParseSVG(string(svgContent), 1.0)
	if err != nil {
		t.Fatalf("ParseSVG failed: %v", err)
	}

	// Parse DXF
	dxfResult, err := ParseDXF(string(dxfContent))
	if err != nil {
		t.Fatalf("ParseDXF failed: %v", err)
	}

	t.Logf("SVG: %d primitives", len(svgResult.Primitives))
	t.Logf("DXF: %d primitives", len(dxfResult.Primitives))

	// Count types for SVG
	svgTypes := make(map[string]int)
	for _, p := range svgResult.Primitives {
		svgTypes[p.Type]++
	}

	// Count types for DXF
	dxfTypes := make(map[string]int)
	for _, p := range dxfResult.Primitives {
		dxfTypes[p.Type]++
	}

	t.Logf("SVG types: %v", svgTypes)
	t.Logf("DXF types: %v", dxfTypes)

	// Both should have arcs if arc fitting is working
	svgArcs := svgTypes["arc"]
	dxfArcs := dxfTypes["arc"]

	t.Logf("SVG arcs: %d, DXF arcs: %d", svgArcs, dxfArcs)

	if svgArcs == 0 && dxfArcs > 0 {
		t.Error("SVG has no arcs but DXF does - arc fitting not working for SVG")
	}

	if svgArcs > 0 {
		t.Logf("SUCCESS: SVG arc fitting is working (%d arcs)", svgArcs)
	}
}
