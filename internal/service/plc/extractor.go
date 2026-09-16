package plc

import (
	"fmt"
	"math"
	"plotter-pen/pkg/geom"
)

// Extractor generates PLC commands with Z coordinates and optional WAITs.
type Extractor struct {
	defaultSpeed float64
	rapidSpeed   float64
	safeZ        float64
	workZ        float64
	waitTime     int
	precision    int
}

// NewExtractor creates a new PLC extractor with the given settings.
func NewExtractor(req ExtractRequest) *Extractor {
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
	// workZ can be 0 or positive for pen plotters (pen touching/pressing surface)
	waitTime := max(req.WaitTime, 0)

	return &Extractor{
		defaultSpeed: defaultSpeed,
		rapidSpeed:   rapidSpeed,
		safeZ:        safeZ,
		workZ:        workZ,
		waitTime:     waitTime,
		precision:    3,
	}
}

// Extract generates PLC commands from the given primitives.
func (e *Extractor) Extract(primitives []Primitive) ExtractResponse {
	if len(primitives) == 0 {
		return ExtractResponse{Commands: []Command{}, Output: []string{}, Count: 0}
	}

	optimized := OptimizeOrder(primitives, geom.Point{X: 0, Y: 0})

	gen := outputGenerator{
		precision:    e.precision,
		defaultSpeed: e.defaultSpeed,
		rapidSpeed:   e.rapidSpeed,
		safeZ:        e.safeZ,
		workZ:        e.workZ,
		waitTime:     e.waitTime,
	}

	commands := gen.generate(optimized)

	output := make([]string, len(commands))
	for i, cmd := range commands {
		output[i] = cmd.CommandStr
	}

	return ExtractResponse{Commands: commands, Output: output, Count: len(commands)}
}

type outputGenerator struct {
	precision    int
	defaultSpeed float64
	rapidSpeed   float64
	safeZ        float64
	workZ        float64
	waitTime     int
}

func (g *outputGenerator) generate(primitives []Primitive) []Command {
	commands := make([]Command, 0)
	lastPoint := geom.Point{X: 0, Y: 0}

	isFirst := true
	for _, prim := range primitives {
		if !isSupportedPrimitive(prim.Type) {
			continue
		}

		start, ok := primitiveStartXY(prim)
		if !ok {
			continue
		}

		primCmds := g.primitiveToCommands(prim)
		if len(primCmds) == 0 {
			continue
		}

		needsJump := math.Abs(lastPoint.X-start.X) > 0.01 || math.Abs(lastPoint.Y-start.Y) > 0.01

		// Always position for first primitive, or when XY position changes
		if isFirst || needsJump {
			// Raise Z at current position BEFORE moving XY (prevents pen drag)
			// Skip for first primitive since we assume starting at safe height
			if !isFirst {
				pushCommand(&commands, g.jumpCommand(lastPoint.X, lastPoint.Y, g.safeZ, prim.ID))
			}
			// Move XY to start position at safe height
			pushCommand(&commands, g.jumpCommand(start.X, start.Y, g.safeZ, prim.ID))
			// Lower to work height
			pushCommand(&commands, g.lineCommand(start.X, start.Y, g.workZ, prim.ID))
			if g.waitTime > 0 {
				pushCommand(&commands, g.waitCommand(prim.ID))
			}
		}

		for _, cmd := range primCmds {
			pushCommand(&commands, cmd)
		}

		end, ok := primitiveEndXY(prim)
		if !ok {
			end = start
		}
		lastPoint = end
		isFirst = false
	}

	if len(commands) > 0 {
		// Raise Z at last position
		pushCommand(&commands, g.jumpCommand(lastPoint.X, lastPoint.Y, g.safeZ, ""))
		// Return to home position (0,0)
		pushCommand(&commands, g.jumpCommand(0, 0, g.safeZ, ""))
	}

	return commands
}

