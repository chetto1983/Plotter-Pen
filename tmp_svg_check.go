package main

import (
    "fmt"
    "math"
    "os"

    importservice "plotter-pen/internal/service/import"
)

func main() {
    if len(os.Args) < 2 {
        fmt.Println("usage: tmp_svg_check <file>")
        os.Exit(1)
    }
    data, err := os.ReadFile(os.Args[1])
    if err != nil {
        fmt.Println("read error:", err)
        os.Exit(1)
    }

    opts := importservice.SVGImportOptions{
        ImportOptions: importservice.ImportOptions{
            Normalize:    false,
            CenterOrigin: true,
            ScaleFactor:  0,
            ExtractPLC:   false,
            FitArcs:      true,
            ArcTolerance: 0.1,
        },
        FlipY: true,
    }

    result, err := importservice.SmartImportSVG(string(data), opts)
    if err != nil {
        fmt.Println("parse error:", err)
        os.Exit(1)
    }

    var arcCount, lineCount, polyCount, circleCount, rectCount int
    var invalidArcs, hugeArcs, nanPoints int
    var minX, minY, maxX, maxY float64
    minX = math.MaxFloat64
    minY = math.MaxFloat64
    maxX = -math.MaxFloat64
    maxY = -math.MaxFloat64

    for _, p := range result.Primitives {
        switch p.Type {
        case "arc":
            arcCount++
            if !isFinite(p.CenterX) || !isFinite(p.CenterY) || !isFinite(p.Radius) || p.Radius <= 0 {
                invalidArcs++
            }
            if p.Radius > 1_000_000 {
                hugeArcs++
            }
            minX = min(minX, p.CenterX-p.Radius)
            minY = min(minY, p.CenterY-p.Radius)
            maxX = max(maxX, p.CenterX+p.Radius)
            maxY = max(maxY, p.CenterY+p.Radius)
        case "line":
            lineCount++
            minX = min(minX, p.StartX, p.EndX)
            minY = min(minY, p.StartY, p.EndY)
            maxX = max(maxX, p.StartX, p.EndX)
            maxY = max(maxY, p.StartY, p.EndY)
        case "polyline", "polygon":
            polyCount++
            for _, pt := range p.Points {
                if !isFinite(pt.X) || !isFinite(pt.Y) {
                    nanPoints++
                    continue
                }
                minX = min(minX, pt.X)
                minY = min(minY, pt.Y)
                maxX = max(maxX, pt.X)
                maxY = max(maxY, pt.Y)
            }
        case "circle":
            circleCount++
            minX = min(minX, p.CenterX-p.Radius)
            minY = min(minY, p.CenterY-p.Radius)
            maxX = max(maxX, p.CenterX+p.Radius)
            maxY = max(maxY, p.CenterY+p.Radius)
        case "rectangle":
            rectCount++
            minX = min(minX, p.X, p.X+p.Width)
            minY = min(minY, p.Y, p.Y+p.Height)
            maxX = max(maxX, p.X, p.X+p.Width)
            maxY = max(maxY, p.Y, p.Y+p.Height)
        }
    }

    fmt.Printf("primitives=%d arcs=%d lines=%d polys=%d circles=%d rects=%d\n", len(result.Primitives), arcCount, lineCount, polyCount, circleCount, rectCount)
    fmt.Printf("invalidArcs=%d hugeArcs=%d nanPoints=%d\n", invalidArcs, hugeArcs, nanPoints)
    fmt.Printf("bounds: min(%.3f, %.3f) max(%.3f, %.3f)\n", minX, minY, maxX, maxY)
    if result.Bounds != nil {
        fmt.Printf("reported bounds: min(%.3f, %.3f) max(%.3f, %.3f)\n", result.Bounds.MinX, result.Bounds.MinY, result.Bounds.MaxX, result.Bounds.MaxY)
    }
}

func isFinite(v float64) bool {
    return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func min(a float64, rest ...float64) float64 {
    m := a
    for _, v := range rest {
        if v < m {
            m = v
        }
    }
    return m
}

func max(a float64, rest ...float64) float64 {
    m := a
    for _, v := range rest {
        if v > m {
            m = v
        }
    }
    return m
}
