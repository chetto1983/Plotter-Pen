package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"time"

	"cam-engine/pkg/clipper"
	"cam-engine/pkg/curve"
	"cam-engine/pkg/gcode"
	"cam-engine/pkg/geom"
	"cam-engine/pkg/plc"
)

// Input Structures (Matching Frontend JSON)
type Input struct {
	Primitives []Primitive `json:"primitives"`
	Type       string      `json:"type"` // "profile" or "pocket"
	Settings   Settings    `json:"settings"`
}

type Primitive struct {
	Type   string       `json:"type"`
	Points []geom.Point `json:"points"` // generic points (Polygon/Polyline/Spline)
	Closed bool         `json:"closed"`

	// Analytic Fields (Line)
	X1 float64 `json:"x1"`
	Y1 float64 `json:"y1"`
	X2 float64 `json:"x2"`
	Y2 float64 `json:"y2"`

	// Analytic Fields (Arc/Circle)
	Cx         float64 `json:"cx"`
	Cy         float64 `json:"cy"`
	Radius     float64 `json:"radius"`
	StartAngle float64 `json:"startAngle"`
	Sweep      float64 `json:"sweep"`
	// ignoring ax, ay, bx, by as they are redundant if we have center/radius/angles
}

type Settings struct {
	ToolDiameter float64 `json:"toolDiameter"`
	FeedXY       float64 `json:"feedRate"`
	FeedZ        float64 `json:"plungeRate"`
	SafetyHeight float64 `json:"safetyHeight"`
	TargetZ      float64 `json:"depth"`
	StepDown     float64 `json:"stepDown"`
	StepOver     float64 `json:"stepOver"` // Fraction of tool diameter (optional)
}

// Response Structure
type Response struct {
	Status    string `json:"status"`
	GCode     string `json:"gcode,omitempty"`
	PlcOutput string `json:"plc_output"` // Removed omitempty to debug
	Error     string `json:"error,omitempty"`
	Stats     string `json:"stats,omitempty"`
}

func main() {
	start := time.Now()

	// 1. Read Input
	inputBytes, err := io.ReadAll(os.Stdin)
	if err != nil {
		fatal("Failed to read stdin: " + err.Error())
	}

	// DEBUG: Write input to file (Keep for robust debugging)
	_ = os.WriteFile("last_run_input.json", inputBytes, 0644)

	var input Input
	if err := json.Unmarshal(inputBytes, &input); err != nil {
		fatal("Invalid JSON: " + err.Error())
	}

	// 2. Setup Generator
	gen := gcode.NewGenerator()
	plcGen := plc.NewGenerator()

	gen.Header()

	// 3. Process Primitives -> Paths
	var paths []geom.Path
	for _, prim := range input.Primitives {
		p := prim.ToPath()
		if p != nil {
			paths = append(paths, p)
		}
	}

	log.Printf("[V2] Processing %d paths via Clipper2...", len(paths))

	// 4. Operation Logic (Switch based on Type)
	toolRadius := input.Settings.ToolDiameter / 2

	// Default StepOver: 40% of Tool Diameter
	stepOver := input.Settings.ToolDiameter * 0.4

	if input.Settings.StepOver > 0 {
		// Treat Input as Percentage (e.g. 40 = 40%)
		stepOver = (input.Settings.StepOver / 100.0) * input.Settings.ToolDiameter
	}

	// Pocketing treats ALL closed paths as a single "Region" to clear (Island Support)
	if input.Type == "pocket" {
		var closedPaths []geom.Path
		for _, path := range paths {
			if path.IsClosed(0.1) {
				closedPaths = append(closedPaths, path)
			}
		}

		if len(closedPaths) > 0 {
			// Generate Pocket Toolpaths (All closed paths together)
			pocketPaths := clipper.GeneratePocket(closedPaths, toolRadius, stepOver)

			// Ensure Closure & Output
			var finalPaths []geom.Path
			for _, p := range pocketPaths {
				finalPaths = append(finalPaths, p.EnsureClosed(0.001))
			}

			// Generate G-Code/PLC for Pocket
			generateToolpath(gen, plcGen, finalPaths, input.Settings)
		}

	} else {
		// Default: PROFILE (Per-Path Offset)
		for _, path := range paths {
			// Classify Open vs Closed
			isClosed := path.IsClosed(0.1) // 0.1mm gap tolerance

			var toolpaths []geom.Path

			if isClosed {
				// Offset Polygon (Profile Outside)
				ps := clipper.OffsetPolygon(path, toolRadius)

				// Ensure Clipper output is explicit closed
				for _, p := range ps {
					toolpaths = append(toolpaths, p.EnsureClosed(0.001))
				}
			} else {
				// Open Path -> Trace
				toolpaths = append(toolpaths, path)
			}

			// Generate Toolpath
			generateToolpath(gen, plcGen, toolpaths, input.Settings)
		}
	}

	gen.Footer()

	plcOut := plcGen.String()
	log.Printf("[V2] PLC Generation Complete. Length: %d chars", len(plcOut))

	duration := time.Since(start)
	resp := Response{
		Status:    "ok",
		GCode:     gen.String(),
		PlcOutput: plcOut,
		Stats:     fmt.Sprintf("Done in %v", duration),
	}

	json.NewEncoder(os.Stdout).Encode(resp)
}

