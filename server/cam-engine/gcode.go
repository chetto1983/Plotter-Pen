package main

import (
	"fmt"
	"strings"
)

type GCodeGenerator struct {
	builder  strings.Builder
	settings Settings
	lastX    float64
	lastY    float64
	lastZ    float64
	lastF    float64
}

func NewGCodeGenerator(settings Settings) *GCodeGenerator {
	return &GCodeGenerator{settings: settings, lastZ: settings.SafetyHeight}
}

func (g *GCodeGenerator) String() string { return g.builder.String() }

func (g *GCodeGenerator) Write(format string, args ...any) {
	if len(args) > 0 {
		g.builder.WriteString(fmt.Sprintf(format, args...))
	} else {
		g.builder.WriteString(format)
	}
	g.builder.WriteString("\n")
}

// ==================== MOTION COMMANDS ====================

// G0 - Rapid positioning (non-cutting move)
func (g *GCodeGenerator) G0(x, y, z *float64) {
	parts := []string{"G0"}
	if x != nil {
		parts = append(parts, fmt.Sprintf("X%.3f", *x))
		g.lastX = *x
	}
	if y != nil {
		parts = append(parts, fmt.Sprintf("Y%.3f", *y))
		g.lastY = *y
	}
	if z != nil {
		parts = append(parts, fmt.Sprintf("Z%.3f", *z))
		g.lastZ = *z
	}
	g.Write(strings.Join(parts, " "))
}

// G1 - Linear interpolation (cutting move)
func (g *GCodeGenerator) G1(x, y, z, f *float64) {
	parts := []string{"G1"}
	if x != nil {
		parts = append(parts, fmt.Sprintf("X%.3f", *x))
		g.lastX = *x
	}
	if y != nil {
		parts = append(parts, fmt.Sprintf("Y%.3f", *y))
		g.lastY = *y
	}
	if z != nil {
		parts = append(parts, fmt.Sprintf("Z%.3f", *z))
		g.lastZ = *z
	}
	if f != nil && *f != g.lastF {
		parts = append(parts, fmt.Sprintf("F%.0f", *f))
		g.lastF = *f
	}
	g.Write(strings.Join(parts, " "))
}

// G2 - Circular interpolation CW (clockwise arc)
// R format: G2 X Y R
// IJ format: G2 X Y I J
func (g *GCodeGenerator) G2(x, y float64, r *float64, i, j *float64, f *float64) {
	parts := []string{"G2", fmt.Sprintf("X%.3f", x), fmt.Sprintf("Y%.3f", y)}
	if r != nil {
		parts = append(parts, fmt.Sprintf("R%.3f", *r))
	} else if i != nil && j != nil {
		parts = append(parts, fmt.Sprintf("I%.3f", *i), fmt.Sprintf("J%.3f", *j))
	}
	if f != nil && *f != g.lastF {
		parts = append(parts, fmt.Sprintf("F%.0f", *f))
		g.lastF = *f
	}
	g.Write(strings.Join(parts, " "))
	g.lastX, g.lastY = x, y
}

// G3 - Circular interpolation CCW (counter-clockwise arc)
func (g *GCodeGenerator) G3(x, y float64, r *float64, i, j *float64, f *float64) {
	parts := []string{"G3", fmt.Sprintf("X%.3f", x), fmt.Sprintf("Y%.3f", y)}
	if r != nil {
		parts = append(parts, fmt.Sprintf("R%.3f", *r))
	} else if i != nil && j != nil {
		parts = append(parts, fmt.Sprintf("I%.3f", *i), fmt.Sprintf("J%.3f", *j))
	}
	if f != nil && *f != g.lastF {
		parts = append(parts, fmt.Sprintf("F%.0f", *f))
		g.lastF = *f
	}
	g.Write(strings.Join(parts, " "))
	g.lastX, g.lastY = x, y
}

// G4 - Dwell (pause)
func (g *GCodeGenerator) G4(seconds float64) {
	g.Write("G4 P%.3f", seconds)
}

