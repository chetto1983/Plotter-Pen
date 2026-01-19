package importservice

import (
	"math"
	"os"
	"path/filepath"
	"testing"
)

func approxEqual(a, b, tol float64) bool {
	return math.Abs(a-b) < tol
}

func TestParseDXF_SimpleFile(t *testing.T) {
	// Read test DXF file
	testFile := filepath.Join("..", "..", "..", "DXF", "test_simple.dxf")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("Test DXF file not found: %v", err)
	}

	result, err := ParseDXF(string(content))
	if err != nil {
		t.Fatalf("ParseDXF failed: %v", err)
	}

	if result == nil {
		t.Fatal("ParseDXF returned nil result")
	}

	t.Logf("Parsed %d primitives", result.Stats.EntityCount)
	t.Logf("Entity types: %v", result.Stats.ByType)
	t.Logf("Layer count: %d", result.Stats.LayerCount)

	if result.Bounds != nil {
		t.Logf("Bounds: (%.2f, %.2f) - (%.2f, %.2f)",
			result.Bounds.MinX, result.Bounds.MinY,
			result.Bounds.MaxX, result.Bounds.MaxY)
	}
}

func TestSmartImport_WithOptions(t *testing.T) {
	testFile := filepath.Join("..", "..", "..", "DXF", "test_simple.dxf")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("Test DXF file not found: %v", err)
	}

	opts := ImportOptions{
		CenterOrigin: true,
		ScaleFactor:  2.0,
		ExtractPLC:   true,
	}

	result, err := SmartImport(string(content), opts)
	if err != nil {
		t.Fatalf("SmartImport failed: %v", err)
	}

	if result == nil {
		t.Fatal("SmartImport returned nil result")
	}

	t.Logf("Primitives: %d, PLC items: %d", len(result.Primitives), len(result.PLCData))

	// After centering, bounds center should be near origin
	if result.Bounds != nil {
		cx := (result.Bounds.MinX + result.Bounds.MaxX) / 2
		cy := (result.Bounds.MinY + result.Bounds.MaxY) / 2
		t.Logf("Center after transform: (%.4f, %.4f)", cx, cy)
	}
}

