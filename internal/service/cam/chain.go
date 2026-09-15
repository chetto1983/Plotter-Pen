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
)

// Contours is the chained drawing: closed loops, with the last point not repeated, and the
// chains that could not be closed.
type Contours struct {
	Closed []geom.Path
	// ClosedIDs names, for each closed contour, the primitives it is made of.
	ClosedIDs [][]string
	Open      []geom.Path
}

// Chain joins primitives end to end into contours, reversing pieces where needed. Two ends are
// joined only when each is the other's only neighbour within joinTolerance: where three or more
// ends meet the contour is ambiguous, so the chains stay open there. Zero-length pieces are
// dropped; a primitive with missing data is an error, since skipping it would change the shape.
func Chain(primitives []plc.Primitive) (Contours, error) {
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
	loops, loopPieces, open := chainPieces(pieces)
	out.Closed = append(out.Closed, loops...)
	for _, indices := range loopPieces {
		ids := make([]string, len(indices))
		for k, i := range indices {
			ids[k] = pieceIDs[i]
		}
		out.ClosedIDs = append(out.ClosedIDs, ids)
	}
	out.Open = open
	return out, nil
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

// chainPieces walks the joints between open pieces. End 2i is the start of piece i and end
// 2i+1 its end; chains that begin at a free end are walked first, what is left forms cycles.
// loopPieces lists, for each loop, the pieces it was walked through.
func chainPieces(pieces []geom.Path) (loops []geom.Path, loopPieces [][]int, open []geom.Path) {
	ends := make([]geom.Point, 0, 2*len(pieces))
	for _, p := range pieces {
		ends = append(ends, p[0], p[len(p)-1])
	}
	partner := matchEnds(ends)
	used := make([]bool, len(pieces))

	walk := func(first int, reversed bool) {
		used[first] = true
		path := oriented(pieces[first], reversed)
		walked := []int{first}
		exit := 2*first + 1
		if reversed {
			exit = 2 * first
		}
		for {
			next := partner[exit]
			if next < 0 {
				open = append(open, path)
				return
			}
			q := next / 2
			if q == first {
				loops = append(loops, path[:len(path)-1])
				loopPieces = append(loopPieces, walked)
				return
			}
			used[q] = true
			walked = append(walked, q)
			path = append(path, oriented(pieces[q], next%2 == 1)[1:]...)
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
	return loops, loopPieces, open
}

// matchEnds pairs every end with its only neighbour within joinTolerance, when that neighbour
// has no other neighbour either; unpaired ends get -1.
func matchEnds(ends []geom.Point) []int {
	type cell struct{ x, y int64 }
	cellOf := func(p geom.Point) cell {
		return cell{int64(math.Floor(p.X / joinTolerance)), int64(math.Floor(p.Y / joinTolerance))}
	}
	grid := map[cell][]int{}
	for i, p := range ends {
		c := cellOf(p)
		grid[c] = append(grid[c], i)
	}

	const none, several = -1, -2
	only := make([]int, len(ends))
	for i, p := range ends {
		only[i] = none
		c := cellOf(p)
		for dx := int64(-1); dx <= 1; dx++ {
			for dy := int64(-1); dy <= 1; dy++ {
				for _, j := range grid[cell{c.x + dx, c.y + dy}] {
					if j == i || p.Distance(ends[j]) > joinTolerance {
						continue
					}
					if only[i] == none {
						only[i] = j
					} else {
						only[i] = several
					}
				}
			}
		}
	}

	partner := make([]int, len(ends))
	for i, j := range only {
		partner[i] = none
		if j >= 0 && only[j] == i {
			partner[i] = j
		}
	}
	return partner
}

func oriented(p geom.Path, reversed bool) geom.Path {
	if reversed {
		return p.Reverse()
	}
	return append(geom.Path(nil), p...)
}
