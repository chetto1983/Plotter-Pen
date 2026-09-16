// Package cam turns drawing primitives into machining geometry.
package cam

import (
	"fmt"
	"math"

	"plotter-pen/internal/service/plc"
	"plotter-pen/pkg/geom"
)

const (
	// joinTolerance is the largest gap between two ends that still counts as a joint; the PLC
	// extractor uses the same 0.01 mm to decide that no jump is needed.
	joinTolerance = 0.01
	// arcChordTolerance is the largest distance between an arc and the chords that replace it,
	// the same 5 µm used as arc tolerance for the Clipper2 offsets.
	arcChordTolerance = 0.005
	// MaxCloseGap is the widest gap a closing gap may bridge, in mm: past it a gap is part of the
	// drawing, not an imprecise joint.
	MaxCloseGap = 1.0
	// closeGapSteps is how many closing gaps per mm are tried to say which one closes a contour:
	// the 0.01 mm steps the panel offers.
	closeGapSteps = 100
	// minLoopArea is the smallest area of a loop of pieces, in mm²: a loop with less is a line
	// that goes out and back, or a short piece closed on itself, and stays open.
	minLoopArea = joinTolerance * joinTolerance
	// gapSlack is how far a distance may pass a tolerance and still be within it. Gaps are drawn and
	// typed in decimal mm, which a float64 holds only nearly: 80.04 - 80 is 0.04000000000000625, and
	// a closing gap of 0.04 must close it. 1 nm is far below the µm of the PLC coordinates.
	gapSlack = 1e-9
)

func within(distance, tol float64) bool { return distance <= tol+gapSlack }

// Contours is the chained drawing: closed loops, with the last point not repeated, and the
// chains that could not be closed.
type Contours struct {
	Closed []geom.Path
	// ClosedIDs names, for each closed contour, the primitives it is made of.
	ClosedIDs [][]string
	Open      []geom.Path
	// OpenIDs names, for each open chain, the primitives it is made of.
	OpenIDs [][]string
	// OpenGaps is, for each open chain, the closing gap that closes it, wider than the one asked
	// for, at most MaxCloseGap and in steps of 1/closeGapSteps mm; 0 when none does.
	OpenGaps []float64
}

// Chain joins primitives end to end into contours, reversing pieces where needed. Two ends are
// joined only when each is the other's only neighbour within joinTolerance: where three or more
// ends meet the contour is ambiguous, so the chains stay open there. Zero-length pieces are
// dropped; a primitive with missing data is an error, since skipping it would change the shape.
//
// A closeGap wider than joinTolerance then joins the chains left open by the same rule, with
// closeGap in place of joinTolerance. Such a joint keeps both ends and bridges the gap with a
// straight edge, so no point of the drawing moves.
func Chain(primitives []plc.Primitive, closeGap float64) (Contours, error) {
	var out Contours
	var pieces []geom.Path
	var pieceIDs []string
	for _, p := range primitives {
		path, closed, err := toPath(p)
		if err != nil {
			return Contours{}, err
		}
		switch {
		case pathLength(path) < joinTolerance:
		case closed:
			out.Closed = append(out.Closed, path)
			out.ClosedIDs = append(out.ClosedIDs, []string{p.ID})
		default:
			pieces = append(pieces, path)
			pieceIDs = append(pieceIDs, p.ID)
		}
	}

	loops, first := chainPieces(pieces, joinTolerance)
	open := first
	if closeGap > joinTolerance {
		bridged, left := chainPieces(pathsOf(first), closeGap)
		loops = append(loops, through(bridged, first)...)
		open = through(left, first)
	}

	names := func(c chain) []string {
		ids := make([]string, len(c.pieces))
		for k, i := range c.pieces {
			ids[k] = pieceIDs[i]
		}
		return ids
	}
	for _, loop := range loops {
		out.Closed = append(out.Closed, loop.path)
		out.ClosedIDs = append(out.ClosedIDs, names(loop))
	}

	firstGaps := closingGaps(first, closeGap)
	chainOf := make([]int, len(pieces))
	for c, ch := range first {
		for _, i := range ch.pieces {
			chainOf[i] = c
		}
	}
	for _, ch := range open {
		// a chain bridged from several closes when all of them do
		gap := 0.0
		for _, i := range ch.pieces {
			g := firstGaps[chainOf[i]]
			if g == 0 {
				gap = 0
				break
			}
			gap = math.Max(gap, g)
		}
		out.Open = append(out.Open, ch.path)
		out.OpenIDs = append(out.OpenIDs, names(ch))
		out.OpenGaps = append(out.OpenGaps, gap)
	}
	return out, nil
}

