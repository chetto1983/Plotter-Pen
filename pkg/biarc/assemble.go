// Package biarc - Polyline assembler (chains connected bulges)
// Based on C++ DXF Plotter filter/assembler.cpp
package biarc

import "math"

// AssembleBulges chains connected bulges into continuous polylines
// From Example/src/geometry/filter/assembler.cpp
// Simplified version without KD-tree (O(n²) endpoint matching)
func AssembleBulges(bulges []Bulge, tolerance float64) [][]Bulge {
	if len(bulges) == 0 {
		return nil
	}

	// Track which bulges have been used
	used := make([]bool, len(bulges))
	var chains [][]Bulge

	for i := 0; i < len(bulges); i++ {
		if used[i] {
			continue
		}

		// Start new chain
		chain := []Bulge{bulges[i]}
		used[i] = true

		// Expand chain forward (from end)
		for {
			extended := false
			endPoint := chain[len(chain)-1].End

			for j := 0; j < len(bulges); j++ {
				if used[j] {
					continue
				}

				// Check if bulge j starts where chain ends
				if pointsEqual(endPoint, bulges[j].Start, tolerance) {
					chain = append(chain, bulges[j])
					used[j] = true
					extended = true
					break
				}

				// Check if bulge j ends where chain ends (need to reverse)
				if pointsEqual(endPoint, bulges[j].End, tolerance) {
					reversed := reverseBulge(bulges[j])
					chain = append(chain, reversed)
					used[j] = true
					extended = true
					break
				}
			}

			if !extended {
				break
			}
		}

		// Expand chain backward (from start)
		for {
			extended := false
			startPoint := chain[0].Start

			for j := 0; j < len(bulges); j++ {
				if used[j] {
					continue
				}

				// Check if bulge j ends where chain starts
				if pointsEqual(startPoint, bulges[j].End, tolerance) {
					chain = append([]Bulge{bulges[j]}, chain...)
					used[j] = true
					extended = true
					break
				}

				// Check if bulge j starts where chain starts (need to reverse)
				if pointsEqual(startPoint, bulges[j].Start, tolerance) {
					reversed := reverseBulge(bulges[j])
					chain = append([]Bulge{reversed}, chain...)
					used[j] = true
					extended = true
					break
				}
			}

			if !extended {
				break
			}
		}

		chains = append(chains, chain)
	}

	return chains
}

// reverseBulge reverses a bulge (swap start/end, negate tangent)
// From C++ polyline.invert() logic
func reverseBulge(b Bulge) Bulge {
	return Bulge{
		Start:   b.End,
		End:     b.Start,
		Tangent: -b.Tangent,
	}
}

// CleanSmallBulges removes bulges shorter than minimum length
// From Example/src/geometry/filter/cleaner.cpp PolylineLengthCleaner
func CleanSmallBulges(bulges []Bulge, minimumLength float64) []Bulge {
	if len(bulges) <= 1 {
		return bulges
	}

	cleaned := make([]Bulge, 0, len(bulges))

	for _, bulge := range bulges {
		length := bulge.Length()
		if length >= minimumLength {
			cleaned = append(cleaned, bulge)
		}
	}

	// Ensure at least one bulge remains
	if len(cleaned) == 0 && len(bulges) > 0 {
		return bulges[:1]
	}

	return cleaned
}

// Length calculates bulge length
func (b *Bulge) Length() float64 {
	if b.IsLine() {
		// Straight line
		dx := b.End.X - b.Start.X
		dy := b.End.Y - b.Start.Y
		return math.Sqrt(dx*dx + dy*dy)
	}

	// Arc length = radius × |sweep angle|
	radius := b.ArcRadius()
	_, _, startAngle, endAngle := b.ToArc()
	sweepAngle := endAngle - startAngle

	// Normalize sweep angle
	for sweepAngle > 2*math.Pi {
		sweepAngle -= 2 * math.Pi
	}
	for sweepAngle < -2*math.Pi {
		sweepAngle += 2 * math.Pi
	}

	return radius * math.Abs(sweepAngle)
}

// ConvertSmallArcsToLines converts arcs shorter than minimum to lines
// From Example/src/geometry/filter/cleaner.cpp ArcLengthCleaner
func ConvertSmallArcsToLines(bulges []Bulge, minimumArcLength float64) []Bulge {
	result := make([]Bulge, len(bulges))

	for i, bulge := range bulges {
		if !bulge.IsLine() && bulge.Length() < minimumArcLength {
			// Convert arc to line
			result[i] = Bulge{
				Start:   bulge.Start,
				End:     bulge.End,
				Tangent: 0.0,
			}
		} else {
			result[i] = bulge
		}
	}

	return result
}