func (g *outputGenerator) primitiveToCommands(prim Primitive) []Command {
	switch prim.Type {
	case PrimitiveLine:
		if prim.X2 == nil || prim.Y2 == nil {
			return nil
		}
		cmd := Command{
			Type:        "L",
			CommandStr:  fmt.Sprintf("L X %s, Y %s, Z %s, V %s", g.format(*prim.X2), g.format(*prim.Y2), g.format(g.workZ), g.format(g.defaultSpeed)),
			PrimitiveID: prim.ID,
		}
		return []Command{cmd}

	case PrimitiveArc:
		if prim.X2 == nil || prim.Y2 == nil || prim.Cx == nil || prim.Cy == nil {
			return nil
		}
		if prim.ThroughPoint == nil && (prim.X1 == nil || prim.Y1 == nil) {
			return nil
		}
		aux, ok := arcAuxPoint(prim)
		if !ok {
			return nil
		}
		cmd := Command{
			Type:        "A",
			CommandStr:  fmt.Sprintf("A X %s, Y %s, Z %s, I %s, J %s, V %s", g.format(*prim.X2), g.format(*prim.Y2), g.format(g.workZ), g.format(aux.X), g.format(aux.Y), g.format(g.defaultSpeed)),
			PrimitiveID: prim.ID,
		}
		return []Command{cmd}

	case PrimitiveCircle:
		return g.circleToCommands(prim)

	case PrimitiveRectangle:
		if prim.X == nil || prim.Y == nil || prim.Width == nil || prim.Height == nil {
			return nil
		}
		x, y := *prim.X, *prim.Y
		w, h := *prim.Width, *prim.Height
		pts := []geom.Point{
			{X: x, Y: y},
			{X: x + w, Y: y},
			{X: x + w, Y: y + h},
			{X: x, Y: y + h},
			{X: x, Y: y},
		}
		cmds := make([]Command, 0, 4)
		for i := range 4 {
			cmds = append(cmds, Command{
				Type:        "L",
				CommandStr:  fmt.Sprintf("L X %s, Y %s, Z %s, V %s", g.format(pts[i+1].X), g.format(pts[i+1].Y), g.format(g.workZ), g.format(g.defaultSpeed)),
				PrimitiveID: prim.ID,
			})
		}
		return cmds

	case PrimitivePolygon, PrimitivePolyline:
		if len(prim.Points) < 2 {
			return nil
		}
		pts := make([]geom.Point, len(prim.Points))
		copy(pts, prim.Points)
		closed := prim.Type == PrimitivePolygon || prim.Closed
		if closed && len(pts) > 2 {
			pts = append(pts, pts[0])
		}

		// Output simple line commands for each segment (no arc fitting)
		cmds := make([]Command, 0, len(pts)-1)
		for i := 0; i < len(pts)-1; i++ {
			cmds = append(cmds, Command{
				Type:        "L",
				CommandStr:  fmt.Sprintf("L X %s, Y %s, Z %s, V %s", g.format(pts[i+1].X), g.format(pts[i+1].Y), g.format(g.workZ), g.format(g.defaultSpeed)),
				PrimitiveID: prim.ID,
			})
		}
		return cmds
	}

	return nil
}

func (g *outputGenerator) circleToCommands(prim Primitive) []Command {
	cx, cy, r := prim.GetCircleParams()
	if r <= 0 {
		return nil
	}

	startX := cx + r
	startY := cy
	midX := cx - r
	midY := cy

	aux1X := cx
	aux1Y := cy - r
	aux2X := cx
	aux2Y := cy + r

	return []Command{
		{
			Type:        "A",
			CommandStr:  fmt.Sprintf("A X %s, Y %s, Z %s, I %s, J %s, V %s", g.format(midX), g.format(midY), g.format(g.workZ), g.format(aux1X), g.format(aux1Y), g.format(g.defaultSpeed)),
			PrimitiveID: prim.ID,
		},
		{
			Type:        "A",
			CommandStr:  fmt.Sprintf("A X %s, Y %s, Z %s, I %s, J %s, V %s", g.format(startX), g.format(startY), g.format(g.workZ), g.format(aux2X), g.format(aux2Y), g.format(g.defaultSpeed)),
			PrimitiveID: prim.ID,
		},
	}
}

func (g *outputGenerator) format(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return fmt.Sprintf("%.*f", g.precision, 0.0)
	}
	return fmt.Sprintf("%.*f", g.precision, v)
}

func (g *outputGenerator) jumpCommand(x, y, z float64, primID string) Command {
	return Command{
		Type:        "J",
		CommandStr:  fmt.Sprintf("J X %s, Y %s, Z %s, V %s", g.format(x), g.format(y), g.format(z), g.format(g.rapidSpeed)),
		PrimitiveID: primID,
	}
}

func (g *outputGenerator) lineCommand(x, y, z float64, primID string) Command {
	return Command{
		Type:        "L",
		CommandStr:  fmt.Sprintf("L X %s, Y %s, Z %s, V %s", g.format(x), g.format(y), g.format(z), g.format(g.defaultSpeed)),
		PrimitiveID: primID,
	}
}

func (g *outputGenerator) waitCommand(primID string) Command {
	return Command{
		Type:        "WAIT",
		CommandStr:  fmt.Sprintf("WAIT %d", g.waitTime),
		PrimitiveID: primID,
	}
}

