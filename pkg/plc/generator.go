package plc

import (
	"fmt"
	"math"
	"plotter-pen/pkg/geom"
	"strings"
)

// Generator produces PLC commands (L, A, J, Z_UP, Z_DW)
type Generator struct {
	commands []string
}

// NewGenerator creates a new PLC generator
func NewGenerator() *Generator {
	return &Generator{
		commands: make([]string, 0),
	}
}

// ZUp adds a Z_UP command
func (g *Generator) ZUp() {
	g.commands = append(g.commands, "Z_UP")
}

// ZDown adds a Z_DW command
func (g *Generator) ZDown() {
	g.commands = append(g.commands, "Z_DW")
}

// Jump (Rapid) to X,Y
func (g *Generator) Jump(x, y, speed float64) {
	cmd := fmt.Sprintf("J X %.3f, Y %.3f, V %.3f", x, y, speed)
	g.commands = append(g.commands, cmd)
}

// Line (Feed) to X,Y
func (g *Generator) Line(x, y, speed float64) {
	cmd := fmt.Sprintf("L X %.3f, Y %.3f, V %.3f", x, y, speed)
	g.commands = append(g.commands, cmd)
}

// Arc (Feed) to X,Y via MidPoint (I,J)
func (g *Generator) Arc(end geom.Point, center geom.Point, start geom.Point, isCW bool, speed float64) {
	// Calculate MidPoint (Through-Point)
	radius := center.Distance(start)

	startAngle := math.Atan2(start.Y-center.Y, start.X-center.X)
	endAngle := math.Atan2(end.Y-center.Y, end.X-center.X)

	sweep := endAngle - startAngle

	// Normalize sweep
	pi := 3.141592653589793
	twoPi := 2 * pi

	if isCW {
		// Clockwise: Sweep should be negative
		if sweep > 0 {
			sweep -= twoPi
		}
	} else {
		// Counter-Clockwise: Sweep should be positive
		if sweep < 0 {
			sweep += twoPi
		}
	}

	midAngle := startAngle + sweep/2

	midX := center.X + radius*math.Cos(midAngle)
	midY := center.Y + radius*math.Sin(midAngle)

	// A X ... Y ... I ... J ... V ...
	cmd := fmt.Sprintf("A X %.3f, Y %.3f, I %.3f, J %.3f, V %.3f", end.X, end.Y, midX, midY, speed)
	g.commands = append(g.commands, cmd)
}

// String returns the full PLC program
func (g *Generator) String() string {
	return strings.Join(g.commands, "\n")
}