func (prim Primitive) ToPath() geom.Path {
	// Priority 1: Explicit Points (Spline/Polyline)
	if len(prim.Points) > 0 {
		return geom.Path(prim.Points)
	}

	// Priority 2: Analytic Types
	switch prim.Type {
	case "line":
		return geom.Path{
			{X: prim.X1, Y: prim.Y1},
			{X: prim.X2, Y: prim.Y2},
		}
	case "arc":
		return sampleArc(prim.Cx, prim.Cy, prim.Radius, prim.StartAngle, prim.Sweep, 100)
	case "circle":
		return sampleArc(prim.Cx, prim.Cy, prim.Radius, 0, 2*math.Pi, 100)
	}

	return nil
}

func sampleArc(cx, cy, r, startAngle, sweep float64, steps int) geom.Path {
	path := make(geom.Path, 0, steps+1)

	// Handle full circle case robustness
	if math.Abs(sweep) >= 2*math.Pi {
		sweep = 2 * math.Pi
	}

	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		angle := startAngle + t*sweep
		path = append(path, geom.Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		})
	}
	return path
}

func generateToolpath(gen *gcode.Generator, plcGen *plc.Generator, paths []geom.Path, settings Settings) {
	if len(paths) == 0 {
		return
	}

	// Fit Arcs (Greedy JS Logic ported to Go)
	tolerance := 0.01

	for _, rawPath := range paths {
		// Curve Fitting creates a mix of Lines and Arcs
		fitSegments, isArcs := curve.FitSimpleArc(rawPath, tolerance)

		// Z Moves
		gen.RapidZ(settings.SafetyHeight)
		plcGen.ZUp()

		if len(fitSegments) == 0 {
			continue
		}

		start := fitSegments[0][0] // First point of first segment
		gen.RapidXY(start.X, start.Y)
		plcGen.Jump(start.X, start.Y, 1000.0) // Rapid Speed

		gen.FeedZ(settings.TargetZ, settings.FeedZ) // Plunge
		plcGen.ZDown()

		currentPos := start

		for i, seg := range fitSegments {
			end := seg[len(seg)-1] // Last point

			if isArcs[i] {
				// It's an Arc
				center, _, err := curve.LeastSquaresCircle(seg)
				if err != nil {
					// Fallback if circle fit fails conceptually (should not happen if FitSimpleArc returned true)
					gen.FeedXY(end.X, end.Y, settings.FeedXY)
					plcGen.Line(end.X, end.Y, settings.FeedXY)
					currentPos = end
					continue
				}

				// Determine Direction (Cross Product)
				cross := (end.X-seg[0].X)*(center.Y-seg[0].Y) - (end.Y-seg[0].Y)*(center.X-seg[0].X)
				isCCW := cross > 0

				gen.Arc(end, center, currentPos, !isCCW, settings.FeedXY)
				// PLC: Arc(end, center, start, isCW, speed)
				plcGen.Arc(end, center, currentPos, !isCCW, settings.FeedXY)

			} else {
				// It's a Line
				gen.FeedXY(end.X, end.Y, settings.FeedXY)
				plcGen.Line(end.X, end.Y, settings.FeedXY)
			}
			currentPos = end
		}

		gen.RapidZ(settings.SafetyHeight)
		plcGen.ZUp()
	}
}

func fatal(msg string) {
	resp := Response{Status: "error", Error: msg}
	json.NewEncoder(os.Stdout).Encode(resp)
	os.Exit(1)
}
