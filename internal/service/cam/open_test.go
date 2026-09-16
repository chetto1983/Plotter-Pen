package cam

import (
	"errors"
	"math"
	"slices"
	"strings"
	"testing"

	"plotter-pen/internal/i18n"
	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
)

func mustChainWithin(t *testing.T, closeGap float64, prims ...plc.Primitive) Contours {
	t.Helper()
	c, err := Chain(prims, closeGap)
	if err != nil {
		t.Fatalf("Chain: %v", err)
	}
	return c
}

func namedLine(id string, x1, y1, x2, y2 float64) plc.Primitive {
	p := lineP(x1, y1, x2, y2)
	p.ID = id
	return p
}

// gappedTriangle is three lines with a gap of the given width where the second one starts.
func gappedTriangle(gap float64) []plc.Primitive {
	return []plc.Primitive{
		namedLine("a", 0, 0, 10, 0),
		namedLine("b", 10+gap, 0, 0, 10),
		namedLine("c", 0, 10, 0, 0),
	}
}

func sameFloat(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

// A gap wider than a joint but within the closing gap is bridged by a straight edge: every point
// of the drawing stays where it was, and the contour names all its primitives.
func TestChain_ClosesAGapWithinTheClosingGap(t *testing.T) {
	c := mustChainWithin(t, 0.05, gappedTriangle(0.04)...)

	requirePaths(t, "closed", c.Closed, []geom.Path{{{X: 10, Y: 0}, {X: 0, Y: 0}, {X: 0, Y: 10}, {X: 10.04, Y: 0}}})
	requirePaths(t, "open", c.Open, nil)
	ids := slices.Clone(c.ClosedIDs[0])
	slices.Sort(ids)
	if !slices.Equal(ids, []string{"a", "b", "c"}) {
		t.Fatalf("closed contour made of %v, want a, b and c", c.ClosedIDs[0])
	}
}

// A narrower closing gap leaves the contour open, and says what gap would close it.
func TestChain_OpenContourSaysTheGapThatClosesIt(t *testing.T) {
	c := mustChainWithin(t, 0.03, gappedTriangle(0.04)...)

	if len(c.Closed) != 0 || len(c.Open) != 1 {
		t.Fatalf("got %d closed, %d open; want 1 open", len(c.Closed), len(c.Open))
	}
	if !sameFloat(c.OpenGaps[0], 0.04) {
		t.Fatalf("gap %v, want 0.04", c.OpenGaps[0])
	}
	ids := slices.Clone(c.OpenIDs[0])
	slices.Sort(ids)
	if !slices.Equal(ids, []string{"a", "b", "c"}) {
		t.Fatalf("open contour made of %v, want a, b and c", c.OpenIDs[0])
	}
}

// Two chains with a gap at each end of both close into one contour; the gap each needs is the
// wider of its two.
func TestChain_TwoChainsCloseIntoOne(t *testing.T) {
	first := plc.Primitive{Type: plc.PrimitivePolyline, ID: "p", Points: []geom.Point{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}}}
	second := plc.Primitive{Type: plc.PrimitivePolyline, ID: "q", Points: []geom.Point{{X: 10, Y: 10.03}, {X: 0, Y: 10}, {X: 0, Y: 0.02}}}

	open := mustChainWithin(t, 0, first, second)
	if len(open.Open) != 2 || !sameFloat(open.OpenGaps[0], 0.03) || !sameFloat(open.OpenGaps[1], 0.03) {
		t.Fatalf("open %v with gaps %v, want two chains needing 0.03", open.Open, open.OpenGaps)
	}

	closed := mustChainWithin(t, 0.05, first, second)
	if len(closed.Closed) != 1 || len(closed.Open) != 0 || len(closed.Closed[0]) != 6 {
		t.Fatalf("closed %v, open %v; want one contour of all six points", closed.Closed, closed.Open)
	}
}

// Gaps are drawn and typed in decimal mm, which a float64 holds only nearly: 80.04 − 80 is a hair
// over 0.04, and a closing gap of 0.04 still closes it. The gap said is the one to type.
func TestChain_DecimalGapClosesWithTheSameDecimal(t *testing.T) {
	triangle := []plc.Primitive{namedLine("a", 70, 0, 80, 0), namedLine("b", 80.04, 0, 70, 10), namedLine("c", 70, 10, 70, 0)}

	open := mustChainWithin(t, 0, triangle...)
	if len(open.Open) != 1 || open.OpenGaps[0] != 0.04 {
		t.Fatalf("gaps %v, want exactly 0.04", open.OpenGaps)
	}
	if closed := mustChainWithin(t, 0.04, triangle...); len(closed.Closed) != 1 {
		t.Fatalf("closing gap 0.04 left %d open", len(closed.Open))
	}
}

// Where three free ends lie within the closing gap nothing is joined, as with exact joints.
func TestChain_ThreeFreeEndsWithinTheGapStayOpen(t *testing.T) {
	c := mustChainWithin(t, 0.05,
		lineP(0, 0, 10, 0), lineP(10.02, 0, 20, 0), lineP(10.01, 0.02, 10, 10))

	if len(c.Closed) != 0 || len(c.Open) != 3 {
		t.Fatalf("got %d closed, %d open; want 3 open", len(c.Closed), len(c.Open))
	}
}