func TestValidateContent(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    bool
	}{
		{"valid_dxf", "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF", true},
		{"missing_section", "0\nENDSEC\n0\nEOF", false},
		{"missing_eof", "0\nSECTION\n0\nENDSEC", false},
		{"empty", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidateContent(tt.content); got != tt.want {
				t.Errorf("ValidateContent() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExportDXF(t *testing.T) {
	primitives := []Primitive{
		{Type: "line", StartX: 0, StartY: 0, EndX: 100, EndY: 100, Layer: "0"},
		{Type: "circle", CenterX: 50, CenterY: 50, Radius: 25, Layer: "0"},
	}

	content, err := ExportDXF(primitives, "AC2000")
	if err != nil {
		t.Fatalf("ExportDXF failed: %v", err)
	}

	if content == "" {
		t.Fatal("ExportDXF returned empty content")
	}

	// Verify basic DXF structure
	if !ValidateContent(content) {
		t.Error("Exported DXF fails validation")
	}

	t.Logf("Exported %d bytes", len(content))
}

func TestGetLayerNames(t *testing.T) {
	prims := []Primitive{
		{Layer: "Layer1"},
		{Layer: "Layer2"},
		{Layer: "Layer1"}, // duplicate
		{Layer: ""},       // default layer
	}

	names := GetLayerNames(prims)

	if len(names) != 3 {
		t.Errorf("Expected 3 unique layers, got %d: %v", len(names), names)
	}

	// Should be sorted
	if names[0] != "0" {
		t.Errorf("First layer should be '0' (default), got %s", names[0])
	}
}

func TestOptimizePathOrder(t *testing.T) {
	// Create primitives in suboptimal order
	prims := []Primitive{
		{Type: "line", StartX: 0, StartY: 0, EndX: 10, EndY: 0},
		{Type: "line", StartX: 100, StartY: 100, EndX: 110, EndY: 100},
		{Type: "line", StartX: 10, StartY: 0, EndX: 20, EndY: 0}, // Should come second
	}

	optimized := optimizePathOrder(prims)

	if len(optimized) != 3 {
		t.Errorf("Expected 3 primitives, got %d", len(optimized))
	}

	// After optimization, second primitive should start near first's end
	if optimized[1].StartX != 10 || optimized[1].StartY != 0 {
		t.Errorf("Second primitive should start at (10,0) but got (%.1f,%.1f)",
			optimized[1].StartX, optimized[1].StartY)
	}
}

// === Transform Tests ===

func TestTranslatePrimitive_AllTypes(t *testing.T) {
	tests := []struct {
		name     string
		prim     Primitive
		dx, dy   float64
		checkVal func(Primitive) bool
	}{
		{
			name:   "line",
			prim:   Primitive{Type: "line", StartX: 10, StartY: 20, EndX: 30, EndY: 40},
			dx:     5, dy: -5,
			checkVal: func(p Primitive) bool { return p.StartX == 15 && p.StartY == 15 },
		},
		{
			name:   "circle",
			prim:   Primitive{Type: "circle", CenterX: 50, CenterY: 50, Radius: 10},
			dx:     10, dy: 10,
			checkVal: func(p Primitive) bool { return p.CenterX == 60 && p.CenterY == 60 },
		},
		{
			name:   "arc",
			prim:   Primitive{Type: "arc", CenterX: 0, CenterY: 0, Radius: 5},
			dx:     -10, dy: -20,
			checkVal: func(p Primitive) bool { return p.CenterX == -10 && p.CenterY == -20 },
		},
		{
			name: "polyline",
			prim: Primitive{Type: "polyline", Points: []Point{{X: 0, Y: 0}, {X: 10, Y: 10}}},
			dx:   5, dy: 5,
			checkVal: func(p Primitive) bool {
				return p.Points[0].X == 5 && p.Points[0].Y == 5 && p.Points[1].X == 15 && p.Points[1].Y == 15
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			translatePrimitive(&tt.prim, tt.dx, tt.dy)
			if !tt.checkVal(tt.prim) {
				t.Errorf("Translate failed for %s", tt.name)
			}
		})
	}
}

func TestScalePrimitive_AllTypes(t *testing.T) {
	tests := []struct {
		name     string
		prim     Primitive
		factor   float64
		checkVal func(Primitive) bool
	}{
		{
			name:   "line",
			prim:   Primitive{Type: "line", StartX: 10, StartY: 10, EndX: 20, EndY: 20},
			factor: 2.0,
			checkVal: func(p Primitive) bool {
				return p.StartX == 20 && p.StartY == 20 && p.EndX == 40 && p.EndY == 40
			},
		},
		{
			name:   "circle",
			prim:   Primitive{Type: "circle", CenterX: 10, CenterY: 10, Radius: 5},
			factor: 3.0,
			checkVal: func(p Primitive) bool {
				return p.CenterX == 30 && p.CenterY == 30 && p.Radius == 15
			},
		},
		{
			name:   "arc",
			prim:   Primitive{Type: "arc", CenterX: 10, CenterY: 10, Radius: 5},
			factor: 0.5,
			checkVal: func(p Primitive) bool {
				return p.CenterX == 5 && p.CenterY == 5 && p.Radius == 2.5
			},
		},
		{
			name:   "polyline",
			prim:   Primitive{Type: "polyline", Points: []Point{{X: 2, Y: 4}, {X: 6, Y: 8}}},
			factor: 5.0,
			checkVal: func(p Primitive) bool {
				return p.Points[0].X == 10 && p.Points[0].Y == 20 && p.Points[1].X == 30 && p.Points[1].Y == 40
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			scalePrimitive(&tt.prim, tt.factor)
			if !tt.checkVal(tt.prim) {
				t.Errorf("Scale failed for %s: %+v", tt.name, tt.prim)
			}
		})
	}
}

func TestNormalizePrimitives(t *testing.T) {
	prims := []Primitive{
		{Type: "line", StartX: 0, StartY: 0, EndX: 200, EndY: 0},
	}
	bounds := &Bounds{MinX: 0, MinY: 0, MaxX: 200, MaxY: 0}

	normalizePrimitives(prims, bounds)

	// Max dimension was 200, should be scaled to 100
	if prims[0].EndX != 100 {
		t.Errorf("After normalize, EndX = %v, want 100", prims[0].EndX)
	}
}

func TestNormalizePrimitives_ZeroSize(t *testing.T) {
	prims := []Primitive{
		{Type: "line", StartX: 50, StartY: 50, EndX: 50, EndY: 50},
	}
	bounds := &Bounds{MinX: 50, MinY: 50, MaxX: 50, MaxY: 50}

	// Should not panic or divide by zero
	normalizePrimitives(prims, bounds)
}

func TestGetStartPoint_AllTypes(t *testing.T) {
	tests := []struct {
		name string
		prim Primitive
		want Point
	}{
		{
			name: "line",
			prim: Primitive{Type: "line", StartX: 10, StartY: 20},
			want: Point{X: 10, Y: 20},
		},
		{
			name: "circle",
			prim: Primitive{Type: "circle", CenterX: 0, CenterY: 0, Radius: 10, StartAngle: 0},
			want: Point{X: 10, Y: 0},
		},
		{
			name: "arc",
			prim: Primitive{Type: "arc", CenterX: 0, CenterY: 0, Radius: 10, StartX: 0, StartY: 10},
			want: Point{X: 0, Y: 10},
		},
		{
			name: "polyline",
			prim: Primitive{Type: "polyline", Points: []Point{{X: 5, Y: 5}, {X: 10, Y: 10}}},
			want: Point{X: 5, Y: 5},
		},
		{
			name: "polyline_empty",
			prim: Primitive{Type: "polyline", Points: []Point{}},
			want: Point{X: 0, Y: 0},
		},
		{
			name: "unknown",
			prim: Primitive{Type: "unknown"},
			want: Point{X: 0, Y: 0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getStartPoint(&tt.prim)
			if !approxEqual(got.X, tt.want.X, 0.001) || !approxEqual(got.Y, tt.want.Y, 0.001) {
				t.Errorf("getStartPoint() = (%v, %v), want (%v, %v)", got.X, got.Y, tt.want.X, tt.want.Y)
			}
		})
	}
}

func TestGetEndPoint_AllTypes(t *testing.T) {
	tests := []struct {
		name string
		prim Primitive
		want Point
	}{
		{
			name: "line",
			prim: Primitive{Type: "line", EndX: 30, EndY: 40},
			want: Point{X: 30, Y: 40},
		},
		{
			name: "circle",
			prim: Primitive{Type: "circle", CenterX: 0, CenterY: 0, Radius: 10},
			want: Point{X: 10, Y: 0},
		},
		{
			name: "arc",
			prim: Primitive{Type: "arc", CenterX: 0, CenterY: 0, Radius: 10, EndX: 0, EndY: 10},
			want: Point{X: 0, Y: 10},
		},
		{
			name: "polyline",
			prim: Primitive{Type: "polyline", Points: []Point{{X: 5, Y: 5}, {X: 15, Y: 25}}},
			want: Point{X: 15, Y: 25},
		},
		{
			name: "polyline_empty",
			prim: Primitive{Type: "polyline", Points: []Point{}},
			want: Point{X: 0, Y: 0},
		},
		{
			name: "unknown",
			prim: Primitive{Type: "unknown"},
			want: Point{X: 0, Y: 0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getEndPoint(&tt.prim)
			if !approxEqual(got.X, tt.want.X, 0.001) || !approxEqual(got.Y, tt.want.Y, 0.001) {
				t.Errorf("getEndPoint() = (%v, %v), want (%v, %v)", got.X, got.Y, tt.want.X, tt.want.Y)
			}
		})
	}
}

func TestExtractPLCData_AllTypes(t *testing.T) {
	prims := []Primitive{
		{Type: "line", StartX: 0, StartY: 0, EndX: 10, EndY: 10, Layer: "L1"},
		{Type: "arc", CenterX: 5, CenterY: 5, Radius: 3, StartAngle: 0, EndAngle: 90, Layer: "L2"},
		{Type: "circle", CenterX: 20, CenterY: 20, Radius: 5, Layer: "L3"},
		{Type: "polyline", Points: []Point{{X: 0, Y: 0}, {X: 5, Y: 5}}, Layer: "L4"},
	}

	items := extractPLCData(prims)

	if len(items) != 4 {
		t.Fatalf("Expected 4 items, got %d", len(items))
	}

	// Check types
	if items[0].Type != "L" {
		t.Error("Line should have type L")
	}
	if items[1].Type != "A" {
		t.Error("Arc should have type A")
	}
	if items[2].Type != "C" {
		t.Error("Circle should have type C")
	}
	if items[3].Type != "P" {
		t.Error("Polyline should have type P")
	}
}

func TestGetSupportedFormats(t *testing.T) {
	formats := GetSupportedFormats()

	if len(formats) < 1 {
		t.Error("Should have at least one supported format")
	}
	if formats[0] != "AC2000" {
		t.Errorf("First format should be AC2000, got %s", formats[0])
	}
}

func TestExportDXF_AllTypes(t *testing.T) {
	primitives := []Primitive{
		{Type: "line", StartX: 0, StartY: 0, EndX: 100, EndY: 100, Layer: "Lines"},
		{Type: "circle", CenterX: 50, CenterY: 50, Radius: 25, Layer: "Circles"},
		{Type: "arc", CenterX: 25, CenterY: 25, Radius: 10, StartX: 35, StartY: 25, EndX: 25, EndY: 35, Layer: "Arcs"},
		{Type: "polyline", Points: []Point{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}}, Layer: "Polylines"},
		{Type: "polyline", Points: []Point{{X: 0, Y: 0}, {X: 5, Y: 0}, {X: 5, Y: 5}, {X: 0, Y: 5}}, Closed: true, Layer: "ClosedPoly"},
	}

	content, err := ExportDXF(primitives, "AC2000")
	if err != nil {
		t.Fatalf("ExportDXF failed: %v", err)
	}

	if !ValidateContent(content) {
		t.Error("Exported DXF fails validation")
	}
}

func TestExportDXF_ShortPolyline(t *testing.T) {
	primitives := []Primitive{
		{Type: "polyline", Points: []Point{{X: 0, Y: 0}}, Layer: "0"}, // Only 1 point
	}

	content, err := ExportDXF(primitives, "AC2000")
	if err != nil {
		t.Fatalf("ExportDXF failed: %v", err)
	}

	// Should still create valid DXF even with degenerate polyline
	if content == "" {
		t.Error("Should still export something")
	}
}

func TestSmartImport_WithNormalize(t *testing.T) {
	testFile := filepath.Join("..", "..", "..", "DXF", "test_simple.dxf")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("Test DXF file not found: %v", err)
	}

	opts := ImportOptions{
		Normalize:  true,
		ExtractPLC: true,
	}

	result, err := SmartImport(string(content), opts)
	if err != nil {
		t.Fatalf("SmartImport failed: %v", err)
	}

	if result == nil {
		t.Fatal("SmartImport returned nil result")
	}

	// After normalize, bounds should be within 0-100 range
	if result.Bounds != nil {
		maxDim := result.Bounds.MaxX - result.Bounds.MinX
		if h := result.Bounds.MaxY - result.Bounds.MinY; h > maxDim {
			maxDim = h
		}
		if maxDim > 100.1 { // Allow small tolerance
			t.Errorf("After normalize, max dimension should be ~100, got %v", maxDim)
		}
	}
}

func TestOptimizePathOrder_Empty(t *testing.T) {
	result := optimizePathOrder([]Primitive{})
	if len(result) != 0 {
		t.Error("Empty input should return empty result")
	}
}

func TestOptimizePathOrder_Single(t *testing.T) {
	prims := []Primitive{{Type: "line", StartX: 0, StartY: 0, EndX: 10, EndY: 10}}
	result := optimizePathOrder(prims)
	if len(result) != 1 {
		t.Error("Single item should return single item")
	}
}

func TestOptimizePathOrder_WithCircles(t *testing.T) {
	prims := []Primitive{
		{Type: "line", StartX: 0, StartY: 0, EndX: 10, EndY: 0},
		{Type: "circle", CenterX: 100, CenterY: 100, Radius: 5},
		{Type: "arc", CenterX: 50, CenterY: 50, Radius: 10, StartAngle: 0, EndAngle: 90},
	}

	result := optimizePathOrder(prims)
	if len(result) != 3 {
		t.Errorf("Expected 3 primitives, got %d", len(result))
	}
}

func TestRecalculateBounds_Empty(t *testing.T) {
	result := recalculateBounds([]Primitive{})
	if result != nil {
		t.Error("Empty primitives should return nil bounds")
	}
}

func TestUpdateBounds_AllTypes(t *testing.T) {
	b := &Bounds{MinX: 100, MinY: 100, MaxX: -100, MaxY: -100}

	// Line
	updateBounds(b, &Primitive{Type: "line", StartX: 0, StartY: 0, EndX: 50, EndY: 50})
	if b.MinX != 0 || b.MaxX != 50 {
		t.Error("Line bounds not updated correctly")
	}

	// Circle
	b2 := &Bounds{MinX: 100, MinY: 100, MaxX: -100, MaxY: -100}
	updateBounds(b2, &Primitive{Type: "circle", CenterX: 0, CenterY: 0, Radius: 10})
	if b2.MinX != -10 || b2.MaxX != 10 {
		t.Error("Circle bounds not updated correctly")
	}

	// Polyline
	b3 := &Bounds{MinX: 100, MinY: 100, MaxX: -100, MaxY: -100}
	updateBounds(b3, &Primitive{Type: "polyline", Points: []Point{{X: 5, Y: 5}, {X: 15, Y: 25}}})
	if b3.MinX != 5 || b3.MaxX != 15 || b3.MaxY != 25 {
		t.Error("Polyline bounds not updated correctly")
	}
}
