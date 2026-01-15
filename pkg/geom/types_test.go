package geom

import (
	"math"
	"testing"
)

func TestPointDistance(t *testing.T) {
	tests := []struct {
		name string
		p1   Point
		p2   Point
		want float64
	}{
		{"origin_to_3_4", Point{0, 0}, Point{3, 4}, 5.0},
		{"same_point", Point{1, 1}, Point{1, 1}, 0.0},
		{"negative", Point{-1, -1}, Point{2, 3}, 5.0},
		{"horizontal", Point{0, 0}, Point{10, 0}, 10.0},
		{"vertical", Point{0, 0}, Point{0, 10}, 10.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.p1.Distance(tt.p2)
			if math.Abs(got-tt.want) > 0.001 {
				t.Errorf("Distance() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPointDistanceSq(t *testing.T) {
	p1 := Point{0, 0}
	p2 := Point{3, 4}
	want := 25.0

	got := p1.DistanceSq(p2)
	if got != want {
		t.Errorf("DistanceSq() = %v, want %v", got, want)
	}
}

func TestPointSub(t *testing.T) {
	p1 := Point{5, 7}
	p2 := Point{2, 3}
	result := p1.Sub(p2)

	if result.X != 3 || result.Y != 4 {
		t.Errorf("Sub() = %v, want {3, 4}", result)
	}
}

func TestPointAdd(t *testing.T) {
	p1 := Point{1, 2}
	p2 := Point{3, 4}
	result := p1.Add(p2)

	if result.X != 4 || result.Y != 6 {
		t.Errorf("Add() = %v, want {4, 6}", result)
	}
}

func TestPointScale(t *testing.T) {
	p := Point{3, 4}
	result := p.Scale(2.0)

	if result.X != 6 || result.Y != 8 {
		t.Errorf("Scale() = %v, want {6, 8}", result)
	}
}

func TestCircleCenter(t *testing.T) {
	c := Circle{Cx: 5, Cy: 10, Radius: 3}
	center := c.Center()

	if center.X != 5 || center.Y != 10 {
		t.Errorf("Center() = %v, want {5, 10}", center)
	}
}

func TestPathIsClosed(t *testing.T) {
	tests := []struct {
		name      string
		path      Path
		tolerance float64
		want      bool
	}{
		{"closed_square", Path{{0, 0}, {1, 0}, {1, 1}, {0, 1}, {0, 0}}, 0.01, true},
		{"open_line", Path{{0, 0}, {1, 1}}, 0.01, false},
		{"almost_closed", Path{{0, 0}, {1, 0}, {1, 1}, {0.005, 0.005}}, 0.01, true},
		{"too_short", Path{{0, 0}, {1, 1}}, 0.01, false},
		{"empty", Path{}, 0.01, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.path.IsClosed(tt.tolerance); got != tt.want {
				t.Errorf("IsClosed() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPathEnsureClosed(t *testing.T) {
	tests := []struct {
		name      string
		path      Path
		tolerance float64
		wantLen   int
	}{
		{"already_closed", Path{{0, 0}, {1, 0}, {1, 1}, {0, 0}}, 0.01, 4},
		{"open_triangle", Path{{0, 0}, {1, 0}, {0.5, 1}}, 0.01, 4},
		{"too_short", Path{{0, 0}}, 0.01, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.path.EnsureClosed(tt.tolerance)
			if len(result) != tt.wantLen {
				t.Errorf("EnsureClosed() len = %v, want %v", len(result), tt.wantLen)
			}
		})
	}
}

func TestPathBounds(t *testing.T) {
	tests := []struct {
		name                       string
		path                       Path
		wantMinX, wantMinY         float64
		wantMaxX, wantMaxY         float64
	}{
		{"square", Path{{0, 0}, {10, 0}, {10, 10}, {0, 10}}, 0, 0, 10, 10},
		{"negative", Path{{-5, -5}, {5, 5}}, -5, -5, 5, 5},
		{"empty", Path{}, 0, 0, 0, 0},
		{"single", Path{{3, 4}}, 3, 4, 3, 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			minX, minY, maxX, maxY := tt.path.Bounds()
			if minX != tt.wantMinX || minY != tt.wantMinY ||
				maxX != tt.wantMaxX || maxY != tt.wantMaxY {
				t.Errorf("Bounds() = (%v,%v,%v,%v), want (%v,%v,%v,%v)",
					minX, minY, maxX, maxY,
					tt.wantMinX, tt.wantMinY, tt.wantMaxX, tt.wantMaxY)
			}
		})
	}
}

func TestPathReverse(t *testing.T) {
	path := Path{{0, 0}, {1, 0}, {2, 0}, {3, 0}}
	reversed := path.Reverse()

	if len(reversed) != 4 {
		t.Fatalf("Reverse() len = %v, want 4", len(reversed))
	}

	if reversed[0].X != 3 || reversed[3].X != 0 {
		t.Errorf("Reverse() first=%v, last=%v, want first={3,0}, last={0,0}",
			reversed[0], reversed[3])
	}
}

func TestPathBounds_AllBranches(t *testing.T) {
	// This path ensures all 4 if branches in Bounds() are hit:
	// Start at (5,5), then go to (0,0) to hit minX and minY updates,
	// then go to (10,10) to hit maxX and maxY updates
	path := Path{{5, 5}, {0, 0}, {10, 10}, {3, 3}}

	minX, minY, maxX, maxY := path.Bounds()

	if minX != 0 {
		t.Errorf("minX = %v, want 0", minX)
	}
	if minY != 0 {
		t.Errorf("minY = %v, want 0", minY)
	}
	if maxX != 10 {
		t.Errorf("maxX = %v, want 10", maxX)
	}
	if maxY != 10 {
		t.Errorf("maxY = %v, want 10", maxY)
	}
}

func TestPathBounds_DecreasingOnly(t *testing.T) {
	// Path where values only decrease - ensures minX and minY branches execute
	path := Path{{10, 10}, {5, 5}, {0, 0}}

	minX, minY, maxX, maxY := path.Bounds()

	if minX != 0 || minY != 0 || maxX != 10 || maxY != 10 {
		t.Errorf("Bounds() = (%v,%v,%v,%v), want (0,0,10,10)", minX, minY, maxX, maxY)
	}
}
