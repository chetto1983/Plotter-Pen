// Debug arc centers to see why merging isn't working
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
	fmt.Println("=== Debug Arc Centers ===\n")

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

	// Process only first spline
	spline := splines[0]
	controls := make([]biarc.Vector2D, len(spline.Controls))
	for i, ctrl := range spline.Controls {
		controls[i] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
	}

	closed := (spline.Flag & 1) != 0
	beziers := biarc.CubicSplineToBeziers(controls, closed)

	settings := biarc.DefaultSettings()
	var allBulges []biarc.Bulge

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

	fmt.Printf("Total bulges: %d\n\n", len(processedBulges))
	fmt.Println("First 10 bulges with arc parameters:")

	for i := 0; i < min(10, len(processedBulges)); i++ {
		bulge := processedBulges[i]
		if bulge.IsLine() {
			fmt.Printf("Bulge %d: LINE\n", i+1)
		} else {
			center, radius, startAngle, endAngle := bulge.ToArc()
			sweepAngle := endAngle - startAngle
			for sweepAngle > 2*math.Pi {
				sweepAngle -= 2 * math.Pi
			}
			for sweepAngle < -2*math.Pi {
				sweepAngle += 2 * math.Pi
			}

			fmt.Printf("Bulge %d: center=(%.4f, %.4f) radius=%.4f sweep=%.2f° tangent=%.4f\n",
				i+1, center.X, center.Y, radius, sweepAngle*180/math.Pi, bulge.Tangent)

			// Check if next bulge has same center/radius
			if i < len(processedBulges)-1 {
				next := processedBulges[i+1]
				if !next.IsLine() {
					nextCenter, nextRadius, _, _ := next.ToArc()
					centerDist := math.Sqrt((center.X-nextCenter.X)*(center.X-nextCenter.X) +
						(center.Y-nextCenter.Y)*(center.Y-nextCenter.Y))
					radiusDiff := math.Abs(radius - nextRadius)

					if centerDist < 0.1 && radiusDiff < 0.1 {
						fmt.Printf("  ✓ MERGEABLE with next (centerDist=%.4f radiusDiff=%.4f)\n", centerDist, radiusDiff)
					} else {
						fmt.Printf("  ✗ NOT mergeable (centerDist=%.4f radiusDiff=%.4f)\n", centerDist, radiusDiff)
					}
				}
			}
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