// closingGaps says, for each chain left open by the exact joints, the narrowest closing gap wider
// than closeGap that closes it into a loop, trying them up to MaxCloseGap in the steps the panel
// offers: the gap said is one the panel can set, and it closes the chain when set. 0 when none
// does.
//
// Only the chains with an end near another end take part: the others are open lines, which no gap
// closes and which are too far from every end to change a joint.
func closingGaps(open []chain, closeGap float64) []float64 {
	gaps := make([]float64, len(open))
	near := make([]bool, 2*len(open))
	eachNear(endsOf(pathsOf(open)), MaxCloseGap, func(i, _ int) { near[i] = true })
	var trial []geom.Path
	var trialChain []int
	closable := 0
	for c, ch := range open {
		if near[2*c] || near[2*c+1] {
			trial = append(trial, ch.path)
			trialChain = append(trialChain, c)
		}
		if near[2*c] && near[2*c+1] {
			closable++
		}
	}

	for k := 1; k <= MaxCloseGap*closeGapSteps && closable > 0; k++ {
		gap := float64(k) / closeGapSteps
		if gap <= math.Max(closeGap, joinTolerance) {
			continue
		}
		loops, _ := chainPieces(trial, gap)
		for _, loop := range loops {
			for _, i := range loop.pieces {
				if c := trialChain[i]; gaps[c] == 0 {
					gaps[c] = gap
					closable--
				}
			}
		}
	}
	return gaps
}

// toPath converts a primitive with the field conventions of the PLC extractor: arcs run from
// (X1,Y1) by Sweep radians (positive counterclockwise) around (Cx,Cy) and end at (X2,Y2).
func toPath(p plc.Primitive) (path geom.Path, closed bool, err error) {
	switch p.Type {
	case plc.PrimitiveLine:
		if p.X1 == nil || p.Y1 == nil || p.X2 == nil || p.Y2 == nil {
			return nil, false, fmt.Errorf("line %q: missing end points", p.ID)
		}
		return geom.Path{{X: *p.X1, Y: *p.Y1}, {X: *p.X2, Y: *p.Y2}}, false, nil

	case plc.PrimitiveArc:
		if p.X1 == nil || p.Y1 == nil || p.X2 == nil || p.Y2 == nil || p.Cx == nil || p.Cy == nil || p.Sweep == nil {
			return nil, false, fmt.Errorf("arc %q: needs start, end, centre and sweep", p.ID)
		}
		start, centre := geom.Point{X: *p.X1, Y: *p.Y1}, geom.Point{X: *p.Cx, Y: *p.Cy}
		path = arcPath(centre, start.Distance(centre), math.Atan2(start.Y-centre.Y, start.X-centre.X), *p.Sweep)
		path[0], path[len(path)-1] = start, geom.Point{X: *p.X2, Y: *p.Y2}
		return path, false, nil

	case plc.PrimitiveCircle:
		cx, cy, r := p.GetCircleParams()
		if p.Radius == nil || (p.Center == nil && (p.Cx == nil || p.Cy == nil)) {
			return nil, true, fmt.Errorf("circle %q: needs centre and radius", p.ID)
		}
		path = arcPath(geom.Point{X: cx, Y: cy}, r, 0, 2*math.Pi)
		return path[:len(path)-1], true, nil

	case plc.PrimitiveRectangle:
		if p.X == nil || p.Y == nil || p.Width == nil || p.Height == nil {
			return nil, true, fmt.Errorf("rectangle %q: needs corner, width and height", p.ID)
		}
		x, y, w, h := *p.X, *p.Y, *p.Width, *p.Height
		return geom.Path{{X: x, Y: y}, {X: x + w, Y: y}, {X: x + w, Y: y + h}, {X: x, Y: y + h}}, true, nil

	case plc.PrimitivePolygon, plc.PrimitivePolyline:
		path = append(geom.Path(nil), p.Points...)
		closed = p.Type == plc.PrimitivePolygon || p.Closed
		if closed && len(path) > 1 && path[0].Distance(path[len(path)-1]) <= joinTolerance {
			path = path[:len(path)-1]
		}
		return path, closed, nil
	}
	return nil, false, fmt.Errorf("primitive %q: unsupported type %q", p.ID, p.Type)
}

// arcPath samples an arc from angle a0 by sweep with chords at most arcChordTolerance inside it.
func arcPath(centre geom.Point, r, a0, sweep float64) geom.Path {
	step := 2 * math.Acos(math.Max(-1, 1-arcChordTolerance/r))
	n := max(1, int(math.Ceil(math.Abs(sweep)/step)))
	path := make(geom.Path, n+1)
	for k := range path {
		a := a0 + sweep*float64(k)/float64(n)
		path[k] = geom.Point{X: centre.X + r*math.Cos(a), Y: centre.Y + r*math.Sin(a)}
	}
	return path
}