// A piece shorter than the closing gap is not a contour: closing it on itself would make a loop
// with no area.
func TestChain_ShortPieceDoesNotCloseOnItself(t *testing.T) {
	c := mustChainWithin(t, 0.05, lineP(0, 0, 0.02, 0))

	if len(c.Closed) != 0 || len(c.Open) != 1 || c.OpenGaps[0] != 0 {
		t.Fatalf("got %d closed, %d open with gaps %v; want 1 open that no gap closes", len(c.Closed), len(c.Open), c.OpenGaps)
	}
}

// An end near another end is not enough: a gap closes a chain only when the chains it joins come
// back to it. Here the first two lines have both ends near another, yet all four joined are one
// longer open line.
func TestChain_GapsThatLeadToAnOpenLineCloseNothing(t *testing.T) {
	c := mustChainWithin(t, 0, lineP(0, 0, 10, 0), lineP(10.03, 0, 20, 0), lineP(0, 0.02, -10, 0), lineP(20.04, 0, 30, 0))

	if len(c.Open) != 4 || slices.ContainsFunc(c.OpenGaps, func(g float64) bool { return g != 0 }) {
		t.Fatalf("open %v with gaps %v, want four open lines that no gap closes", c.Open, c.OpenGaps)
	}
}

// Exact joints are made first: a closing gap changes nothing on a contour that closes without it.
func TestChain_ClosingGapLeavesExactJointsAlone(t *testing.T) {
	square := []plc.Primitive{lineP(0, 0, 10, 0), lineP(10, 0, 10, 10), lineP(10, 10, 0, 10), lineP(0, 10, 0, 0)}

	requirePaths(t, "closed", mustChainWithin(t, 0.5, square...).Closed, mustChainWithin(t, 0, square...).Closed)
}

// A line far from any other end is an open line, not an imprecise joint: no gap up to
// MaxCloseGap closes it.
func TestChain_OpenLineHasNoGap(t *testing.T) {
	c := mustChainWithin(t, 0, lineP(0, 0, 10, 0))

	if len(c.Open) != 1 || c.OpenGaps[0] != 0 {
		t.Fatalf("open %v with gaps %v, want one open line with gap 0", c.Open, c.OpenGaps)
	}
}

// The closed contours are cut and the open ones reported beside the program, not refused: the
// program is the one of the closed contours alone.
func TestProfile_CutsTheClosedAndReportsTheOpen(t *testing.T) {
	for _, side := range []string{SideOutside, SideInside, SideOn} {
		t.Run(side, func(t *testing.T) {
			square := squareP(0, 0, 20, 20)
			alone, err := Profile(request(side, 3, square))
			if err != nil {
				t.Fatalf("square alone: %v", err)
			}
			res, err := Profile(request(side, 3, square, namedLine("stray", 30, 0, 40, 0)))
			if err != nil {
				t.Fatalf("square and a line: %v", err)
			}
			if !slices.Equal(res.Output, alone.Output) {
				t.Fatalf("the open line changed the program")
			}
			if len(res.Open) != 1 {
				t.Fatalf("open %+v, want the line", res.Open)
			}
			line := res.Open[0]
			if !slices.Equal(line.PrimitiveIDs, []string{"stray"}) || line.Gap != 0 ||
				!sameFloat(line.StartX, 30) || !sameFloat(line.EndX, 40) {
				t.Fatalf("open contour %+v, want the stray line from 30 to 40 with no gap", line)
			}
			if !slices.ContainsFunc(res.Warnings, func(w i18n.Note) bool { return strings.Contains(w.String(), "open line") }) {
				t.Fatalf("warnings %q do not name the open line", res.Warnings)
			}
		})
	}
}

// A drawing whose only contour has a gap: without a closing gap nothing is cut, and the error
// carries the gap to close it with; with it the contour is cut.
func TestProfile_ClosesTheGapItIsGiven(t *testing.T) {
	req := request(SideOutside, 3, gappedTriangle(0.04)...)

	_, err := Profile(req)
	var open *OpenContoursError
	if !errors.As(err, &open) {
		t.Fatalf("error %v, want the open contours", err)
	}
	if len(open.Open) != 1 || !sameFloat(open.Open[0].Gap, 0.04) || !strings.Contains(err.Error(), "0.040") {
		t.Fatalf("open %+v (%v), want one contour closing with 0.04", open.Open, err)
	}

	req.CloseGap = 0.05
	res, err := Profile(req)
	if err != nil {
		t.Fatalf("closing gap 0.05: %v", err)
	}
	if len(res.Open) != 0 || res.Count == 0 {
		t.Fatalf("open %+v and %d commands, want the contour cut", res.Open, res.Count)
	}
}

func TestProfile_RefusesAClosingGapOutOfRange(t *testing.T) {
	for _, gap := range []float64{-0.1, MaxCloseGap + 0.5} {
		req := request(SideOutside, 3, squareP(0, 0, 20, 20))
		req.CloseGap = gap
		if _, err := Profile(req); err == nil || !strings.Contains(err.Error(), "closing gap") {
			t.Errorf("closing gap %v: error %v, want it refused", gap, err)
		}
	}
}
