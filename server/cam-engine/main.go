package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// Input structures
type Primitive struct {
	Type       string  `json:"type"`
	X1         float64 `json:"x1,omitempty"`
	Y1         float64 `json:"y1,omitempty"`
	X2         float64 `json:"x2,omitempty"`
	Y2         float64 `json:"y2,omitempty"`
	Cx         float64 `json:"cx,omitempty"`
	Cy         float64 `json:"cy,omitempty"`
	Radius     float64 `json:"radius,omitempty"`
	StartAngle float64 `json:"startAngle,omitempty"`
	Sweep      float64 `json:"sweep,omitempty"`
	X          float64 `json:"x,omitempty"`
	Y          float64 `json:"y,omitempty"`
	Width      float64 `json:"width,omitempty"`
	Height     float64 `json:"height,omitempty"`
	Points     []Point `json:"points,omitempty"`
	Center     *Point  `json:"center,omitempty"`
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Settings struct {
	ToolDiameter float64 `json:"toolDiameter"`
	StepOver     float64 `json:"stepOver"`
	StartZ       float64 `json:"startZ"`
	TargetZ      float64 `json:"targetZ"`
	StepDown     float64 `json:"stepDown"`
	FeedXY       float64 `json:"feedXY"`
	FeedZ        float64 `json:"feedZ"`
	SpindleRPM   float64 `json:"spindleRPM"`
	SafetyHeight float64 `json:"safetyHeight"`
}

type Input struct {
	Primitives []Primitive `json:"primitives"`
	Type       string      `json:"type"` // "pocket" or "profile"
	Settings   Settings    `json:"settings"`
}

// Output structures
type Stats struct {
	Loops      int   `json:"loops"`
	Operations int   `json:"operations"`
	GcodeLines int   `json:"gcodeLines"`
	ElapsedMs  int64 `json:"elapsedMs"`
}

type Output struct {
	Status string `json:"status"`
	Gcode  string `json:"gcode,omitempty"`
	Stats  Stats  `json:"stats,omitempty"`
	Error  string `json:"error,omitempty"`
}

func log(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "[CAM] "+format+"\n", args...)
}

func main() {
	start := time.Now()
	log("CAM Engine started")

	// Read JSON from stdin
	reader := bufio.NewReader(os.Stdin)
	var input Input
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(&input); err != nil {
		outputError(fmt.Sprintf("Failed to parse input: %v", err))
		return
	}

	log("Received %d primitives, type=%s", len(input.Primitives), input.Type)

	// Apply default settings
	settings := applyDefaults(input.Settings)

	// Build paths from primitives
	log("Building paths...")
	loops, openPaths := buildPaths(input.Primitives)
	log("Found %d loops, %d open paths", len(loops), len(openPaths))

	// Generate G-code based on operation type
	var gcode string
	var opCount int

	switch input.Type {
	case "pocket":
		log("Generating pocket toolpaths...")
		gcode, opCount = generatePockets(loops, settings)
	case "profile":
		log("Generating profile toolpaths...")
		gcode, opCount = generateProfiles(loops, openPaths, settings)
	default:
		outputError(fmt.Sprintf("Unknown operation type: %s", input.Type))
		return
	}

	elapsed := time.Since(start).Milliseconds()
	log("Done in %dms", elapsed)

	// Output result
	output := Output{
		Status: "ok",
		Gcode:  gcode,
		Stats: Stats{
			Loops:      len(loops),
			Operations: opCount,
			GcodeLines: countLines(gcode),
			ElapsedMs:  elapsed,
		},
	}

	encoder := json.NewEncoder(os.Stdout)
	encoder.Encode(output)
}

func outputError(msg string) {
	log("ERROR: %s", msg)
	output := Output{
		Status: "error",
		Error:  msg,
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.Encode(output)
}

func applyDefaults(s Settings) Settings {
	if s.ToolDiameter == 0 {
		s.ToolDiameter = 3.0
	}
	if s.StepOver == 0 {
		s.StepOver = 40.0
	}
	// StartZ defaults to 0 (material surface)
	// TargetZ MUST be negative for cutting - default to -1mm
	if s.TargetZ == 0 {
		s.TargetZ = -1.0
	}
	if s.StepDown == 0 {
		s.StepDown = 1.0
	}
	if s.FeedXY == 0 {
		s.FeedXY = 800.0
	}
	if s.FeedZ == 0 {
		s.FeedZ = 200.0
	}
	if s.SpindleRPM == 0 {
		s.SpindleRPM = 12000.0
	}
	if s.SafetyHeight == 0 {
		s.SafetyHeight = 5.0
	}
	return s
}

func countLines(s string) int {
	count := 1
	for _, c := range s {
		if c == '\n' {
			count++
		}
	}
	return count
}
