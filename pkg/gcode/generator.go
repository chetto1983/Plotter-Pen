package gcode

import (
	"fmt"
	"plotter-pen/pkg/geom"
	"strings"
)

// Generator builds G-code output
type Generator struct {
	Buffer   strings.Builder
	Decimals int
}

// NewGenerator creates a new G-code generator with 3 decimal precision
func NewGenerator() *Generator {
	return &Generator{Decimals: 3}
}

func (g *Generator) format(f float64) string {
	return fmt.Sprintf("%.*f", g.Decimals, f)
}

// Comment writes a G-code comment
func (g *Generator) Comment(s string) {
	g.Buffer.WriteString(fmt.Sprintf("(%s)\n", s))
}

// Header writes standard G-code header
func (g *Generator) Header() {
	g.Buffer.WriteString("G21 (Metric)\n")
	g.Buffer.WriteString("G90 (Absolute)\n")
	g.Buffer.WriteString("G17 (XY Plane)\n")
	g.Buffer.WriteString("G94 (Feed mm/min)\n")
}

// Footer writes G-code footer
func (g *Generator) Footer() {
	g.Buffer.WriteString("M30 (End)\n")
}

// RapidZ rapid move to Z height
func (g *Generator) RapidZ(z float64) {
	g.Buffer.WriteString(fmt.Sprintf("G0 Z%s\n", g.format(z)))
}

// RapidXY rapid move to XY position
func (g *Generator) RapidXY(x, y float64) {
	g.Buffer.WriteString(fmt.Sprintf("G0 X%s Y%s\n", g.format(x), g.format(y)))
}

// FeedZ linear move to Z with feed rate
func (g *Generator) FeedZ(z, feed float64) {
	g.Buffer.WriteString(fmt.Sprintf("G1 Z%s F%s\n", g.format(z), g.format(feed)))
}

// FeedXY linear move to XY with feed rate
func (g *Generator) FeedXY(x, y, feed float64) {
	g.Buffer.WriteString(fmt.Sprintf("G1 X%s Y%s F%s\n", g.format(x), g.format(y), g.format(feed)))
}

// Dwell emits G4 dwell command (pause in milliseconds)
func (g *Generator) Dwell(ms int) {
	if ms > 0 {
		// G4 P uses seconds in most controllers, convert from ms
		g.Buffer.WriteString(fmt.Sprintf("G4 P%s\n", g.format(float64(ms)/1000.0)))
	}
}

// Arc emits G2 (CW) or G3 (CCW) using I/J notation
func (g *Generator) Arc(end geom.Point, center geom.Point, start geom.Point, cw bool, feed float64) {
	// I, J are relative to Start Point
	i := center.X - start.X
	j := center.Y - start.Y

	cmd := "G3"
	if cw {
		cmd = "G2"
	}

	g.Buffer.WriteString(fmt.Sprintf("%s X%s Y%s I%s J%s F%s\n",
		cmd,
		g.format(end.X), g.format(end.Y),
		g.format(i), g.format(j),
		g.format(feed),
	))
}

// String returns the complete G-code output
func (g *Generator) String() string {
	return g.Buffer.String()
}