func primitiveStartXY(prim Primitive) (geom.Point, bool) {
	switch prim.Type {
	case PrimitiveCircle:
		cx, cy, r := prim.GetCircleParams()
		if r == 0 {
			return geom.Point{}, false
		}
		return geom.Point{X: cx + r, Y: cy}, true
	case PrimitiveRectangle:
		if prim.X == nil || prim.Y == nil {
			return geom.Point{}, false
		}
		return geom.Point{X: *prim.X, Y: *prim.Y}, true
	case PrimitivePolygon, PrimitivePolyline:
		if len(prim.Points) == 0 {
			return geom.Point{}, false
		}
		return geom.Point{X: prim.Points[0].X, Y: prim.Points[0].Y}, true
	default:
		if prim.X1 == nil || prim.Y1 == nil {
			return geom.Point{}, false
		}
		return geom.Point{X: *prim.X1, Y: *prim.Y1}, true
	}
}

func primitiveEndXY(prim Primitive) (geom.Point, bool) {
	switch prim.Type {
	case PrimitiveCircle:
		cx, cy, r := prim.GetCircleParams()
		if r == 0 {
			return geom.Point{}, false
		}
		return geom.Point{X: cx + r, Y: cy}, true
	case PrimitiveRectangle:
		if prim.X == nil || prim.Y == nil {
			return geom.Point{}, false
		}
		return geom.Point{X: *prim.X, Y: *prim.Y}, true
	case PrimitivePolygon:
		if len(prim.Points) == 0 {
			return geom.Point{}, false
		}
		return geom.Point{X: prim.Points[0].X, Y: prim.Points[0].Y}, true
	case PrimitivePolyline:
		if len(prim.Points) == 0 {
			return geom.Point{}, false
		}
		if prim.Closed {
			return geom.Point{X: prim.Points[0].X, Y: prim.Points[0].Y}, true
		}
		last := prim.Points[len(prim.Points)-1]
		return geom.Point{X: last.X, Y: last.Y}, true
	default:
		if prim.X2 == nil || prim.Y2 == nil {
			return geom.Point{}, false
		}
		return geom.Point{X: *prim.X2, Y: *prim.Y2}, true
	}
}

// arcAuxPoint returns the PLC "through point" (I,J) for an A command. Unlike
// G-code, the PLC arc format has no centre offset: I/J is a point the arc
// must pass through, so start+through+end together define the arc. Reports
// ok=false when no point on the arc can be derived from the primitive,
// instead of guessing.
func arcAuxPoint(prim Primitive) (geom.Point, bool) {
	if prim.ThroughPoint != nil {
		return *prim.ThroughPoint, true
	}
	if prim.Cx == nil || prim.Cy == nil || prim.X1 == nil || prim.Y1 == nil {
		return geom.Point{}, false
	}

	cx, cy := *prim.Cx, *prim.Cy
	radius := 0.0
	if prim.Radius != nil {
		radius = *prim.Radius
	}
	if radius == 0 {
		radius = math.Hypot(*prim.X1-cx, *prim.Y1-cy)
	}
	if radius == 0 {
		// Start point coincides with the centre: not a real arc, no point on it exists.
		return geom.Point{}, false
	}

	startAngle := math.Atan2(*prim.Y1-cy, *prim.X1-cx)
	if prim.Sweep != nil {
		midAngle := startAngle + (*prim.Sweep)/2
		return geom.Point{X: cx + radius*math.Cos(midAngle), Y: cy + radius*math.Sin(midAngle)}, true
	}

	// No sweep either: derive the through point as the midpoint of the arc
	// between start and end (same construction as pkg/plc.Generator.Arc),
	// using IsClockwise to pick which of the two possible arcs applies.
	if prim.X2 == nil || prim.Y2 == nil {
		return geom.Point{}, false
	}
	endAngle := math.Atan2(*prim.Y2-cy, *prim.X2-cx)
	sweep := endAngle - startAngle
	if prim.IsClockwise {
		if sweep > 0 {
			sweep -= 2 * math.Pi
		}
	} else if sweep < 0 {
		sweep += 2 * math.Pi
	}
	midAngle := startAngle + sweep/2

	return geom.Point{X: cx + radius*math.Cos(midAngle), Y: cy + radius*math.Sin(midAngle)}, true
}

func pushCommand(commands *[]Command, cmd Command) {
	if len(*commands) > 0 {
		last := (*commands)[len(*commands)-1]
		if last.CommandStr == cmd.CommandStr {
			return
		}
	}
	cmd.Index = len(*commands)
	*commands = append(*commands, cmd)
}

func isSupportedPrimitive(t PrimitiveType) bool {
	switch t {
	case PrimitiveLine, PrimitiveArc, PrimitiveCircle, PrimitiveRectangle, PrimitivePolygon, PrimitivePolyline:
		return true
	default:
		return false
	}
}
