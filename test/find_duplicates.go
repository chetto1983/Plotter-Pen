// Find exact duplicate arcs
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
)

type Primitive struct {
	Type       string  `json:"type"`
	ID         string  `json:"id"`
	Layer      string  `json:"layer"`
	CenterX    float64 `json:"centerX,omitempty"`
	CenterY    float64 `json:"centerY,omitempty"`
	Radius     float64 `json:"radius,omitempty"`
	StartAngle float64 `json:"startAngle,omitempty"`
	EndAngle   float64 `json:"endAngle,omitempty"`
	StartX     float64 `json:"startX,omitempty"`
	StartY     float64 `json:"startY,omitempty"`
	EndX       float64 `json:"endX,omitempty"`
	EndY       float64 `json:"endY,omitempty"`
}

type Output struct {
	Primitives []Primitive `json:"primitives"`
}

func main() {
	fmt.Println("=== Find Exact Duplicate Arcs ===\n")

	data, err := os.ReadFile("test/output/full_pipeline_output.json")
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}

	var output Output
	if err := json.Unmarshal(data, &output); err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}

	fmt.Printf("Total primitives: %d\n\n", len(output.Primitives))

	// Find duplicates
	duplicates := 0
	for i := 0; i < len(output.Primitives); i++ {
		p1 := output.Primitives[i]
		if p1.Type != "arc" {
			continue
		}

		for j := i + 1; j < len(output.Primitives); j++ {
			p2 := output.Primitives[j]
			if p2.Type != "arc" {
				continue
			}

			// Check if arcs are identical (same center, radius, start, end)
			centerDist := math.Sqrt((p1.CenterX-p2.CenterX)*(p1.CenterX-p2.CenterX) +
				(p1.CenterY-p2.CenterY)*(p1.CenterY-p2.CenterY))
			radiusDiff := math.Abs(p1.Radius - p2.Radius)
			startDist := math.Sqrt((p1.StartX-p2.StartX)*(p1.StartX-p2.StartX) +
				(p1.StartY-p2.StartY)*(p1.StartY-p2.StartY))
			endDist := math.Sqrt((p1.EndX-p2.EndX)*(p1.EndX-p2.EndX) +
				(p1.EndY-p2.EndY)*(p1.EndY-p2.EndY))

			if centerDist < 0.001 && radiusDiff < 0.001 && startDist < 0.001 && endDist < 0.001 {
				duplicates++
				if duplicates <= 5 {
					fmt.Printf("DUPLICATE FOUND:\n")
					fmt.Printf("  Arc %s: center=(%.3f,%.3f) r=%.3f start=(%.3f,%.3f) end=(%.3f,%.3f)\n",
						p1.ID, p1.CenterX, p1.CenterY, p1.Radius, p1.StartX, p1.StartY, p1.EndX, p1.EndY)
					fmt.Printf("  Arc %s: center=(%.3f,%.3f) r=%.3f start=(%.3f,%.3f) end=(%.3f,%.3f)\n\n",
						p2.ID, p2.CenterX, p2.CenterY, p2.Radius, p2.StartX, p2.StartY, p2.EndX, p2.EndY)
				}
			}
		}
	}

	if duplicates == 0 {
		fmt.Println("✓ No exact duplicate arcs found")
	} else {
		fmt.Printf("\n⚠ Found %d exact duplicate arcs\n", duplicates)
	}
}
