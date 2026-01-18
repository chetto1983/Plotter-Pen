// Full Pipeline Test: SPLINE → Beziers → Bulges → Arcs
// Tests the complete C++ DXF Plotter BiArc algorithm
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"plotter-pen/pkg/biarc"

	"github.com/yofu/dxf"
	"github.com/yofu/dxf/entity"
)

// Primitive matches internal/service/import Primitive struct for JSON output
type Primitive struct {
	Type       string  `json:"type"`
	ID         string  `json:"id,omitempty"`
	Layer      string  `json:"layer,omitempty"`
	StartX     float64 `json:"startX"`
	StartY     float64 `json:"startY"`
	EndX       float64 `json:"endX"`
	EndY       float64 `json:"endY"`
	CenterX    float64 `json:"centerX"`
	CenterY    float64 `json:"centerY"`
	Radius     float64 `json:"radius"`
	StartAngle float64 `json:"startAngle"`
	EndAngle   float64 `json:"endAngle"`
}

type ConversionStats struct {
	SplineCount  int `json:"splineCount"`
	BezierCount  int `json:"bezierCount"`
	BulgeCount   int `json:"bulgeCount"`
	ArcCount     int `json:"arcCount"`
	LineCount    int `json:"lineCount"`
}

func main() {
	fmt.Println("=== Full Pipeline Test: SPLINE → Beziers → Bulges → Arcs ===\n")

	// Read the earring DXF file
	dxfPath := "DXF/r1zq9qw1/Laser Cut Wooden Earring Blanks Dangle Charms .dxf"
	fmt.Printf("Reading DXF: %s\n", dxfPath)

	content, err := os.ReadFile(dxfPath)
	if err != nil {
		fmt.Printf("ERROR: Failed to read DXF file: %v\n", err)
		return
	}

	d, err := dxf.FromStringData(string(content))
	if err != nil {
		fmt.Printf("ERROR: Failed to parse DXF: %v\n", err)
		return
	}

	// Extract all SPLINE entities
	var splines []*entity.Spline
	for _, e := range d.Entities() {
		if spline, ok := e.(*entity.Spline); ok {
			splines = append(splines, spline)
		}
	}

	if len(splines) == 0 {
		fmt.Println("ERROR: No SPLINE entities found in DXF")
		return
	}

	fmt.Printf("Found %d SPLINE entities\n\n", len(splines))

	// Process each spline through the BiArc pipeline
	stats := ConversionStats{}
	var allPrimitives []Primitive
	primitiveID := 0

	// BiArc conversion settings (from C++ entityimporter.h)
	settings := biarc.DefaultSettings() // 0.1mm precision, 0.01mm min lengths

	for i, spline := range splines {
		// Only process cubic splines (degree 3)
		if spline.Degree != 3 {
			fmt.Printf("Spline #%d: Skipping (degree %d, need 3)\n", i+1, spline.Degree)
			continue
		}

		if len(spline.Controls) < 2 {
			fmt.Printf("Spline #%d: Skipping (not enough controls)\n", i+1)
			continue
		}

		stats.SplineCount++

		// Convert control points to Vector2D
		controls := make([]biarc.Vector2D, len(spline.Controls))
		for j, ctrl := range spline.Controls {
			controls[j] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
		}

		closed := (spline.Flag & 1) != 0

		fmt.Printf("Spline #%d: %d controls, closed=%v\n", i+1, len(controls), closed)

		// Step 0: Check if control points form a perfect circle (strict tolerance)
		var allBulges []biarc.Bulge
		center, radius, isCircle := biarc.CircleFromPoints(controls, 0.1) // STRICT 0.1mm for true circles only

		if isCircle && closed {
			// Perfect circle detected - convert directly to 2 semicircular arcs
			fmt.Printf("  → CIRCLE DETECTED: center=(%.3f,%.3f) radius=%.3fmm\n", center.X, center.Y, radius)
			allBulges = biarc.CircleToTwoArcs(center, radius)
			fmt.Printf("  → 2 semicircular arcs (180° each)\n")
		} else {
			// Not a circle - use EXACT C++ BiArc algorithm with default settings
			// Step 1: SPLINE → Beziers (using C++ CubicSpline algorithm)
			beziers := biarc.CubicSplineToBeziers(controls, closed)
			if len(beziers) == 0 {
				fmt.Printf("  → 0 Beziers (failed conversion)\n\n")
				continue
			}
			stats.BezierCount += len(beziers)
			fmt.Printf("  → %d Beziers\n", len(beziers))

			// Step 2: Process each Bezier through BiArc pipeline with C++ EXACT settings
			for _, bez := range beziers {
				// Split to convex segments (inflection point detection)
				convexSegments := bez.SplitToConvex()

				// Convert each convex segment to bulges using recursive splitting
				for _, convex := range convexSegments {
					bulges := biarc.BezierToPolyline(&convex, settings) // Use EXACT C++ defaults
					allBulges = append(allBulges, bulges...)
				}
			}
		}

		var splinePrimitives []Primitive
		var mergedBulges []biarc.Bulge

		if isCircle && closed {
			// Circle already has perfect 2 arcs - skip post-processing
			mergedBulges = allBulges
		} else {
			// Step 3: Assemble connected bulges into chains (C++ Assembler)
			// assembleTolerance = 0.001mm from config.xml
			chains := biarc.AssembleBulges(allBulges, 0.001)
			fmt.Printf("  → %d Bulges assembled into %d chains\n", len(allBulges), len(chains))

			// Step 4: Clean small bulges (C++ Cleaner)
			var processedBulges []biarc.Bulge
			for _, chain := range chains {
				// Clean small bulges (merge into neighbors)
				cleaned := biarc.CleanSmallBulges(chain, settings.MinimumSplineLength)
				// Convert small arcs to lines
				linified := biarc.ConvertSmallArcsToLines(cleaned, settings.MinimumArcLength)
				processedBulges = append(processedBulges, linified...)
			}

			// Step 5: Merge consecutive arcs with same center/radius
			mergedBulges = biarc.MergeBulges(processedBulges)
			fmt.Printf("  → %d Bulges after cleaning\n", len(processedBulges))
			fmt.Printf("  → %d Bulges after merging arcs\n", len(mergedBulges))
		}

		splineBulges := len(mergedBulges)

		// Step 6: Convert merged bulges to arc or line primitives
		for _, bulge := range mergedBulges {
			primitiveID++
			if bulge.IsLine() {
				// Line segment (tangent ≈ 0)
				stats.LineCount++
				splinePrimitives = append(splinePrimitives, Primitive{
					Type:   "line",
					ID:     fmt.Sprintf("arc_%d", primitiveID),
					Layer:  spline.Layer().Name(),
					StartX: round2(bulge.Start.X),
					StartY: round2(bulge.Start.Y),
					EndX:   round2(bulge.End.X),
					EndY:   round2(bulge.End.Y),
				})
			} else {
				// Arc segment
				center, radius, startAngle, endAngle := bulge.ToArc()
				stats.ArcCount++
				splinePrimitives = append(splinePrimitives, Primitive{
					Type:       "arc",
					ID:         fmt.Sprintf("arc_%d", primitiveID),
					Layer:      spline.Layer().Name(),
					CenterX:    round2(center.X),
					CenterY:    round2(center.Y),
					Radius:     round2(radius),
					StartAngle: round2(startAngle * 180 / math.Pi),
					EndAngle:   round2(endAngle * 180 / math.Pi),
					StartX:     round2(bulge.Start.X),
					StartY:     round2(bulge.Start.Y),
					EndX:       round2(bulge.End.X),
					EndY:       round2(bulge.End.Y),
				})
			}
		}

		stats.BulgeCount += splineBulges
		fmt.Printf("  → %d Arc primitives, %d Line primitives\n\n", len(splinePrimitives), stats.LineCount)

		allPrimitives = append(allPrimitives, splinePrimitives...)

		// Show first few arc parameters for verification
		if i < 2 && len(splinePrimitives) > 0 {
			fmt.Printf("  First 3 primitives:\n")
			for j := 0; j < min(3, len(splinePrimitives)); j++ {
				p := splinePrimitives[j]
				if p.Type == "arc" {
					extent := calculateArcExtent(p.StartAngle, p.EndAngle)
					fmt.Printf("    Arc%d: center=(%.3f,%.3f) radius=%.3f extent=%.1f°\n",
						j+1, p.CenterX, p.CenterY, p.Radius, extent)
				} else {
					fmt.Printf("    Line%d: (%.3f,%.3f) → (%.3f,%.3f)\n",
						j+1, p.StartX, p.StartY, p.EndX, p.EndY)
				}
			}
			fmt.Println()
		}
	}

	// Summary
	fmt.Println("=== CONVERSION SUMMARY ===")
	fmt.Printf("Splines processed: %d\n", stats.SplineCount)
	fmt.Printf("Beziers generated: %d\n", stats.BezierCount)
	fmt.Printf("Bulges generated:  %d\n", stats.BulgeCount)
	fmt.Printf("Arc primitives:    %d\n", stats.ArcCount)
	fmt.Printf("Line primitives:   %d\n", stats.LineCount)
	fmt.Printf("Total primitives:  %d\n\n", stats.ArcCount+stats.LineCount)

	// Validate against expected values
	fmt.Println("=== VALIDATION ===")
	validateResults(allPrimitives, stats)

	// Save JSON output
	outputPath := "test/output/full_pipeline_output.json"
	saveJSON(outputPath, allPrimitives, stats)
	fmt.Printf("\nJSON output saved to: %s\n", outputPath)
}

