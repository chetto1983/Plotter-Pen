package plc

import (
	"fmt"
	"math"
	"plotter-pen/pkg/geom"
	"slices"
	"strings"
)

// Generator produces PLC commands (L, A, J with 3D interpolation, WAIT)
type Generator struct {
	commands []string
}

// NewGenerator creates a new PLC generator
func NewGenerator() *Generator {
	return &Generator{
		commands: make([]string, 0),
	}
}

// Wait adds delay command in milliseconds
func (g *Generator) Wait(ms int) {
	if ms > 0 {
		g.commands = append(g.commands, fmt.Sprintf("WAIT %d", ms))
	}
}

// Jump (Rapid) to X,Y,Z - 3D interpolation
func (g *Generator) Jump(x, y, z, speed float64) {
	cmd := fmt.Sprintf("J X %.3f, Y %.3f, Z %.3f, V %.3f", x, y, z, speed)
	g.commands = append(g.commands, cmd)
}

// Line (Feed) to X,Y,Z - 3D interpolation
func (g *Generator) Line(x, y, z, speed float64) {
	cmd := fmt.Sprintf("L X %.3f, Y %.3f, Z %.3f, V %.3f", x, y, z, speed)
	g.commands = append(g.commands, cmd)
}

// Arc (Feed) to X,Y,Z via MidPoint (I,J) - 3D interpolation
func (g *Generator) Arc(end geom.Point, center geom.Point, start geom.Point, isCW bool, z, speed float64) {
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

	// A X ... Y ... Z ... I ... J ... V ...
	cmd := fmt.Sprintf("A X %.3f, Y %.3f, Z %.3f, I %.3f, J %.3f, V %.3f", end.X, end.Y, z, midX, midY, speed)
	g.commands = append(g.commands, cmd)
}

// ArcThrough adds an arc to end that passes through the given point, which the PLC reads as I/J.
func (g *Generator) ArcThrough(end, through geom.Point, z, speed float64) {
	cmd := fmt.Sprintf("A X %.3f, Y %.3f, Z %.3f, I %.3f, J %.3f, V %.3f", end.X, end.Y, z, through.X, through.Y, speed)
	g.commands = append(g.commands, cmd)
}

// Lines returns the program one command per element.
func (g *Generator) Lines() []string {
	return slices.Clone(g.commands)
}

// String returns the full PLC program
func (g *Generator) String() string {
	return strings.Join(g.commands, "\n")
}
