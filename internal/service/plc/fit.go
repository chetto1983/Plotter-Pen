package plc

import (
    "math"
    "plotter-pen/pkg/geom"
)

type fitSegment struct {
    Type       string
    X1, Y1     float64
    X2, Y2     float64
    Cx, Cy, R  float64
}

type fitCircle struct {
    Cx, Cy, R float64
}

// fitArcsAndLines approximates a point sequence with arcs and lines.
// Ported from src/geometry/biarc.js fitArcsAndLines.
func fitArcsAndLines(points []geom.Point, tolerance float64) []fitSegment {
    if tolerance <= 0 {
        tolerance = 0.05
    }
    minRadius := 0.005
    maxRadius := 1000000.0

    result := []fitSegment{}
    i := 0

    for i < len(points)-1 {
        bestArcEnd := -1
        var bestCircle *fitCircle

        if i+2 < len(points) {
            for j := i + 2; j < len(points) && j < i+350; j++ {
                mid := (i + j) / 2
                circle := circleFromThreePoints(points[i], points[mid], points[j])
                if circle == nil || circle.R < minRadius || circle.R > maxRadius {
                    continue
                }

                fits := true
                for k := i; k <= j; k++ {
                    dist := math.Hypot(points[k].X-circle.Cx, points[k].Y-circle.Cy)
                    if math.Abs(dist-circle.R) > tolerance {
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

        if bestArcEnd > i+1 && bestCircle != nil {
            result = append(result, fitSegment{
                Type: "arc",
                X1:   points[i].X,
                Y1:   points[i].Y,
                X2:   points[bestArcEnd].X,
                Y2:   points[bestArcEnd].Y,
                Cx:   bestCircle.Cx,
                Cy:   bestCircle.Cy,
                R:    bestCircle.R,
            })
            i = bestArcEnd
            continue
        }

        lineEnd := i + 1
        for j := i + 2; j < len(points) && j < i+120; j++ {
            fits := true
            start := points[i]
            end := points[j]
            for k := i + 1; k < j; k++ {
                dist := pointToSegmentDistance(points[k], start, end)
                if dist > tolerance {
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

        result = append(result, fitSegment{
            Type: "line",
            X1:   points[i].X,
            Y1:   points[i].Y,
            X2:   points[lineEnd].X,
            Y2:   points[lineEnd].Y,
        })
        i = lineEnd
    }

    return result
}

func circleFromThreePoints(p1, p2, p3 geom.Point) *fitCircle {
    d := 2 * (p1.X*(p2.Y-p3.Y) + p2.X*(p3.Y-p1.Y) + p3.X*(p1.Y-p2.Y))
    if math.Abs(d) < 1e-6 {
        return nil
    }

    p1Sq := p1.X*p1.X + p1.Y*p1.Y
    p2Sq := p2.X*p2.X + p2.Y*p2.Y
    p3Sq := p3.X*p3.X + p3.Y*p3.Y

    cx := (p1Sq*(p2.Y-p3.Y) + p2Sq*(p3.Y-p1.Y) + p3Sq*(p1.Y-p2.Y)) / d
    cy := (p1Sq*(p3.X-p2.X) + p2Sq*(p1.X-p3.X) + p3Sq*(p2.X-p1.X)) / d
    r := math.Sqrt((p1.X-cx)*(p1.X-cx) + (p1.Y-cy)*(p1.Y-cy))

    if math.IsNaN(r) || math.IsInf(r, 0) || r < 1e-6 {
        return nil
    }

    return &fitCircle{Cx: cx, Cy: cy, R: r}
}

func pointToSegmentDistance(pt, start, end geom.Point) float64 {
    dx := end.X - start.X
    dy := end.Y - start.Y
    lenSq := dx*dx + dy*dy

    if lenSq < 1e-6 {
        return math.Hypot(pt.X-start.X, pt.Y-start.Y)
    }

    t := ((pt.X-start.X)*dx + (pt.Y-start.Y)*dy) / lenSq
    if t < 0 {
        t = 0
    } else if t > 1 {
        t = 1
    }

    projX := start.X + t*dx
    projY := start.Y + t*dy
    return math.Hypot(pt.X-projX, pt.Y-projY)
}
