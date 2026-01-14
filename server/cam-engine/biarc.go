package main

import "math"

const (
	fitPointEpsilon     = 1e-6
	defaultFitTolerance = 1.0
	defaultMinRadius    = 0.5
	defaultMaxRadius    = 50000
	defaultMaxArcPoints = 80
	defaultMaxLinePoints = 50
	defaultMinArcPoints = 6
)

const (
	fitSegmentLine = "line"
	fitSegmentArc  = "arc"
)

type FitOptions struct {
	Tolerance     float64
	MinRadius     float64
	MaxRadius     float64
	MaxArcPoints  int
	MaxLinePoints int
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
	if opts.AllowFullCircle {
		if circleSeg := tryFullCircle(points, opts); circleSeg != nil {
			return []FitSegment{*circleSeg}
		}
	}
	result := make([]FitSegment, 0, len(points))

	for i := 0; i < len(points)-1; {
		bestArcEnd := -1
		var bestCircle circleFit

		if i+defaultMinArcPoints-1 < len(points) {
			maxJ := i + opts.MaxArcPoints
			if maxJ > len(points)-1 {
				maxJ = len(points) - 1
			}

			for j := i + defaultMinArcPoints - 1; j <= maxJ; j++ {
				if !opts.AllowFullCircle && pointsNearlyEqual(points[i], points[j], fitPointEpsilon) {
					continue
				}
				mid := (i + j) / 2
				circle, ok := circleFrom3Points(points[i], points[mid], points[j])
				if !ok || circle.radius < opts.MinRadius || circle.radius > opts.MaxRadius {
					continue
				}

				fits := true
				for k := i; k <= j; k++ {
					dist := distance(points[k], circle.center)
					if math.Abs(dist-circle.radius) > opts.Tolerance {
						fits = false
						break
					}
				}

				if fits {
					bestArcEnd = j
					bestCircle = circle
				}
			}
		}

		if bestArcEnd > i+1 {
			midIndex := (i + bestArcEnd) / 2
			clockwise, ok := arcClockwise(points[i], points[midIndex], bestCircle.center)
			if ok {
				result = append(result, FitSegment{
					Kind:      fitSegmentArc,
					Start:     points[i],
					End:       points[bestArcEnd],
					Center:    bestCircle.center,
					Radius:    bestCircle.radius,
					Clockwise: clockwise,
				})
				i = bestArcEnd
				continue
			}
		}

		lineEnd := i + 1
		maxJ := i + opts.MaxLinePoints
		if maxJ > len(points)-1 {
			maxJ = len(points) - 1
		}
		for j := i + 2; j <= maxJ; j++ {
			fits := true
			start := points[i]
			end := points[j]
			for k := i + 1; k < j; k++ {
				if pointToSegmentDistance(points[k], start, end) > opts.Tolerance {
					fits = false
					break
				}
			}
			if fits {
				lineEnd = j
			} else {
				break
			}
		}

		result = append(result, FitSegment{
			Kind:  fitSegmentLine,
			Start: points[i],
			End:   points[lineEnd],
		})
		i = lineEnd
	}

	return result
}

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
			i := seg.Center.X - seg.Start.X
			j := seg.Center.Y - seg.Start.Y
			f := feed
			if seg.Clockwise {
				gen.G2(seg.End.X, seg.End.Y, nil, &i, &j, &f)
			} else {
				gen.G3(seg.End.X, seg.End.Y, nil, &i, &j, &f)
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
