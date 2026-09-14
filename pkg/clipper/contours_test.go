package clipper

import (
	"math"
	"slices"
	"sort"
	"testing"

	"plotter-pen/pkg/geom"
)

func rectLoop(x0, y0, x1, y1 float64) geom.Path { // counterclockwise
	return geom.Path{{X: x0, Y: y0}, {X: x1, Y: y0}, {X: x1, Y: y1}, {X: x0, Y: y1}}
}

func circleLoop(cx, cy, r float64, n int) geom.Path { // counterclockwise
	p := make(geom.Path, n)
	for i := range p {
		a := 2 * math.Pi * float64(i) / float64(n)
		p[i] = geom.Point{X: cx + r*math.Cos(a), Y: cy + r*math.Sin(a)}
	}
	return p
}

// signedArea is the shoelace area of a closed path: positive when counterclockwise.
func signedArea(p geom.Path) float64 {
	a := 0.0
	for i := range p {
		q := p[(i+1)%len(p)]
		a += p[i].X*q.Y - q.X*p[i].Y
	}
	return a / 2
}

func absArea(p geom.Path) float64 {
	return math.Abs(signedArea(p))
}

// outsideDistance is the distance from a point outside the rectangle to the rectangle.
func outsideDistance(p geom.Point, x0, y0, x1, y1 float64) float64 {
	dx := math.Max(math.Max(x0-p.X, 0), p.X-x1)
	dy := math.Max(math.Max(y0-p.Y, 0), p.Y-y1)
	return math.Hypot(dx, dy)
}

// The tool centre must stay one radius from the material: vertices on the offset curve, and the
// chords of the rounded corners at most 5 µm (plus 1 µm of rounding) inside it.
func TestOffsetContours_OutsideRectangleKeepsToolRadius(t *testing.T) {
	rings := OffsetContours([]geom.Path{rectLoop(0, 0, 100, 50)}, 3)

	if len(rings) != 1 {
		t.Fatalf("got %d rings, want 1", len(rings))
	}
	ring := rings[0]
	// 100x50 plus a 3 mm band along the sides and four quarter discs at the corners
	if a := absArea(ring); math.Abs(a-(5000+2*3*150+9*math.Pi)) > 0.2 {
		t.Fatalf("area %.4f, want %.4f", a, 5000+2*3*150+9*math.Pi)
	}
	for i, p := range ring {
		q := ring[(i+1)%len(ring)]
		if d := outsideDistance(p, 0, 0, 100, 50); math.Abs(d-3) > 0.001 {
			t.Fatalf("vertex %v is %.4f mm from the rectangle, want 3", p, d)
		}
		mid := geom.Point{X: (p.X + q.X) / 2, Y: (p.Y + q.Y) / 2}
		if d := outsideDistance(mid, 0, 0, 100, 50); d < 3-0.006 {
			t.Fatalf("chord %v-%v comes %.4f mm from the rectangle, want at least 2.994", p, q, d)
		}
	}
}

func TestOffsetContours_InsideRectangleKeepsSharpCorners(t *testing.T) {
	rings := OffsetContours([]geom.Path{rectLoop(0, 0, 100, 50)}, -3)

	if len(rings) != 1 {
		t.Fatalf("got %d rings, want 1", len(rings))
	}
	if a := absArea(rings[0]); math.Abs(a-94*44) > 0.01 {
		t.Fatalf("area %.4f, want %d", a, 94*44)
	}
}

// A hole drawn with the same orientation as the outline must still be a hole: when the material
// grows by 3 mm the r=20 hole shrinks to r=17, it does not grow to r=23 or disappear.
func TestOffsetContours_HoleShrinksWhenMaterialGrows(t *testing.T) {
	rings := OffsetContours([]geom.Path{rectLoop(0, 0, 100, 100), circleLoop(50, 50, 20, 200)}, 3)

	if len(rings) != 2 {
		t.Fatalf("got %d rings, want outline and hole", len(rings))
	}
	areas := []float64{absArea(rings[0]), absArea(rings[1])}
	sort.Float64s(areas)
	if want := 17 * 17 * math.Pi; math.Abs(areas[0]-want) > 1 {
		t.Fatalf("hole area %.2f, want %.2f (r=17)", areas[0], want)
	}
	if want := 10000 + 3*400 + 9*math.Pi; math.Abs(areas[1]-want) > 0.2 {
		t.Fatalf("outline area %.2f, want %.2f", areas[1], want)
	}
}

// Two parts 1 mm apart with a 3 mm tool: separate rings would each run through the other part.
func TestOffsetContours_NearbyContoursMergeIntoOneRing(t *testing.T) {
	rings := OffsetContours([]geom.Path{rectLoop(0, 0, 10, 10), rectLoop(11, 0, 21, 10)}, 3)

	if len(rings) != 1 {
		t.Fatalf("got %d rings, want 1", len(rings))
	}
	// where the two rounded corners meet, the vertex is a crossing of their chords: like a chord
	// midpoint it may sit up to 5 µm (plus 1 µm of rounding) inside the radius
	for _, p := range rings[0] {
		d := math.Min(outsideDistance(p, 0, 0, 10, 10), outsideDistance(p, 11, 0, 21, 10))
		if d < 3-0.006 {
			t.Fatalf("vertex %v is %.4f mm from the material, want at least 2.994", p, d)
		}
	}
}

