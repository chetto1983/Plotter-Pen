// Debug first spline conversion to see where over-splitting occurs
package main

import (
	"fmt"
	"math"
	"os"
	"plotter-pen/pkg/biarc"

	"github.com/yofu/dxf"
	"github.com/yofu/dxf/entity"
)

func main() {
	fmt.Println("=== Debug First Spline Conversion ===\n")

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

	if len(splines) == 0 {
		fmt.Println("No splines found")
		return
	}

	// Process ONLY the first spline
	spline := splines[0]
	fmt.Printf("Spline degree: %d\n", spline.Degree)
	fmt.Printf("Spline controls: %d\n", len(spline.Controls))
	fmt.Printf("Spline closed: %v\n", (spline.Flag & 1) != 0)
	fmt.Println()

	controls := make([]biarc.Vector2D, len(spline.Controls))
	for i, ctrl := range spline.Controls {
		controls[i] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
		fmt.Printf("  Control[%d]: (%.3f, %.3f)\n", i, ctrl[0], ctrl[1])
	}
	fmt.Println()

	closed := (spline.Flag & 1) != 0

	// Step 1: Convert to Beziers
	beziers := biarc.CubicSplineToBeziers(controls, closed)
	fmt.Printf("Step 1: CubicSplineToBeziers produced %d Beziers\n\n", len(beziers))

	// Step 2: Split each Bezier to convex
	var convexBeziers []biarc.Bezier
	for i, bez := range beziers {
		convex := bez.SplitToConvex()
		fmt.Printf("Bezier #%d: SplitToConvex produced %d segments\n", i+1, len(convex))
		convexBeziers = append(convexBeziers, convex...)
	}
	fmt.Printf("\nTotal convex Beziers: %d\n\n", len(convexBeziers))

	// Step 3: Convert each convex Bezier to Bulges
	settings := biarc.DefaultSettings()
	fmt.Printf("Settings:\n")
	fmt.Printf("  SplineToArcPrecision: %.4f (squared)\n", settings.SplineToArcPrecision)
	fmt.Printf("  MinimumSplineLength: %.4f\n", settings.MinimumSplineLength)
	fmt.Printf("  MinimumArcLength: %.4f\n\n", settings.MinimumArcLength)

	totalBulges := 0
	for i, convex := range convexBeziers {
		bulges := biarc.BezierToPolyline(&convex, settings)
		fmt.Printf("ConvexBezier #%d → %d Bulges\n", i+1, len(bulges))
		totalBulges += len(bulges)

		// Show first few bulges
		if i < 3 {
			for j, bulge := range bulges {
				if j >= 3 {
					break
				}
				if bulge.IsLine() {
					fmt.Printf("  Bulge %d: LINE (%.3f,%.3f) → (%.3f,%.3f)\n",
						j+1, bulge.Start.X, bulge.Start.Y, bulge.End.X, bulge.End.Y)
				} else {
					center, radius, _, _ := bulge.ToArc()
					fmt.Printf("  Bulge %d: ARC center=(%.3f,%.3f) radius=%.3f tangent=%.4f\n",
						j+1, center.X, center.Y, radius, bulge.Tangent)
				}
			}
		}
	}

	fmt.Printf("\nTotal Bulges from first spline: %d\n", totalBulges)
	fmt.Printf("Expected: ~1-2 Bulges (for a circle)\n")
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
