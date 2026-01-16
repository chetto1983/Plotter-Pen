package plc

import (
	"math"
	"plotter-pen/pkg/geom"
	plcgen "plotter-pen/pkg/plc"
)

// Extractor generates PLC commands from primitives
type Extractor struct {
	gen          *plcgen.Generator
	defaultSpeed float64
	rapidSpeed   float64
	safeZ        float64
	workZ        float64
	waitTime     int
}

// NewExtractor creates a new PLC extractor with the given settings
func NewExtractor(req ExtractRequest) *Extractor {
	// Apply defaults
	defaultSpeed := req.DefaultSpeed
	if defaultSpeed <= 0 {
		defaultSpeed = 100.0
	}
	rapidSpeed := req.RapidSpeed
	if rapidSpeed <= 0 {
		rapidSpeed = 1000.0
	}
	safeZ := req.SafeZ
	if safeZ <= 0 {
		safeZ = 5.0
	}
	workZ := req.WorkZ
	if workZ >= 0 {
		workZ = -2.0
	}

	return &Extractor{
		gen:          plcgen.NewGenerator(),
		defaultSpeed: defaultSpeed,
		rapidSpeed:   rapidSpeed,
		safeZ:        safeZ,
		workZ:        workZ,
		waitTime:     req.WaitTime,
	}
}

// Extract generates PLC commands from the given primitives
func (e *Extractor) Extract(primitives []Primitive) ExtractResponse {
	if len(primitives) == 0 {
		return ExtractResponse{
			Commands: []Command{},
			Output:   []string{},
			Count:    0,
		}
	}

	// Optimize order using nearest-neighbor
	optimized := OptimizeOrder(primitives, geom.Point{X: 0, Y: 0})

	commands := make([]Command, 0)
	idx := 0

	for _, prim := range optimized {
		primCmds := e.extractPrimitive(prim, &idx)
		commands = append(commands, primCmds...)
	}

	// Build output strings
	output := make([]string, len(commands))
	for i, cmd := range commands {
		output[i] = cmd.CommandStr
	}

	return ExtractResponse{
		Commands: commands,
		Output:   output,
		Count:    len(commands),
	}
}

// extractPrimitive generates commands for a single primitive
func (e *Extractor) extractPrimitive(prim Primitive, idx *int) []Command {
	commands := make([]Command, 0)

	switch prim.Type {
	case PrimitiveLine:
		commands = e.extractLine(prim, idx)
	case PrimitiveArc:
		commands = e.extractArc(prim, idx)
	case PrimitiveCircle:
		commands = e.extractCircle(prim, idx)
	case PrimitiveRectangle:
		commands = e.extractRectangle(prim, idx)
	case PrimitivePolygon, PrimitivePolyline:
		commands = e.extractPolyline(prim, idx)
	}

	return commands
}

// extractLine generates commands for a line primitive
func (e *Extractor) extractLine(prim Primitive, idx *int) []Command {
	if prim.X1 == nil || prim.Y1 == nil || prim.X2 == nil || prim.Y2 == nil {
		return nil
	}

	commands := make([]Command, 0, 4)

	// Jump to start at safe Z
	e.gen.Jump(*prim.X1, *prim.Y1, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", prim.ID))

	// Optional wait after rapid
	if e.waitTime > 0 {
		e.gen.Wait(e.waitTime)
		commands = append(commands, e.makeCommand(idx, "WAIT", prim.ID))
	}

	// Plunge to work depth
	e.gen.Line(*prim.X1, *prim.Y1, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "L", prim.ID))

	// Cut to end
	e.gen.Line(*prim.X2, *prim.Y2, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "L", prim.ID))

	// Retract to safe Z
	e.gen.Jump(*prim.X2, *prim.Y2, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", prim.ID))

	return commands
}

// extractArc generates commands for an arc primitive
func (e *Extractor) extractArc(prim Primitive, idx *int) []Command {
	if prim.X1 == nil || prim.Y1 == nil || prim.X2 == nil || prim.Y2 == nil {
		return nil
	}
	if prim.Cx == nil || prim.Cy == nil {
		return nil
	}

	commands := make([]Command, 0, 4)

	start := geom.Point{X: *prim.X1, Y: *prim.Y1}
	end := geom.Point{X: *prim.X2, Y: *prim.Y2}
	center := geom.Point{X: *prim.Cx, Y: *prim.Cy}

	// Jump to start at safe Z
	e.gen.Jump(start.X, start.Y, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", prim.ID))

	// Optional wait after rapid
	if e.waitTime > 0 {
		e.gen.Wait(e.waitTime)
		commands = append(commands, e.makeCommand(idx, "WAIT", prim.ID))
	}

	// Plunge to work depth
	e.gen.Line(start.X, start.Y, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "L", prim.ID))

	// Arc cut
	e.gen.Arc(end, center, start, prim.IsClockwise, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "A", prim.ID))

	// Retract to safe Z
	e.gen.Jump(end.X, end.Y, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", prim.ID))

	return commands
}