// validateResults checks if results match expected values from plan
func validateResults(primitives []Primitive, stats ConversionStats) {
	// Expected from plan:
	// - 8 splines → ~180 bulges → ~180 primitives
	// - Known arc radii: outer circle ≈ 0.886mm, tiny hole ≈ 0.032mm,
	//   inner circle ≈ 0.392mm, smile arc ≈ 0.621mm

	if stats.SplineCount != 8 {
		fmt.Printf("⚠ WARNING: Expected 8 splines, got %d\n", stats.SplineCount)
	} else {
		fmt.Printf("✓ Spline count: 8 (expected)\n")
	}

	if stats.BulgeCount < 150 || stats.BulgeCount > 200 {
		fmt.Printf("⚠ WARNING: Expected ~180 bulges, got %d\n", stats.BulgeCount)
	} else {
		fmt.Printf("✓ Bulge count: %d (expected ~180)\n", stats.BulgeCount)
	}

	// Group arcs by similar radius to detect circles
	radiusGroups := make(map[float64]int)
	for _, p := range primitives {
		if p.Type == "arc" {
			// Round radius to 2 decimals for grouping
			r := round2(p.Radius)
			radiusGroups[r]++
		}
	}

	fmt.Printf("\nArc radius groups (top 5):\n")
	type radiusCount struct {
		radius float64
		count  int
	}
	var groups []radiusCount
	for r, c := range radiusGroups {
		groups = append(groups, radiusCount{r, c})
	}
	// Sort by count descending
	for i := 0; i < len(groups)-1; i++ {
		for j := i + 1; j < len(groups); j++ {
			if groups[j].count > groups[i].count {
				groups[i], groups[j] = groups[j], groups[i]
			}
		}
	}
	for i := 0; i < min(5, len(groups)); i++ {
		g := groups[i]
		fmt.Printf("  Radius %.3fmm: %d arcs", g.radius, g.count)
		// Check against known values
		if math.Abs(g.radius-0.886) < 0.01 {
			fmt.Printf(" ← outer circle")
		} else if math.Abs(g.radius-0.392) < 0.01 {
			fmt.Printf(" ← inner circle")
		} else if math.Abs(g.radius-0.621) < 0.01 {
			fmt.Printf(" ← smile arc")
		} else if math.Abs(g.radius-0.032) < 0.005 {
			fmt.Printf(" ← tiny hole")
		}
		fmt.Println()
	}
}

// saveJSON writes primitives and stats to JSON file
func saveJSON(path string, primitives []Primitive, stats ConversionStats) {
	// Ensure output directory exists
	os.MkdirAll("test/output", 0755)

	output := struct {
		Primitives []Primitive     `json:"primitives"`
		Stats      ConversionStats `json:"stats"`
	}{
		Primitives: primitives,
		Stats:      stats,
	}

	data, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		fmt.Printf("ERROR: Failed to marshal JSON: %v\n", err)
		return
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		fmt.Printf("ERROR: Failed to write JSON: %v\n", err)
	}
}

// round2 rounds to 2 decimal places
func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// calculateArcExtent calculates arc extent from start/end angles (in degrees)
func calculateArcExtent(startAngle, endAngle float64) float64 {
	extent := endAngle - startAngle
	if extent < 0 {
		extent += 360
	}
	return extent
}

// min returns minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
