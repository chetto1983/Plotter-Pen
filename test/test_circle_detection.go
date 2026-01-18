// Test circle detection on earring splines
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
	fmt.Println("=== Circle Detection Test ===\n")

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

	for i, spline := range splines {
		controls := make([]biarc.Vector2D, len(spline.Controls))
		for j, ctrl := range spline.Controls {
			controls[j] = biarc.Vector2D{X: ctrl[0], Y: ctrl[1]}
		}

		center, radius, isCircle := biarc.CircleFromPoints(controls, 0.01)

		// Calculate actual max error
		maxError := 0.0
		for _, p := range controls {
			dist := math.Sqrt((p.X-center.X)*(p.X-center.X) + (p.Y-center.Y)*(p.Y-center.Y))
			error := math.Abs(dist - radius)
			if error > maxError {
				maxError = error
			}
		}

		fmt.Printf("Spline #%d: %d controls\n", i+1, len(controls))
		fmt.Printf("  Circle fit: center=(%.4f,%.4f) radius=%.4f\n", center.X, center.Y, radius)
		fmt.Printf("  Max error: %.6f mm\n", maxError)
		fmt.Printf("  Is circle (0.01mm tol): %v\n", isCircle)
		fmt.Printf("  Is circle (0.1mm tol): %v\n", maxError < 0.1)
		fmt.Printf("  Is circle (1mm tol): %v\n\n", maxError < 1.0)
	}
}
