// Test complex drawing - Wall Clock
package main

import (
	"fmt"
	"os"
	"plotter-pen/pkg/biarc"

	"github.com/yofu/dxf"
	"github.com/yofu/dxf/entity"
)

func main() {
	fmt.Println("=== Complex Drawing Test: Wall Clock ===\n")

	dxfPath := "DXF/Laser Cut Modern Love Theme Wall Clock.dxf"
	fmt.Printf("Reading: %s\n\n", dxfPath)

	content, err := os.ReadFile(dxfPath)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}

	d, err := dxf.FromStringData(string(content))
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}

	// Count entity types
	entityTypes := make(map[string]int)
	for _, e := range d.Entities() {
		entityTypes[fmt.Sprintf("%T", e)]++
	}

	fmt.Println("Entity types in DXF:")
	for t, count := range entityTypes {
		fmt.Printf("  %s: %d\n", t, count)
	}

	// Process SPLINEs
	var splines []*entity.Spline
	for _, e := range d.Entities() {
		if spline, ok := e.(*entity.Spline); ok {
			splines = append(splines, spline)
		}
	}

	if len(splines) == 0 {
		fmt.Println("\nNo splines found")
		return
	}

	fmt.Printf("\nProcessing %d SPLINE entities...\n\n", len(splines))

	settings := biarc.DefaultSettings()
	totalArcs := 0
	totalLines := 0
	circlesDetected := 0

	for i, spline := range splines {
		showDetail := i < 10 // Show detail for first 10 only

		controls := make([]biarc.Vector2D, len(spline.Controls))
		for j, ctrl := range spline.Controls {
			controls[j] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
		}

		closed := (spline.Flag & 1) != 0

		// Circle detection (1mm tolerance for all circles)
		_, _, isCircle := biarc.CircleFromPoints(controls, 1.0)

		var bulges []biarc.Bulge

		if isCircle && closed {
			circlesDetected++
			center, radius, _ := biarc.CircleFromPoints(controls, 1.0)
			bulges = biarc.CircleToTwoArcs(center, radius)
			if showDetail {
				fmt.Printf("Spline #%d: CIRCLE (r=%.2fmm) → 2 arcs\n", i+1, radius)
			}
		} else {
			// BiArc conversion
			beziers := biarc.CubicSplineToBeziers(controls, closed)
			for _, bez := range beziers {
				convexSegments := bez.SplitToConvex()
				for _, convex := range convexSegments {
					b := biarc.BezierToPolyline(&convex, settings)
					bulges = append(bulges, b...)
				}
			}

			// Assemble and clean
			chains := biarc.AssembleBulges(bulges, 0.001)
			var processed []biarc.Bulge
			for _, chain := range chains {
				cleaned := biarc.CleanSmallBulges(chain, settings.MinimumSplineLength)
				linified := biarc.ConvertSmallArcsToLines(cleaned, settings.MinimumArcLength)
				processed = append(processed, linified...)
			}
			bulges = processed

			arcs := 0
			lines := 0
			for _, b := range bulges {
				if b.IsLine() {
					lines++
				} else {
					arcs++
				}
			}
			if showDetail {
				fmt.Printf("Spline #%d: %d controls, closed=%v → %d arcs + %d lines\n",
					i+1, len(controls), closed, arcs, lines)
			}
			totalArcs += arcs
			totalLines += lines
		}
	}

	// Add circles to total
	totalArcs += circlesDetected * 2

	fmt.Printf("\n=== SUMMARY ===\n")
	fmt.Printf("Splines: %d\n", len(splines))
	fmt.Printf("Circles detected: %d\n", circlesDetected)
	fmt.Printf("Total arcs: %d\n", totalArcs)
	fmt.Printf("Total lines: %d\n", totalLines)
	fmt.Printf("Total primitives: %d\n", totalArcs+totalLines)
}