// ArcIJ emits an arc command using I,J center offsets (industrial-grade)
// I = Center.X - Start.X, J = Center.Y - Start.Y
// clockwise=true emits G2 (CW), clockwise=false emits G3 (CCW)
func (g *GCodeGenerator) ArcIJ(x, y, i, j float64, clockwise bool, feed float64) {
	f := &feed
	iPtr, jPtr := &i, &j
	if clockwise {
		g.G2(x, y, nil, iPtr, jPtr, f)
	} else {
		g.G3(x, y, nil, iPtr, jPtr, f)
	}
}

// ==================== PLANE SELECTION ====================

func (g *GCodeGenerator) G17() { g.Write("G17") } // XY plane
func (g *GCodeGenerator) G18() { g.Write("G18") } // XZ plane
func (g *GCodeGenerator) G19() { g.Write("G19") } // YZ plane

// ==================== UNITS ====================

func (g *GCodeGenerator) G20() { g.Write("G20") } // Inches
func (g *GCodeGenerator) G21() { g.Write("G21") } // Millimeters

// ==================== COORDINATE SYSTEM ====================

func (g *GCodeGenerator) G28()                   { g.Write("G28") } // Return to home
func (g *GCodeGenerator) G28XYZ(x, y, z float64) { g.Write("G28 X%.3f Y%.3f Z%.3f", x, y, z) }
func (g *GCodeGenerator) G30()                   { g.Write("G30") } // Return to secondary home

// ==================== CUTTER COMPENSATION ====================

func (g *GCodeGenerator) G40()      { g.Write("G40") }        // Cancel cutter compensation
func (g *GCodeGenerator) G41()      { g.Write("G41") }        // Cutter compensation left
func (g *GCodeGenerator) G42()      { g.Write("G42") }        // Cutter compensation right
func (g *GCodeGenerator) G43(h int) { g.Write("G43 H%d", h) } // Tool length compensation +
func (g *GCodeGenerator) G44(h int) { g.Write("G44 H%d", h) } // Tool length compensation -
func (g *GCodeGenerator) G49()      { g.Write("G49") }        // Cancel tool length compensation

// ==================== CANNED CYCLES ====================

func (g *GCodeGenerator) G80() { g.Write("G80") } // Cancel canned cycle
func (g *GCodeGenerator) G81(x, y, z, r, f float64) { // Drilling cycle
	g.Write("G81 X%.3f Y%.3f Z%.3f R%.3f F%.0f", x, y, z, r, f)
}
func (g *GCodeGenerator) G82(x, y, z, r, p, f float64) { // Drilling with dwell
	g.Write("G82 X%.3f Y%.3f Z%.3f R%.3f P%.3f F%.0f", x, y, z, r, p, f)
}
func (g *GCodeGenerator) G83(x, y, z, r, q, f float64) { // Peck drilling
	g.Write("G83 X%.3f Y%.3f Z%.3f R%.3f Q%.3f F%.0f", x, y, z, r, q, f)
}

// ==================== POSITIONING MODE ====================

func (g *GCodeGenerator) G90() { g.Write("G90") } // Absolute positioning
func (g *GCodeGenerator) G91() { g.Write("G91") } // Incremental positioning

// ==================== WORK OFFSET ====================

func (g *GCodeGenerator) G54() { g.Write("G54") } // Work offset 1
func (g *GCodeGenerator) G55() { g.Write("G55") } // Work offset 2
func (g *GCodeGenerator) G56() { g.Write("G56") } // Work offset 3
func (g *GCodeGenerator) G57() { g.Write("G57") } // Work offset 4
func (g *GCodeGenerator) G58() { g.Write("G58") } // Work offset 5
func (g *GCodeGenerator) G59() { g.Write("G59") } // Work offset 6

