package gcode

import (
	"cam-engine/pkg/geom"
	"fmt"
	"strings"
)

type Generator struct {
	Buffer   strings.Builder
	Decimals int
}

func NewGenerator() *Generator {
	return &Generator{Decimals: 3}
}

func (g *Generator) format(f float64) string {
	return fmt.Sprintf("%.*f", g.Decimals, f)
}

func (g *Generator) Comment(s string) {
	g.Buffer.WriteString(fmt.Sprintf("(%s)\n", s))
}

func (g *Generator) Header() {
	g.Buffer.WriteString("G21 (Metric)\n")
	g.Buffer.WriteString("G90 (Absolute)\n")
	g.Buffer.WriteString("G17 (XY Plane)\n")
	g.Buffer.WriteString("G94 (Feed mm/min)\n")
}

func (g *Generator) Footer() {
	g.Buffer.WriteString("M30 (End)\n")
}

func (g *Generator) RapidZ(z float64) {
	g.Buffer.WriteString(fmt.Sprintf("G0 Z%s\n", g.format(z)))
}

func (g *Generator) RapidXY(x, y float64) {
	g.Buffer.WriteString(fmt.Sprintf("G0 X%s Y%s\n", g.format(x), g.format(y)))
}

func (g *Generator) FeedZ(z, feed float64) {
	g.Buffer.WriteString(fmt.Sprintf("G1 Z%s F%s\n", g.format(z), g.format(feed)))
}

func (g *Generator) FeedXY(x, y, feed float64) {
	g.Buffer.WriteString(fmt.Sprintf("G1 X%s Y%s F%s\n", g.format(x), g.format(y), g.format(feed)))
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

	// Validate Radius Check?
	// r1 := math.Hypot(i, j)
	// r2 := center.Distance(end)
	// If mismatch is huge, machine errors. But our Fit logic ensures fit.

	g.Buffer.WriteString(fmt.Sprintf("%s X%s Y%s I%s J%s F%s\n",
		cmd,
		g.format(end.X), g.format(end.Y),
		g.format(i), g.format(j),
		g.format(feed),
	))
}

func (g *Generator) String() string {
	return g.Buffer.String()
}
