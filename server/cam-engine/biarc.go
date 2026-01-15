package main

import (
	"fmt"
	"math"
)

const (
	fitPointEpsilon      = 1e-6
	defaultFitTolerance  = 0.5
	defaultMinRadius     = 0.05
	defaultMaxRadius     = 1000.0 // 1m max radius, otherwise it's a line
	defaultMaxArcPoints  = 100
	defaultMaxLinePoints = 100
	defaultMinArcPoints  = 4
)

const (
	fitSegmentLine = "line"
	fitSegmentArc  = "arc"
)

type FitOptions struct {
	Tolerance       float64
	MinRadius       float64
	MaxRadius       float64
	MaxArcPoints    int
	MaxLinePoints   int
	AllowFullCircle bool
}

type FitSegment struct {
	Kind      string
	Start     Point
	End       Point
	Center    Point
	Radius    float64
	Clockwise bool
}

type circleFit struct {
	center Point
	radius float64
}

type Circle struct {
	center Point
	radius float64
}

func (o FitOptions) withDefaults() FitOptions {
	if o.Tolerance <= 0 {
		o.Tolerance = defaultFitTolerance
	}
	if o.MinRadius <= 0 {
		o.MinRadius = defaultMinRadius
	}
	if o.MaxRadius <= 0 {
		o.MaxRadius = defaultMaxRadius
	}
	if o.MaxArcPoints <= 0 {
		o.MaxArcPoints = defaultMaxArcPoints
	}
	if o.MaxLinePoints <= 0 {
		o.MaxLinePoints = defaultMaxLinePoints
	}
	return o
}

func normalizeFitPoints(points []Point, closed bool, epsilon float64) []Point {
	if len(points) == 0 {
		return nil
	}

	out := make([]Point, 0, len(points)+1)
	var last Point
	hasLast := false
	limit := epsilon * epsilon

	for _, p := range points {
		if !isFinitePoint(p) {
			continue
		}
		if !hasLast {
			out = append(out, p)
			last = p
			hasLast = true
			continue
		}
		if distanceSquared(p, last) <= limit {
			continue
		}
		out = append(out, p)
		last = p
	}

	if closed && len(out) > 1 {
		first := out[0]
		last := out[len(out)-1]
		if distanceSquared(first, last) > limit {
			out = append(out, first)
		}
	}

	return out
}

func FitArcsAndLines(points []Point, options FitOptions) []FitSegment {
	if len(points) < 2 {
		return nil
	}

	opts := options.withDefaults()

	// 1. Try Full Circle (for Clocks)
	if opts.AllowFullCircle {
		if circleSeg := tryFullCircle(points, opts); circleSeg != nil {
			return []FitSegment{*circleSeg}
		}
	}

	var segments []FitSegment
	startIdx := 0

	// 2. Greedy Linear Scan
	for startIdx < len(points)-1 {
		// We want to find the longest segment starting at startIdx
		// that fits either a Line or an Arc within Tolerance.

		// A. Try Line
		maxLineIdx := startIdx + 1
		for j := startIdx + 2; j < len(points); j++ {
			// Optimization: Check collinearity
			if isLine(points[startIdx:j+1], opts.Tolerance) {
				maxLineIdx = j
			} else {
				break
			}
		}

		// B. Try Arc
		maxArcIdx := startIdx + 1
		var bestCircle *Circle

		// Look ahead constraint
		maxLookahead := startIdx + 200 // Don't scan forever
		if maxLookahead > len(points) {
			maxLookahead = len(points)
		}

		for j := startIdx + 2; j < maxLookahead; j++ {
			// detailed check
			segment := points[startIdx : j+1]

			// Fit 3 points: Start, Mid, End
			midIdx := (startIdx + j) / 2

			// Rejection 0: Points too close
			if distance(points[startIdx], points[midIdx]) < 0.1 || distance(points[midIdx], points[j]) < 0.1 {
				continue // Skip this lookahead
			}

			circle, err := fitCircle3Points(points[startIdx], points[midIdx], points[j])

			if err == nil {
				// 1. Radius check
				if circle.radius >= opts.MinRadius && circle.radius <= opts.MaxRadius {
					// 2. Tolerance check (all points)
					valid := true
					for _, p := range segment {
						d := math.Abs(distance(p, circle.center) - circle.radius)
						if d > opts.Tolerance {
							valid = false
							break
						}
					}

					// 3. Accumulated Sweep check (Prevent loop-the-loop on open paths)
					if valid && !opts.AllowFullCircle {
						totalSweep := getAccumulatedSweep(segment, circle.center)
						// Allow arcs up to 360° (2π), reject only multi-turn spirals
						if totalSweep > 2*math.Pi {
							valid = false
						}
					}

					if valid {
						maxArcIdx = j
						bestCircle = &circle
					} else {
						// Once it fails, it usually doesn't get better for this arc
						break
					}
				} else {
					break // Invalid radius
				}
			} else {
				break // Collinear points (Line wins)
			}
		}

		// Compare winners
		// Prefer Arc only if it is significantly longer or valid
		// Actually, prefer Line if lengths are equal for stability.

		if maxArcIdx > maxLineIdx && bestCircle != nil {
			// Arc Wins
			sPt := points[startIdx]
			ePt := points[maxArcIdx]

			// Determine direction
			clockwise := crossProduct(sPt, ePt, bestCircle.center) < 0
			// Sanity check
			if isClockwise(sPt, points[(startIdx+maxArcIdx)/2], ePt) != clockwise {
				clockwise = !clockwise
			}

			segments = append(segments, FitSegment{
				Kind:      fitSegmentArc,
				Start:     sPt,
				End:       ePt,
				Center:    bestCircle.center,
				Radius:    bestCircle.radius,
				Clockwise: clockwise,
			})
			startIdx = maxArcIdx
		} else {
			// Line Wins
			segments = append(segments, FitSegment{
				Kind:  fitSegmentLine,
				Start: points[startIdx],
				End:   points[maxLineIdx],
			})
			startIdx = maxLineIdx
		}
	}

	return segments
}