func (g *GCodeGenerator) G92(x, y, z *float64) { // Set position
	parts := []string{"G92"}
	if x != nil {
		parts = append(parts, fmt.Sprintf("X%.3f", *x))
	}
	if y != nil {
		parts = append(parts, fmt.Sprintf("Y%.3f", *y))
	}
	if z != nil {
		parts = append(parts, fmt.Sprintf("Z%.3f", *z))
	}
	g.Write(strings.Join(parts, " "))
}

// ==================== SPINDLE ====================

func (g *GCodeGenerator) M3(rpm float64) { g.Write("M3 S%.0f", rpm) } // Spindle CW
func (g *GCodeGenerator) M4(rpm float64) { g.Write("M4 S%.0f", rpm) } // Spindle CCW
func (g *GCodeGenerator) M5()            { g.Write("M5") }            // Spindle stop

// ==================== COOLANT ====================

func (g *GCodeGenerator) M7() { g.Write("M7") } // Mist coolant on
func (g *GCodeGenerator) M8() { g.Write("M8") } // Flood coolant on
func (g *GCodeGenerator) M9() { g.Write("M9") } // Coolant off

// ==================== TOOL ====================

func (g *GCodeGenerator) M6(tool int) { g.Write("M6 T%d", tool) } // Tool change
func (g *GCodeGenerator) T(tool int)  { g.Write("T%d", tool) }    // Tool select

// ==================== PROGRAM ====================

func (g *GCodeGenerator) M0()  { g.Write("M0") }  // Program stop (wait for resume)
func (g *GCodeGenerator) M1()  { g.Write("M1") }  // Optional stop
func (g *GCodeGenerator) M2()  { g.Write("M2") }  // Program end
func (g *GCodeGenerator) M30() { g.Write("M30") } // Program end and rewind

// ==================== HELPERS ====================

func (g *GCodeGenerator) Comment(format string, args ...any) {
	g.Write("; "+format, args...)
}

func (g *GCodeGenerator) WriteLine(format string, args ...any) {
	g.Write(format, args...)
}

func (g *GCodeGenerator) Raw(line string) {
	g.builder.WriteString(line)
	g.builder.WriteString("\n")
}

// WriteHeader writes standard preamble
func (g *GCodeGenerator) WriteHeader() {
	g.G90()
	g.G21()
	g.G17()
	if g.settings.SpindleRPM > 0 {
		g.M3(g.settings.SpindleRPM)
	}
	z := g.settings.SafetyHeight
	g.G0(nil, nil, &z)
}

// WriteFooter writes standard epilogue
func (g *GCodeGenerator) WriteFooter() {
	z := g.settings.SafetyHeight
	g.G0(nil, nil, &z)
	g.M5()
	g.M30()
}

// Convenience methods for common operations
func (g *GCodeGenerator) RapidZ(z float64)          { g.G0(nil, nil, &z) }
func (g *GCodeGenerator) RapidXY(x, y float64)      { g.G0(&x, &y, nil) }
func (g *GCodeGenerator) LinearZ(z, f float64)      { g.G1(nil, nil, &z, &f) }
func (g *GCodeGenerator) LinearXY(x, y, f float64)  { g.G1(&x, &y, nil, &f) }
func (g *GCodeGenerator) ArcCW(x, y, r, f float64)  { g.G2(x, y, &r, nil, nil, &f) }
func (g *GCodeGenerator) ArcCCW(x, y, r, f float64) { g.G3(x, y, &r, nil, nil, &f) }

// FullCircle generates a complete 360° circle using I/J format
// Must be at starting position (cx+radius, cy) before calling
// clockwise=true uses G2 (CW), clockwise=false uses G3 (CCW)
func (g *GCodeGenerator) FullCircle(cx, cy, radius float64, clockwise bool, feed float64) {
	// I/J are offsets from current position to center
	// Current position: (cx+radius, cy), Center: (cx, cy)
	// So I = -radius, J = 0
	i := -radius
	j := 0.0
	// End point is same as start for full circle
	endX := cx + radius
	endY := cy
	if clockwise {
		g.G2(endX, endY, nil, &i, &j, &feed)
	} else {
		g.G3(endX, endY, nil, &i, &j, &feed)
	}
}
