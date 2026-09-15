package importservice

import (
	"reflect"
	"strings"
	"testing"
)

// Entities the importer has no primitive for are left out instead of failing the whole file, and the
// stats count them by type so the user can be told what is missing.
func TestParseDXF_SkipsAndCountsEntitiesItDoesNotImport(t *testing.T) {
	text := "0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n2\n1\nnota\n"
	mesh := "0\nPOLYLINE\n8\n0\n66\n1\n10\n0\n20\n0\n70\n64\n" +
		"0\nVERTEX\n8\n0\n10\n0\n20\n0\n30\n0\n70\n192\n" + "0\nSEQEND\n8\n0\n"
	res := parse(t, dxfFile(
		"0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n0\n",
		"0\nMTEXT\n8\n0\n10\n0\n20\n0\n40\n2\n1\nnota\n",
		"0\nINSERT\n8\n0\n2\nPAD\n10\n5\n20\n5\n",
		"0\nHATCH\n8\n0\n10\n0\n20\n0\n2\nSOLID\n",
		text, text, mesh,
	))

	if len(res.Primitives) != 1 || res.Primitives[0].Type != "line" {
		t.Fatalf("got %+v, want the line alone", res.Primitives)
	}
	want := map[string]int{"TEXT": 2, "MTEXT": 1, "INSERT": 1, "HATCH": 1, "POLYLINE": 1}
	if !reflect.DeepEqual(res.Stats.Skipped, want) {
		t.Fatalf("skipped %v, want %v", res.Stats.Skipped, want)
	}
}

// A file the reader cannot read to the end of its entities is refused, rather than imported with
// contours missing.
func TestParseDXF_RejectsFilesItCannotReadWhole(t *testing.T) {
	whole := dxfFile(lwpolyline(true, [3]float64{0, 0, 0}, [3]float64{10, 0, 0}, [3]float64{10, 5, 0}))
	tests := []struct {
		name, content, message string
	}{
		{"not a DXF", "not a DXF file", "ENTITIES"},
		{"binary DXF", "AutoCAD Binary DXF\r\n\x1a\x00\x00\x00SECTION\x00", "binary"},
		{"truncated inside the entities", whole[:strings.Index(whole, "10\n10")], "ENTITIES"},
		{"a line that is not a group code", strings.Replace(whole, "70\n1\n", "7O\n1\n", 1), "ENTITIES"},
		{"fewer vertices declared than written", strings.Replace(whole, "90\n3\n", "90\n1\n", 1), "LWPOLYLINE"},
		{"more vertices declared than written", strings.Replace(whole, "90\n3\n", "90\n5\n", 1), "LWPOLYLINE"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := ParseDXF(tt.content)
			if err == nil || !strings.Contains(err.Error(), tt.message) {
				t.Fatalf("got %+v, error %v; want an error naming %q", res, err, tt.message)
			}
		})
	}
}