// Helpers for Greedy Fitter

func isLine(points []Point, tolerance float64) bool {
	if len(points) < 3 {
		return true
	}
	p1 := points[0]
	p2 := points[len(points)-1]

	// A = y1-y2, B = x2-x1, C = -Ax1 - By1
	A := p1.Y - p2.Y
	B := p2.X - p1.X
	C := -A*p1.X - B*p1.Y
	norm := math.Hypot(A, B)

	if norm < 1e-9 {
		// p1 == p2
		for _, p := range points {
			if distance(p, p1) > tolerance {
				return false
			}
		}
		return true
	}

	for _, p := range points {
		d := math.Abs(A*p.X+B*p.Y+C) / norm
		if d > tolerance {
			return false
		}
	}
	return true
}

func fitCircle3Points(p1, p2, p3 Point) (Circle, error) {
	x1, y1 := p1.X, p1.Y
	x2, y2 := p2.X, p2.Y
	x3, y3 := p3.X, p3.Y

	D := 2 * (x1*(y2-y3) + x2*(y3-y1) + x3*(y1-y2))
	if math.Abs(D) < 1e-7 {
		return Circle{}, fmt.Errorf("collinear")
	}

	Ux := ((x1*x1+y1*y1)*(y2-y3) + (x2*x2+y2*y2)*(y3-y1) + (x3*x3+y3*y3)*(y1-y2)) / D
	Uy := ((x1*x1+y1*y1)*(x3-x2) + (x2*x2+y2*y2)*(x1-x3) + (x3*x3+y3*y3)*(x2-x1)) / D

	c := Point{Ux, Uy}
	r := distance(c, p1)
	return Circle{center: c, radius: r}, nil
}

func isClockwise(p1, p2, p3 Point) bool {
	return (p2.X-p1.X)*(p3.Y-p1.Y)-(p2.Y-p1.Y)*(p3.X-p1.X) < 0
}

func crossProduct(a, b, c Point) float64 {
	return (b.X-a.X)*(c.Y-a.Y) - (b.Y-a.Y)*(c.X-a.X)
}

func getAccumulatedSweep(points []Point, center Point) float64 {
	if len(points) < 2 {
		return 0
	}
	totalSweep := 0.0
	prevAngle := math.Atan2(points[0].Y-center.Y, points[0].X-center.X)

	for i := 1; i < len(points); i++ {
		currAngle := math.Atan2(points[i].Y-center.Y, points[i].X-center.X)
		diff := currAngle - prevAngle
		// Normalize to [-PI, PI]
		for diff <= -math.Pi {
			diff += 2 * math.Pi
		}
		for diff > math.Pi {
			diff -= 2 * math.Pi
		}
		totalSweep += math.Abs(diff)
		prevAngle = currAngle
	}
	return totalSweep
}

// End of Greedy Fitter