// extractCircle generates commands for a circle primitive (full 360 arc)
func (e *Extractor) extractCircle(prim Primitive, idx *int) []Command {
	cx, cy, r := prim.GetCircleParams()
	if r <= 0 {
		return nil
	}

	commands := make([]Command, 0, 5)

	// Start at rightmost point
	startX := cx + r
	startY := cy
	center := geom.Point{X: cx, Y: cy}
	start := geom.Point{X: startX, Y: startY}

	// Jump to start at safe Z
	e.gen.Jump(startX, startY, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", prim.ID))

	// Optional wait after rapid
	if e.waitTime > 0 {
		e.gen.Wait(e.waitTime)
		commands = append(commands, e.makeCommand(idx, "WAIT", prim.ID))
	}

	// Plunge to work depth
	e.gen.Line(startX, startY, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "L", prim.ID))

	// Full circle as CCW arc (end = start for full circle)
	e.gen.Arc(start, center, start, false, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "A", prim.ID))

	// Retract to safe Z
	e.gen.Jump(startX, startY, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", prim.ID))

	return commands
}

// extractRectangle generates commands for a rectangle primitive
func (e *Extractor) extractRectangle(prim Primitive, idx *int) []Command {
	if prim.X == nil || prim.Y == nil || prim.Width == nil || prim.Height == nil {
		return nil
	}

	x, y := *prim.X, *prim.Y
	w, h := *prim.Width, *prim.Height

	// Generate 4 corners
	points := []geom.Point{
		{X: x, Y: y},
		{X: x + w, Y: y},
		{X: x + w, Y: y + h},
		{X: x, Y: y + h},
		{X: x, Y: y}, // Close
	}

	return e.extractPoints(points, true, prim.ID, idx)
}

// extractPolyline generates commands for polygon/polyline primitives
func (e *Extractor) extractPolyline(prim Primitive, idx *int) []Command {
	if len(prim.Points) < 2 {
		return nil
	}

	points := prim.Points
	closed := prim.Type == PrimitivePolygon || prim.Closed

	// Close polygon if needed
	if closed && len(points) > 0 {
		first := points[0]
		last := points[len(points)-1]
		if math.Abs(first.X-last.X) > 0.001 || math.Abs(first.Y-last.Y) > 0.001 {
			points = append(points, first)
		}
	}

	return e.extractPoints(points, closed, prim.ID, idx)
}

// extractPoints generates commands for a sequence of points
func (e *Extractor) extractPoints(points []geom.Point, _ bool, primID string, idx *int) []Command {
	if len(points) < 2 {
		return nil
	}

	commands := make([]Command, 0, len(points)+3)

	// Jump to start at safe Z
	e.gen.Jump(points[0].X, points[0].Y, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", primID))

	// Optional wait after rapid
	if e.waitTime > 0 {
		e.gen.Wait(e.waitTime)
		commands = append(commands, e.makeCommand(idx, "WAIT", primID))
	}

	// Plunge to work depth
	e.gen.Line(points[0].X, points[0].Y, e.workZ, e.defaultSpeed)
	commands = append(commands, e.makeCommand(idx, "L", primID))

	// Cut through all points
	for i := 1; i < len(points); i++ {
		e.gen.Line(points[i].X, points[i].Y, e.workZ, e.defaultSpeed)
		commands = append(commands, e.makeCommand(idx, "L", primID))
	}

	// Retract to safe Z
	last := points[len(points)-1]
	e.gen.Jump(last.X, last.Y, e.safeZ, e.rapidSpeed)
	commands = append(commands, e.makeCommand(idx, "J", primID))

	return commands
}

// makeCommand creates a Command struct and increments the index
func (e *Extractor) makeCommand(idx *int, cmdType, primID string) Command {
	cmds := e.gen.String()
	// Get the last command from the generator
	lines := splitLines(cmds)
	lastLine := ""
	if len(lines) > 0 {
		lastLine = lines[len(lines)-1]
	}

	cmd := Command{
		Index:       *idx,
		Type:        cmdType,
		CommandStr:  lastLine,
		PrimitiveID: primID,
	}
	*idx++
	return cmd
}

// splitLines splits a string by newlines
func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	result := make([]string, 0)
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			if i > start {
				result = append(result, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}
