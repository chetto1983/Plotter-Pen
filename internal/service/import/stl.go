package importservice

import (
	"bytes"
	"fmt"
	"math"

	"github.com/hschendel/stl"
	"plotter-pen/internal/i18n"
)

// STLTriangle represents a triangle from STL mesh
type STLTriangle struct {
	Normal   [3]float64    `json:"normal"`
	Vertices [3][3]float64 `json:"vertices"`
}

// STLMeasure represents STL bounding box
type STLMeasure struct {
	Min [3]float64 `json:"min"`
	Max [3]float64 `json:"max"`
	Len [3]float64 `json:"len"`
}

// STLResult contains STL parsing results
type STLResult struct {
	Name      string        `json:"name"`
	Triangles []STLTriangle `json:"triangles"`
	Bounds    STLMeasure    `json:"bounds"`
	Stats     STLStats      `json:"stats"`
	IsASCII   bool          `json:"isAscii"`
}

// STLStats contains STL statistics
type STLStats struct {
	TriangleCount int     `json:"triangleCount"`
	SurfaceArea   float64 `json:"surfaceArea"`
	Volume        float64 `json:"volume,omitempty"`
}

// ParseSTL parses STL content and returns mesh data
func ParseSTL(content []byte) (*STLResult, error) {
	reader := bytes.NewReader(content)

	solid, err := stl.ReadAll(reader)
	if err != nil {
		return nil, i18n.Errorf("failed to parse STL: %w", err)
	}

	return stlResult(solid), nil
}

// ParseSTLFile parses STL from file path.
func ParseSTLFile(filepath string) (*STLResult, error) {
	solid, err := stl.ReadFile(filepath)
	if err != nil {
		return nil, i18n.Errorf("failed to read STL file: %w", err)
	}
	return stlResult(solid), nil
}

// stlResult converts either input format without changing vertex order or precision.
func stlResult(solid *stl.Solid) *STLResult {
	result := &STLResult{
		Name:      solid.Name,
		Triangles: make([]STLTriangle, len(solid.Triangles)),
		IsASCII:   solid.IsAscii,
		Stats: STLStats{
			TriangleCount: len(solid.Triangles),
		},
	}

	// Convert triangles
	var totalArea float64
	for i, tri := range solid.Triangles {
		result.Triangles[i] = STLTriangle{
			Normal: [3]float64{
				float64(tri.Normal[0]),
				float64(tri.Normal[1]),
				float64(tri.Normal[2]),
			},
			Vertices: [3][3]float64{
				{float64(tri.Vertices[0][0]), float64(tri.Vertices[0][1]), float64(tri.Vertices[0][2])},
				{float64(tri.Vertices[1][0]), float64(tri.Vertices[1][1]), float64(tri.Vertices[1][2])},
				{float64(tri.Vertices[2][0]), float64(tri.Vertices[2][1]), float64(tri.Vertices[2][2])},
			},
		}
		totalArea += triangleArea(result.Triangles[i])
	}
	result.Stats.SurfaceArea = totalArea

	// Calculate bounds
	measure := solid.Measure()
	result.Bounds = STLMeasure{
		Min: [3]float64{float64(measure.Min[0]), float64(measure.Min[1]), float64(measure.Min[2])},
		Max: [3]float64{float64(measure.Max[0]), float64(measure.Max[1]), float64(measure.Max[2])},
		Len: [3]float64{float64(measure.Len[0]), float64(measure.Len[1]), float64(measure.Len[2])},
	}

	return result
}

// STLSliceZ extracts a 2D slice at a given Z height
func STLSliceZ(result *STLResult, z float64) []Primitive {
	var primitives []Primitive
	idx := 0

	for _, tri := range result.Triangles {
		// Check if triangle intersects with Z plane
		intersections := sliceTriangleAtZ(tri, z)
		if len(intersections) == 2 {
			idx++
			primitives = append(primitives, Primitive{
				Type:   "line",
				ID:     fmt.Sprintf("stl_slice_%d", idx),
				StartX: intersections[0].X,
				StartY: intersections[0].Y,
				EndX:   intersections[1].X,
				EndY:   intersections[1].Y,
			})
		}
	}

	return primitives
}

// sliceTriangleAtZ finds intersection points of triangle with Z plane
func sliceTriangleAtZ(tri STLTriangle, z float64) []Point {
	var points []Point

	// Check each edge for intersection
	edges := [][2]int{{0, 1}, {1, 2}, {2, 0}}

	for _, edge := range edges {
		v0 := tri.Vertices[edge[0]]
		v1 := tri.Vertices[edge[1]]

		z0, z1 := v0[2], v1[2]

		// Check if edge crosses Z plane
		if (z0 <= z && z1 >= z) || (z0 >= z && z1 <= z) {
			if math.Abs(z1-z0) < 1e-10 {
				continue // Edge parallel to Z plane
			}

			t := (z - z0) / (z1 - z0)
			x := v0[0] + t*(v1[0]-v0[0])
			y := v0[1] + t*(v1[1]-v0[1])

			points = append(points, Point{X: x, Y: y})
		}
	}

	return points
}

// triangleArea calculates the area of a triangle
func triangleArea(tri STLTriangle) float64 {
	// Cross product of two edges
	ax := tri.Vertices[1][0] - tri.Vertices[0][0]
	ay := tri.Vertices[1][1] - tri.Vertices[0][1]
	az := tri.Vertices[1][2] - tri.Vertices[0][2]

	bx := tri.Vertices[2][0] - tri.Vertices[0][0]
	by := tri.Vertices[2][1] - tri.Vertices[0][1]
	bz := tri.Vertices[2][2] - tri.Vertices[0][2]

	// Cross product
	cx := ay*bz - az*by
	cy := az*bx - ax*bz
	cz := ax*by - ay*bx

	// Magnitude / 2
	return math.Sqrt(cx*cx+cy*cy+cz*cz) / 2
}

// ValidateSTLContent checks if content looks like valid STL
func ValidateSTLContent(content []byte) bool {
	if len(content) < 5 {
		return false
	}

	// Check for ASCII format first (starts with "solid")
	if string(content[:5]) == "solid" {
		return true
	}

	// Check binary format (needs 84-byte header minimum)
	return len(content) >= 84
}

// STLTo2D converts STL to 2D primitives via Z-slicing
func STLTo2D(result *STLResult, sliceCount int) []Primitive {
	if sliceCount <= 0 {
		sliceCount = 10
	}

	zMin := result.Bounds.Min[2]
	zMax := result.Bounds.Max[2]
	zStep := (zMax - zMin) / float64(sliceCount+1)

	var allPrimitives []Primitive

	for i := 1; i <= sliceCount; i++ {
		z := zMin + float64(i)*zStep
		prims := STLSliceZ(result, z)
		allPrimitives = append(allPrimitives, prims...)
	}

	return allPrimitives
}
