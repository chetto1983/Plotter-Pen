package importservice

import (
	"reflect"
	"testing"
)

// The cache key must include the options an import was run with: two imports of the same content
// under different options produce different results and must not collide on one entry.
func TestSmartImportCached_DifferentOptionsDoNotShareCacheEntry(t *testing.T) {
	parseCache = make(map[string]*cachedResult) // isolate from any entry left by another test
	content := dxfFile("0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n0\n")

	uncentered, err := SmartImportCached(content, ImportOptions{CenterOrigin: false})
	if err != nil {
		t.Fatalf("SmartImportCached: %v", err)
	}
	centered, err := SmartImportCached(content, ImportOptions{CenterOrigin: true})
	if err != nil {
		t.Fatalf("SmartImportCached: %v", err)
	}

	if uncentered.Primitives[0].StartX == centered.Primitives[0].StartX {
		t.Fatalf("got the same primitive for CenterOrigin=false and CenterOrigin=true: %+v vs %+v",
			uncentered.Primitives[0], centered.Primitives[0])
	}

	// same content and options again: the cached, centered result comes back unchanged
	again, err := SmartImportCached(content, ImportOptions{CenterOrigin: true})
	if err != nil {
		t.Fatalf("SmartImportCached: %v", err)
	}
	if again.Primitives[0].StartX != centered.Primitives[0].StartX {
		t.Fatalf("got StartX %v, want the cached centered result %v", again.Primitives[0].StartX, centered.Primitives[0].StartX)
	}
}

// SmartImportCached must hand back a value the caller can mutate freely: the cache keeps its own
// state, not the pointer it returns, so mutating the primitives slice, a primitive's own slice or
// pointer field, the stats maps, the PLC data, or the bounds of one call must never reach a later
// cached read.
func TestSmartImportCached_MutatingResultDoesNotCorruptCache(t *testing.T) {
	parseCache = make(map[string]*cachedResult) // isolate from any entry left by another test
	content := dxfFile(lwpolyline(false, [3]float64{0, 0, 1}, [3]float64{2, 0, 0}, [3]float64{2, 3, 0}))
	opts := ImportOptions{ExtractPLC: true}

	first, err := SmartImportCached(content, opts)
	if err != nil {
		t.Fatalf("SmartImportCached: %v", err)
	}
	if len(first.Primitives) != 2 || first.Primitives[0].ThroughPoint == nil || len(first.PLCData) != 2 {
		t.Fatalf("got %+v, want an arc (with a through point) and a line, and PLC data for both", first.Primitives)
	}
	wantArcStartX := first.Primitives[0].StartX
	wantThroughX := first.Primitives[0].ThroughPoint.X
	wantLineStartX := first.Primitives[1].StartX
	wantByTypeArc := first.Stats.ByType["arc"]
	wantCoord0 := first.PLCData[0].Coords[0]
	wantBoundsMinX := first.Bounds.MinX

	// mutate everything reachable from the returned pointer
	first.Primitives[0].StartX = -999
	first.Primitives[0].ThroughPoint.X = -999
	first.Primitives[1].StartX = -999
	first.Primitives = append(first.Primitives, Primitive{Type: "line"})
	first.Stats.ByType["arc"] = -999
	first.PLCData[0].Coords[0] = -999
	first.PLCData = append(first.PLCData, PLCItem{Type: "L"})
	first.Bounds.MinX = -999

	second, err := SmartImportCached(content, opts)
	if err != nil {
		t.Fatalf("SmartImportCached: %v", err)
	}
	if len(second.Primitives) != 2 {
		t.Fatalf("cache was corrupted: got %d primitives, want 2", len(second.Primitives))
	}
	if second.Primitives[0].StartX != wantArcStartX || second.Primitives[0].ThroughPoint.X != wantThroughX {
		t.Fatalf("cache was corrupted: arc got %+v (through %v)", second.Primitives[0], second.Primitives[0].ThroughPoint)
	}
	if second.Primitives[1].StartX != wantLineStartX {
		t.Fatalf("cache was corrupted: line got %+v", second.Primitives[1])
	}
	if second.Stats.ByType["arc"] != wantByTypeArc {
		t.Fatalf("cache stats were corrupted: got %v, want %v", second.Stats.ByType["arc"], wantByTypeArc)
	}
	if len(second.PLCData) != 2 || second.PLCData[0].Coords[0] != wantCoord0 {
		t.Fatalf("cache PLC data was corrupted: got %+v", second.PLCData)
	}
	if second.Bounds.MinX != wantBoundsMinX {
		t.Fatalf("cache bounds were corrupted: got %v, want %v", second.Bounds.MinX, wantBoundsMinX)
	}
}

// cacheKey lists the fields of ImportOptions by hand, so an option added later would be left
// out of the key and two imports differing only by it would share an entry again.
func TestCacheKey_EveryOptionChangesTheKey(t *testing.T) {
	base := ImportOptions{}
	baseKey := cacheKey("content", base)
	options := reflect.TypeOf(base)

	for i := range options.NumField() {
		changed := base
		field := reflect.ValueOf(&changed).Elem().Field(i)
		switch field.Kind() {
		case reflect.Bool:
			field.SetBool(!field.Bool())
		case reflect.Float64:
			field.SetFloat(field.Float() + 1)
		default:
			t.Fatalf("option %s is a %s: teach cacheKey and this test about it",
				options.Field(i).Name, field.Kind())
		}
		if cacheKey("content", changed) == baseKey {
			t.Errorf("changing %s leaves the cache key untouched", options.Field(i).Name)
		}
	}
}
