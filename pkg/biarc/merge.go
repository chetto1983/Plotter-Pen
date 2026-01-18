// Package biarc - Arc merging operations
package biarc

import "math"

// MergeBulges merges consecutive bulges with same center/radius into larger arcs
func MergeBulges(bulges []Bulge) []Bulge {
	if len(bulges) <= 1 {
		return bulges
	}

	merged := make([]Bulge, 0, len(bulges))
	current := bulges[0]

	for i := 1; i < len(bulges); i++ {
		next := bulges[i]

		// Check if current and next can be merged
		if canMerge(current, next) {
			// Merge: extend current to end at next.End
			current.End = next.End
			// Recalculate tangent for merged arc
			current = recalculateBulge(current)
		} else {
			// Can't merge - save current and start new
			merged = append(merged, current)
			current = next
		}
	}

	// Add final bulge
	merged = append(merged, current)

	return merged
}

// canMerge checks if two consecutive bulges can be merged
func canMerge(b1, b2 Bulge) bool {
	// Skip lines
	if b1.IsLine() || b2.IsLine() {
		return false
	}

	// Check if bulges are connected (b1.End == b2.Start)
	if !pointsEqual(b1.End, b2.Start, 0.01) {
		return false
	}

	// Get arc parameters
	center1, radius1, _, _ := b1.ToArc()
	center2, radius2, _, _ := b2.ToArc()

	// Check if same center and radius (more tolerant)
	if !pointsEqual(center1, center2, 0.1) {
		return false
	}

	if math.Abs(radius1-radius2) > 0.1 {
		return false
	}

	return true
}

// recalculateBulge recalculates bulge tangent from start/end and center
func recalculateBulge(b Bulge) Bulge {
	if b.IsLine() {
		return b
	}

	// Get current arc parameters
	_, _, startAngle, endAngle := b.ToArc()

	// Calculate full sweep angle
	sweepAngle := endAngle - startAngle

	// Normalize to -2π to 2π
	for sweepAngle > 2*math.Pi {
		sweepAngle -= 2 * math.Pi
	}
	for sweepAngle < -2*math.Pi {
		sweepAngle += 2 * math.Pi
	}

	// Bulge tangent = tan(θ/4) where θ is the sweep angle
	newTangent := math.Tan(sweepAngle / 4.0)

	return Bulge{
		Start:   b.Start,
		End:     b.End,
		Tangent: newTangent,
	}
}

// pointsEqual checks if two points are equal within tolerance
func pointsEqual(p1, p2 Vector2D, tolerance float64) bool {
	dx := p1.X - p2.X
	dy := p1.Y - p2.Y
	return math.Sqrt(dx*dx+dy*dy) < tolerance
}