func TestOffsetContours_ShapeNarrowerThanToolGivesNothing(t *testing.T) {
	if rings := OffsetContours([]geom.Path{rectLoop(0, 0, 4, 4)}, -3); len(rings) != 0 {
		t.Fatalf("got %d rings, want none", len(rings))
	}
}

// A part inside a hole of another part is inside the hole and the outline; a contour beside them
// is inside nothing, and no ring is inside itself. The island shares a corner with the hole, so
// that vertex alone cannot tell inside from outside. Rings of another set, like a tool ring in the
// hole beside the island, are tested the same way.
func TestInside_TellsWhichRingsEncloseEachRing(t *testing.T) {
	outline := rectLoop(0, 0, 60, 60)
	hole := rectLoop(10, 10, 50, 50)
	island := geom.Path{{X: 10, Y: 10}, {X: 30, Y: 20}, {X: 20, Y: 30}}
	beside := rectLoop(70, 0, 80, 10)
	drawing := []geom.Path{island, beside, outline, hole}

	got := Inside(append(slices.Clone(drawing), rectLoop(35, 35, 45, 45)), drawing)

	want := [][]bool{
		{false, false, true, true},
		{false, false, false, false},
		{false, false, false, false},
		{false, false, true, false},
		{false, false, true, true},
	}
	if !slices.EqualFunc(got, want, slices.Equal) {
		t.Fatalf("inside %v, want %v", got, want)
	}
}

// Merged contours are rings that do not cross, outlines counterclockwise and holes clockwise,
// whatever the orientation they were drawn with.
func TestMergeContours_HoleDrawnLikeTheOutlineTurnsClockwise(t *testing.T) {
	merged := MergeContours([]geom.Path{rectLoop(0, 0, 100, 100), circleLoop(50, 50, 20, 200)})

	if len(merged) != 2 {
		t.Fatalf("got %d rings, want outline and hole", len(merged))
	}
	areas := []float64{signedArea(merged[0]), signedArea(merged[1])}
	sort.Float64s(areas)
	if math.Abs(areas[0]+400*math.Pi) > 2 || math.Abs(areas[1]-10000) > 0.01 {
		t.Fatalf("signed areas %v, want about %.1f (hole) and 10000 (outline)", areas, -400*math.Pi)
	}
}

// segmentDistance is the distance from p to the segment a-b.
func segmentDistance(p, a, b geom.Point) float64 {
	dx, dy := b.X-a.X, b.Y-a.Y
	t := math.Max(0, math.Min(1, ((p.X-a.X)*dx+(p.Y-a.Y)*dy)/(dx*dx+dy*dy)))
	return p.Distance(geom.Point{X: a.X + t*dx, Y: a.Y + t*dy})
}

// A densely sampled arc keeps only the vertices it needs to stay within the tolerance, and both
// ends stay where they are.
func TestSimplifyPath_KeepsEndsAndStaysWithinTolerance(t *testing.T) {
	arc := circleLoop(0, 0, 10, 4000)[:1001] // a quarter of a circle, a vertex every 16 µm

	got := SimplifyPath(arc, 0.01)

	// coordinates come back rounded to whole micrometres
	if got[0].Distance(arc[0]) > 0.0005 || got[len(got)-1].Distance(arc[len(arc)-1]) > 0.0005 {
		t.Fatalf("ends %v and %v, want %v and %v", got[0], got[len(got)-1], arc[0], arc[len(arc)-1])
	}
	// a chord that sags 0.01 mm on a 10 mm radius spans 0.028 rad, so a quarter needs about 56
	if len(got) > 80 {
		t.Fatalf("kept %d of %d vertices", len(got), len(arc))
	}
	for _, p := range arc {
		nearest := math.Inf(1)
		for i := 1; i < len(got); i++ {
			nearest = math.Min(nearest, segmentDistance(p, got[i-1], got[i]))
		}
		if nearest > 0.0105 {
			t.Fatalf("vertex %v is %.4f mm from the simplified path", p, nearest)
		}
	}
}

// Coordinates go to Clipper as whole micrometres: truncating instead of rounding would move
// every point up to 1 µm towards the origin.
func TestOffsetContours_RoundsToNearestMicrometre(t *testing.T) {
	rings := OffsetContours([]geom.Path{rectLoop(-10.0006, -5.0006, 10.0006, 5.0006)}, -3)

	if len(rings) != 1 {
		t.Fatalf("got %d rings, want 1", len(rings))
	}
	for _, p := range rings[0] {
		if math.Abs(math.Abs(p.X)-7.0006) > 0.0005 || math.Abs(math.Abs(p.Y)-2.0006) > 0.0005 {
			t.Fatalf("vertex %v, want (±7.0006, ±2.0006) within 0.5 µm", p)
		}
	}
}
