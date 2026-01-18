// Package biarc - Recursive Bezier to Polyline conversion
// Based on DXF Plotter C++ implementation (importer/dxf/entityimporter.h)
package biarc

// BezierToPolylineSettings controls conversion quality
type BezierToPolylineSettings struct {
	SplineToArcPrecision float64 // Max BiArc error SQUARED (e.g., 0.001mm²)
	MinimumSplineLength  float64 // Min length before converting to line
	MinimumArcLength     float64 // Min arc length before converting to line
}

// DefaultSettings returns EXACT C++ default values
// From Example/template/config.xml lines 4-8
func DefaultSettings() BezierToPolylineSettings {
	return BezierToPolylineSettings{
		SplineToArcPrecision: 0.001, // 0.001mm² (squared) - EXACT C++ default
		MinimumSplineLength:  0.01,  // 0.01mm minimum curve length
		MinimumArcLength:     0.01,  // 0.01mm minimum arc length
	}
}

// LooseSettings returns loose tolerance for complex curves (smile arcs)
func LooseSettings() BezierToPolylineSettings {
	return BezierToPolylineSettings{
		SplineToArcPrecision: 100.0, // 100mm² - very loose for smile curves
		MinimumSplineLength:  0.01,
		MinimumArcLength:     0.01,
	}
}

// BezierToPolyline converts Bezier to Bulges using recursive splitting
// From entityimporter.h line 178-211
func BezierToPolyline(bez *Bezier, settings BezierToPolylineSettings) []Bulge {
	// Stack-based processing (not queue!)
	stack := []*Bezier{bez}
	var bulges []Bulge

	for len(stack) > 0 {
		// Pop from stack
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		// Check if Bezier is actually a straight line (very strict)
		if current.IsStraightLine(0.001) { // 0.001mm tolerance - only truly straight lines
			bulges = append(bulges, current.ToLine())
			continue
		}

		// Check if curve is too small
		if current.ApproximateLength() < settings.MinimumSplineLength {
			if !current.IsPoint() {
				bulges = append(bulges, current.ToLine())
			}
			continue
		}

		// Try BiArc approximation
		biArc := current.ToBiArc()
		if biArc != nil {
			// Check if BiArc arc length is too small
			if biArc.ApproximateLength() < settings.MinimumArcLength {
				bulges = append(bulges, biArc.ToLinePolyline())
				continue
			}

			// Check approximation error
			error := current.MaxError(biArc)
			if error < settings.SplineToArcPrecision {
				// Good approximation - convert to Bulges
				biArcBulges := biArc.ToPolyline()
				bulges = append(bulges, biArcBulges...)
				continue
			}
		}

		// BiArc failed or error too high - split and retry
		b1, b2 := current.SplitHalf()
		// Push in reverse order (process b1 first)
		stack = append(stack, &b2, &b1)
	}

	return bulges
}