func tryFullCircle(points []Point, opts FitOptions) *FitSegment {
	if len(points) < 3 {
		return nil
	}
	if len(points) < 8 {
		return nil
	}
	if !pointsNearlyEqual(points[0], points[len(points)-1], fitPointEpsilon) {
		return nil
	}

	minSeg := math.Inf(1)
	maxSeg := 0.0
	for i := 1; i < len(points); i++ {
		segLen := distance(points[i-1], points[i])
		if segLen < minSeg {
			minSeg = segLen
		}
		if segLen > maxSeg {
			maxSeg = segLen
		}
	}
	if minSeg <= 0 || maxSeg > minSeg*3 {
		return nil
	}

	i1 := len(points) / 3
	i2 := (len(points) * 2) / 3
	if i1 <= 0 || i2 <= 0 || i1 >= len(points) || i2 >= len(points) {
		return nil
	}

	circle, ok := circleFrom3Points(points[0], points[i1], points[i2])
	if !ok || circle.radius < opts.MinRadius || circle.radius > opts.MaxRadius {
		return nil
	}
	if maxSeg > circle.radius*0.5 {
		return nil
	}

	for _, p := range points {
		dist := distance(p, circle.center)
		if math.Abs(dist-circle.radius) > opts.Tolerance {
			return nil
		}
	}

	return &FitSegment{
		Kind:      fitSegmentArc,
		Start:     points[0],
		End:       points[len(points)-1],
		Center:    circle.center,
		Radius:    circle.radius,
		Clockwise: polygonArea(points) < 0,
	}
}

func emitSegments(gen *GCodeGenerator, segments []FitSegment, feed float64) {
	if len(segments) == 0 {
		return
	}

	current := segments[0].Start
	for _, seg := range segments {
		if !pointsNearlyEqual(current, seg.Start, fitPointEpsilon) {
			gen.LinearXY(seg.Start.X, seg.Start.Y, feed)
		}

		switch seg.Kind {
		case fitSegmentArc:
			// Safety: If arc is tiny (start ~= end), output as Line to prevent
			// G-code rounding errors making it look like a Full Circle (Start==End).
			dist := math.Hypot(seg.End.X-seg.Start.X, seg.End.Y-seg.Start.Y)
			if dist < 0.01 {
				gen.LinearXY(seg.End.X, seg.End.Y, feed)
			} else {
				i := seg.Center.X - seg.Start.X
				j := seg.Center.Y - seg.Start.Y
				f := feed
				if seg.Clockwise {
					gen.G2(seg.End.X, seg.End.Y, nil, &i, &j, &f)
				} else {
					gen.G3(seg.End.X, seg.End.Y, nil, &i, &j, &f)
				}
			}
		default:
			gen.LinearXY(seg.End.X, seg.End.Y, feed)
		}
		current = seg.End
	}
}

func arcClockwise(start, mid, center Point) (bool, bool) {
	sx := start.X - center.X
	sy := start.Y - center.Y
	mx := mid.X - center.X
	my := mid.Y - center.Y
	cross := sx*my - sy*mx
	if math.Abs(cross) < 1e-9 {
		return false, false
	}
	return cross < 0, true
}

func circleFrom3Points(p1, p2, p3 Point) (circleFit, bool) {
	d := 2 * (p1.X*(p2.Y-p3.Y) + p2.X*(p3.Y-p1.Y) + p3.X*(p1.Y-p2.Y))
	if math.Abs(d) < fitPointEpsilon {
		return circleFit{}, false
	}

	p1Sq := p1.X*p1.X + p1.Y*p1.Y
	p2Sq := p2.X*p2.X + p2.Y*p2.Y
	p3Sq := p3.X*p3.X + p3.Y*p3.Y

	cx := (p1Sq*(p2.Y-p3.Y) + p2Sq*(p3.Y-p1.Y) + p3Sq*(p1.Y-p2.Y)) / d
	cy := (p1Sq*(p3.X-p2.X) + p2Sq*(p1.X-p3.X) + p3Sq*(p2.X-p1.X)) / d
	r := math.Hypot(p1.X-cx, p1.Y-cy)

	if !isFinite(r) || r < fitPointEpsilon {
		return circleFit{}, false
	}

	return circleFit{
		center: Point{X: cx, Y: cy},
		radius: r,
	}, true
}

func pointToSegmentDistance(p, a, b Point) float64 {
	dx := b.X - a.X
	dy := b.Y - a.Y
	if math.Abs(dx)+math.Abs(dy) < fitPointEpsilon {
		return math.Hypot(p.X-a.X, p.Y-a.Y)
	}

	t := ((p.X-a.X)*dx + (p.Y-a.Y)*dy) / (dx*dx + dy*dy)
	if t <= 0 {
		return math.Hypot(p.X-a.X, p.Y-a.Y)
	}
	if t >= 1 {
		return math.Hypot(p.X-b.X, p.Y-b.Y)
	}

	projX := a.X + t*dx
	projY := a.Y + t*dy
	return math.Hypot(p.X-projX, p.Y-projY)
}

func distance(a, b Point) float64 {
	return math.Hypot(a.X-b.X, a.Y-b.Y)
}

func distanceSquared(a, b Point) float64 {
	dx := a.X - b.X
	dy := a.Y - b.Y
	return dx*dx + dy*dy
}

func pointsNearlyEqual(a, b Point, epsilon float64) bool {
	return distanceSquared(a, b) <= epsilon*epsilon
}

func isFinitePoint(p Point) bool {
	return isFinite(p.X) && isFinite(p.Y)
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
