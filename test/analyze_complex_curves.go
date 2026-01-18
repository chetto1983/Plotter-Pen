// Analyze what the complex curves produce
package main

import (
	"fmt"
	"os"
	"plotter-pen/pkg/biarc"

	"github.com/yofu/dxf"
	"github.com/yofu/dxf/entity"
)

func main() {
	fmt.Println("=== Analyze Complex Curves (#1 and #5) ===\n")

	content, err := os.ReadFile("DXF/r1zq9qw1/Laser Cut Wooden Earring Blanks Dangle Charms .dxf")
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}

	d, err := dxf.FromStringData(string(content))
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}

	var splines []*entity.Spline
	for _, e := range d.Entities() {
		if spline, ok := e.(*entity.Spline); ok {
			splines = append(splines, spline)
		}
	}

	// Process only splines #1 and #5 (the complex curves)
	for _, idx := range []int{0, 4} {
		spline := splines[idx]
		controls := make([]biarc.Vector2D, len(spline.Controls))
		for j, ctrl := range spline.Controls {
			controls[j] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
		}

		closed := (spline.Flag & 1) != 0
		center, radius, isCircle := biarc.CircleFromPoints(controls, 1.0)

		fmt.Printf("Spline #%d:\n", idx+1)
		fmt.Printf("  Controls: %d, closed=%v\n", len(controls), closed)
		fmt.Printf("  Circle detection: isCircle=%v, center=(%.3f,%.3f), radius=%.3f\n", isCircle, center.X, center.Y, radius)

		// Process through BiArc pipeline
		beziers := biarc.CubicSplineToBeziers(controls, closed)
		var allBulges []biarc.Bulge
		settings := biarc.DefaultSettings()

		for _, bez := range beziers {
			convexSegments := bez.SplitToConvex()
			for _, convex := range convexSegments {
				bulges := biarc.BezierToPolyline(&convex, settings)
				allBulges = append(allBulges, bulges...)
			}
		}

		// Assemble and clean
		chains := biarc.AssembleBulges(allBulges, 0.001)
		var processedBulges []biarc.Bulge
		for _, chain := range chains {
			cleaned := biarc.CleanSmallBulges(chain, settings.MinimumSplineLength)
			linified := biarc.ConvertSmallArcsToLines(cleaned, settings.MinimumArcLength)
			processedBulges = append(processedBulges, linified...)
		}

		// Count arcs vs lines
		arcCount := 0
		lineCount := 0
		for _, bulge := range processedBulges {
			if bulge.IsLine() {
				lineCount++
			} else {
				arcCount++
			}
		}

		fmt.Printf("  → %d Beziers → %d Bulges → %d processed\n", len(beziers), len(allBulges), len(processedBulges))
		fmt.Printf("  → %d arcs + %d lines\n\n", arcCount, lineCount)
	}
}
