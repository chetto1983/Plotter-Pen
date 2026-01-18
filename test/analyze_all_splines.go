// Analyze all splines to determine their geometry
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
	fmt.Println("=== Analyze All Splines ===\n")

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

	circles := 0
	arcs := 0
	lines := 0

	for i, spline := range splines {
		controls := make([]biarc.Vector2D, len(spline.Controls))
		for j, ctrl := range spline.Controls {
			controls[j] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
		}

		closed := (spline.Flag & 1) != 0

		// Circle detection with multiple tolerances
		center, radius, _ := biarc.CircleFromPoints(controls, 1.0)

		// Calculate actual max error
		maxError := 0.0
		for _, p := range controls {
			dist := math.Sqrt((p.X-center.X)*(p.X-center.X) + (p.Y-center.Y)*(p.Y-center.Y))
			error := math.Abs(dist - radius)
			if error > maxError {
				maxError = error
			}
		}

		// Calculate approximate length
		totalLength := 0.0
		for j := 0; j < len(controls)-1; j++ {
			dx := controls[j+1].X - controls[j].X
			dy := controls[j+1].Y - controls[j].Y
			totalLength += math.Sqrt(dx*dx + dy*dy)
		}
		if closed && len(controls) > 0 {
			dx := controls[0].X - controls[len(controls)-1].X
			dy := controls[0].Y - controls[len(controls)-1].Y
			totalLength += math.Sqrt(dx*dx + dy*dy)
		}

		// Classify
		isCircle := maxError < 1.0 && closed
		isLine := len(controls) == 2 || (totalLength < 0.1 && maxError > 1.0)
		isArc := !isCircle && !isLine && !closed

		fmt.Printf("Spline #%d: %d controls, closed=%v\n", i+1, len(controls), closed)
		fmt.Printf("  Circle fit: center=(%.3f,%.3f) radius=%.3f error=%.4f\n", center.X, center.Y, radius, maxError)
		fmt.Printf("  Approx length: %.3f\n", totalLength)

		if isCircle {
			fmt.Printf("  → CIRCLE (error < 1mm)\n\n")
			circles++
		} else if isArc {
			fmt.Printf("  → ARC (open curve)\n\n")
			arcs++
		} else if isLine {
			fmt.Printf("  → LINE\n\n")
			lines++
		} else {
			fmt.Printf("  → COMPLEX CURVE\n\n")
		}
	}

	fmt.Printf("=== SUMMARY ===\n")
	fmt.Printf("Circles: %d\n", circles)
	fmt.Printf("Arcs: %d\n", arcs)
	fmt.Printf("Lines: %d\n", lines)
	fmt.Printf("Complex: %d\n", len(splines)-circles-arcs-lines)
	fmt.Printf("Total: %d splines\n", len(splines))
}