func pathLength(path geom.Path) float64 {
	l := 0.0
	for i := 1; i < len(path); i++ {
		l += path[i-1].Distance(path[i])
	}
	return l
}

// chain is a path walked through pieces, with the pieces in the order walked.
type chain struct {
	path   geom.Path
	pieces []int
}

func pathsOf(chains []chain) []geom.Path {
	paths := make([]geom.Path, len(chains))
	for i, c := range chains {
		paths[i] = c.path
	}
	return paths
}

// through turns chains walked through parts, which are chains themselves, into chains walked
// through the parts' pieces.
func through(chains, parts []chain) []chain {
	for i, c := range chains {
		var pieces []int
		for _, p := range c.pieces {
			pieces = append(pieces, parts[p].pieces...)
		}
		chains[i].pieces = pieces
	}
	return chains
}

func endsOf(pieces []geom.Path) []geom.Point {
	ends := make([]geom.Point, 0, 2*len(pieces))
	for _, p := range pieces {
		ends = append(ends, p[0], p[len(p)-1])
	}
	return ends
}

// chainPieces walks the joints within tol between open pieces. End 2i is the start of piece i
// and end 2i+1 its end; chains that begin at a free end are walked first, what is left forms
// cycles. A joint within joinTolerance becomes one point, a wider one keeps both ends. A cycle
// with fewer than three points or no area is a line, not a loop, and stays open.
func chainPieces(pieces []geom.Path, tol float64) (loops, open []chain) {
	partner := matchEnds(endsOf(pieces), tol)
	used := make([]bool, len(pieces))

	walk := func(first int, reversed bool) {
		used[first] = true
		c := chain{path: oriented(pieces[first], reversed), pieces: []int{first}}
		exit := 2*first + 1
		if reversed {
			exit = 2 * first
		}
		for {
			next := partner[exit]
			if next < 0 {
				open = append(open, c)
				return
			}
			q := next / 2
			if q == first {
				loop := c.path
				if within(loop[len(loop)-1].Distance(loop[0]), joinTolerance) {
					loop = loop[:len(loop)-1]
				}
				if len(loop) < 3 || math.Abs(signedArea(loop)) < minLoopArea {
					open = append(open, c)
					return
				}
				c.path = loop
				loops = append(loops, c)
				return
			}
			used[q] = true
			c.pieces = append(c.pieces, q)
			piece := oriented(pieces[q], next%2 == 1)
			if within(c.path[len(c.path)-1].Distance(piece[0]), joinTolerance) {
				piece = piece[1:]
			}
			c.path = append(c.path, piece...)
			exit = next ^ 1
		}
	}

	for i := range pieces {
		switch {
		case used[i]:
		case partner[2*i] < 0:
			walk(i, false)
		case partner[2*i+1] < 0:
			walk(i, true)
		}
	}
	for i := range pieces {
		if !used[i] {
			walk(i, false)
		}
	}
	return loops, open
}

// matchEnds pairs every end with its only neighbour within tol, when that neighbour has no other
// neighbour either; unpaired ends get -1.
func matchEnds(ends []geom.Point, tol float64) []int {
	const none, several = -1, -2
	only := make([]int, len(ends))
	for i := range only {
		only[i] = none
	}
	eachNear(ends, tol, func(i, j int) {
		if only[i] == none {
			only[i] = j
		} else {
			only[i] = several
		}
	})

	partner := make([]int, len(ends))
	for i, j := range only {
		partner[i] = none
		if j >= 0 && only[j] == i {
			partner[i] = j
		}
	}
	return partner
}

// eachNear calls visit(i, j) for every end i and every other end j within tol of it, on a grid of
// cells tol wide so that only the neighbouring cells are searched.
func eachNear(ends []geom.Point, tol float64, visit func(i, j int)) {
	type cell struct{ x, y int64 }
	cellOf := func(p geom.Point) cell {
		return cell{int64(math.Floor(p.X / tol)), int64(math.Floor(p.Y / tol))}
	}
	grid := map[cell][]int{}
	for i, p := range ends {
		c := cellOf(p)
		grid[c] = append(grid[c], i)
	}
	for i, p := range ends {
		c := cellOf(p)
		for dx := int64(-1); dx <= 1; dx++ {
			for dy := int64(-1); dy <= 1; dy++ {
				for _, j := range grid[cell{c.x + dx, c.y + dy}] {
					if j != i && within(p.Distance(ends[j]), tol) {
						visit(i, j)
					}
				}
			}
		}
	}
}

func oriented(p geom.Path, reversed bool) geom.Path {
	if reversed {
		return p.Reverse()
	}
	return append(geom.Path(nil), p...)
}
