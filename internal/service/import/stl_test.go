package importservice

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseSTL_RealFile(t *testing.T) {
	testFile := filepath.Join("..", "..", "..", "STL", "Box.stl")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("Test STL file not found: %v", err)
	}

	result, err := ParseSTL(content)
	if err != nil {
		t.Fatalf("ParseSTL failed: %v", err)
	}

	t.Logf("Name: %s", result.Name)
	t.Logf("Triangle count: %d", result.Stats.TriangleCount)
	t.Logf("Surface area: %.2f", result.Stats.SurfaceArea)
	t.Logf("Bounds: (%.2f-%.2f, %.2f-%.2f, %.2f-%.2f)",
		result.Bounds.Min[0], result.Bounds.Max[0],
		result.Bounds.Min[1], result.Bounds.Max[1],
		result.Bounds.Min[2], result.Bounds.Max[2])

	if result.Stats.TriangleCount == 0 {
		t.Error("Expected some triangles")
	}
}

// Simple ASCII STL cube (two triangles for one face)
var testSTLCube = []byte(`solid cube
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 1 1 0
      vertex 1 0 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 1 0
      vertex 1 1 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 1
      vertex 1 0 1
      vertex 1 1 1
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 1
      vertex 1 1 1
      vertex 0 1 1
    endloop
  endfacet
endsolid cube
`)

func TestParseSTL_ASCII(t *testing.T) {
	result, err := ParseSTL(testSTLCube)
	if err != nil {
		t.Fatalf("ParseSTL failed: %v", err)
	}

	if result == nil {
		t.Fatal("ParseSTL returned nil result")
	}

	t.Logf("Name: %s", result.Name)
	t.Logf("Triangle count: %d", result.Stats.TriangleCount)
	t.Logf("Surface area: %.4f", result.Stats.SurfaceArea)
	t.Logf("IsASCII: %v", result.IsASCII)

	if result.Stats.TriangleCount != 4 {
		t.Errorf("Expected 4 triangles, got %d", result.Stats.TriangleCount)
	}

	if !result.IsASCII {
		t.Error("Expected ASCII format detection")
	}

	t.Logf("Bounds Min: (%.2f, %.2f, %.2f)",
		result.Bounds.Min[0], result.Bounds.Min[1], result.Bounds.Min[2])
	t.Logf("Bounds Max: (%.2f, %.2f, %.2f)",
		result.Bounds.Max[0], result.Bounds.Max[1], result.Bounds.Max[2])
}

func TestSTLSliceZ(t *testing.T) {
	result, err := ParseSTL(testSTLCube)
	if err != nil {
		t.Fatalf("ParseSTL failed: %v", err)
	}

	// Slice at z=0.5 (middle of cube)
	slices := STLSliceZ(result, 0.5)

	t.Logf("Found %d line segments at z=0.5", len(slices))

	// Each triangle that crosses z=0.5 should produce a line segment
	// With 4 triangles (2 top, 2 bottom), we should get some intersections
	// at z=0.5 for the side faces
}

func TestSTLTo2D(t *testing.T) {
	result, err := ParseSTL(testSTLCube)
	if err != nil {
		t.Fatalf("ParseSTL failed: %v", err)
	}

	// Generate 5 slices
	primitives := STLTo2D(result, 5)

	t.Logf("Generated %d 2D primitives from 5 slices", len(primitives))

	// Each primitive should be a line
	for i, p := range primitives {
		if p.Type != "line" {
			t.Errorf("Primitive %d: expected 'line', got '%s'", i, p.Type)
		}
	}
}

