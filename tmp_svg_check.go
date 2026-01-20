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

    maxR := 0.0
    minR := math.MaxFloat64
    var maxCX, maxCY float64
    for _, p := range result.Primitives {
        if p.Type == "arc" {
            if p.Radius > maxR {
                maxR = p.Radius
                maxCX = p.CenterX
                maxCY = p.CenterY
            }
            if p.Radius < minR {
                minR = p.Radius
            }
        }
    }
    fmt.Printf("arcs=%d minR=%.3f maxR=%.3f maxCenter=(%.3f, %.3f)\n", countType(result.Primitives, "arc"), minR, maxR, maxCX, maxCY)
    if result.Bounds != nil {
        fmt.Printf("reported bounds: min(%.3f, %.3f) max(%.3f, %.3f)\n", result.Bounds.MinX, result.Bounds.MinY, result.Bounds.MaxX, result.Bounds.MaxY)
    }
}

func countType(prims []importservice.Primitive, t string) int {
    n := 0
    for _, p := range prims {
        if p.Type == t {
            n++
        }
    }
    return n
}