func TestValidateSTLContent(t *testing.T) {
	tests := []struct {
		name    string
		content []byte
		want    bool
	}{
		{"valid_ascii", []byte("solid test\n"), true},
		{"valid_binary_header", make([]byte, 100), true}, // 100 bytes is enough for binary
		{"too_short", []byte("abc"), false},
		{"empty", []byte{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ValidateSTLContent(tt.content); got != tt.want {
				t.Errorf("ValidateSTLContent() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestTriangleArea(t *testing.T) {
	// Unit triangle with vertices at (0,0,0), (1,0,0), (0,1,0)
	tri := STLTriangle{
		Vertices: [3][3]float64{
			{0, 0, 0},
			{1, 0, 0},
			{0, 1, 0},
		},
	}

	area := triangleArea(tri)
	expectedArea := 0.5 // Area of unit right triangle

	if area < expectedArea-0.001 || area > expectedArea+0.001 {
		t.Errorf("Expected area ~0.5, got %.4f", area)
	}
}

func TestSliceTriangleAtZ(t *testing.T) {
	// Triangle that crosses z=0.5
	tri := STLTriangle{
		Vertices: [3][3]float64{
			{0, 0, 0},   // Below z=0.5
			{1, 0, 1},   // Above z=0.5
			{0.5, 1, 0}, // Below z=0.5
		},
	}

	points := sliceTriangleAtZ(tri, 0.5)

	t.Logf("Intersection points: %v", points)

	// Should have 2 intersection points (one for each edge crossing z=0.5)
	if len(points) != 2 {
		t.Errorf("Expected 2 intersection points, got %d", len(points))
	}
}

func TestParseSTLFile_ValidFile(t *testing.T) {
	testFile := filepath.Join("..", "..", "..", "STL", "Box.stl")
	result, err := ParseSTLFile(testFile)
	if err != nil {
		t.Skipf("Test STL file not found: %v", err)
	}
	if result == nil {
		t.Fatal("ParseSTLFile returned nil result")
	}
	if result.Stats.TriangleCount == 0 {
		t.Error("Expected some triangles")
	}
	t.Logf("Parsed %d triangles from file", result.Stats.TriangleCount)
}

func TestParseSTLFile_InvalidPath(t *testing.T) {
	_, err := ParseSTLFile("/nonexistent/path/to/file.stl")
	if err == nil {
		t.Error("Expected error for invalid path")
	}
}

func TestSTLSliceZ_NoIntersections(t *testing.T) {
	// Triangle entirely above z=0
	result := &STLResult{
		Triangles: []STLTriangle{
			{
				Vertices: [3][3]float64{
					{0, 0, 5},
					{1, 0, 5},
					{0, 1, 5},
				},
			},
		},
	}
	slices := STLSliceZ(result, 0) // Slice at z=0, but triangle is at z=5
	if len(slices) != 0 {
		t.Errorf("Expected 0 slices for non-intersecting triangle, got %d", len(slices))
	}
}

func TestSTLSliceZ_EdgeOnPlane(t *testing.T) {
	// Triangle with one edge exactly on z plane
	result := &STLResult{
		Triangles: []STLTriangle{
			{
				Vertices: [3][3]float64{
					{0, 0, 0},
					{1, 0, 0}, // Edge on z=0
					{0.5, 1, 1},
				},
			},
		},
	}
	slices := STLSliceZ(result, 0)
	t.Logf("Edge on plane slices: %d", len(slices))
}

func TestSTLTo2D_DefaultSliceCount(t *testing.T) {
	result, err := ParseSTL(testSTLCube)
	if err != nil {
		t.Fatalf("ParseSTL failed: %v", err)
	}
	// Pass 0 should default to 10 slices
	primitives := STLTo2D(result, 0)
	t.Logf("Generated %d 2D primitives with default slice count", len(primitives))
}

func TestSTLTo2D_NegativeSliceCount(t *testing.T) {
	result, err := ParseSTL(testSTLCube)
	if err != nil {
		t.Fatalf("ParseSTL failed: %v", err)
	}
	// Negative should default to 10 slices
	primitives := STLTo2D(result, -5)
	t.Logf("Generated %d 2D primitives with negative slice count", len(primitives))
}

func TestSliceTriangleAtZ_ParallelEdge(t *testing.T) {
	// Triangle with an edge parallel to z plane
	tri := STLTriangle{
		Vertices: [3][3]float64{
			{0, 0, 0.5}, // On z=0.5
			{1, 0, 0.5}, // On z=0.5 - edge parallel to z plane
			{0.5, 1, 1}, // Above z=0.5
		},
	}
	points := sliceTriangleAtZ(tri, 0.5)
	t.Logf("Parallel edge intersection points: %d", len(points))
}

func TestSliceTriangleAtZ_AllBelow(t *testing.T) {
	tri := STLTriangle{
		Vertices: [3][3]float64{
			{0, 0, 0},
			{1, 0, 0.1},
			{0.5, 1, 0.2},
		},
	}
	points := sliceTriangleAtZ(tri, 1.0) // Slice above all vertices
	if len(points) != 0 {
		t.Errorf("Expected 0 points for triangle below slice, got %d", len(points))
	}
}

func TestSliceTriangleAtZ_AllAbove(t *testing.T) {
	tri := STLTriangle{
		Vertices: [3][3]float64{
			{0, 0, 2},
			{1, 0, 2.5},
			{0.5, 1, 3},
		},
	}
	points := sliceTriangleAtZ(tri, 1.0) // Slice below all vertices
	if len(points) != 0 {
		t.Errorf("Expected 0 points for triangle above slice, got %d", len(points))
	}
}
