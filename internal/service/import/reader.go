package importservice

import (
	"io"
	"strings"

	"github.com/whutwxn/dxf-go/core"
	"github.com/whutwxn/dxf-go/document"
	"plotter-pen/internal/i18n"
)

// The reader logs the tags it does not use to stderr; the import counts what it skips in its stats instead.
func init() {
	core.Log.SetOutput(io.Discard)
}

// readDXF reads an ASCII DXF with github.com/whutwxn/dxf-go and counts the entities in its ENTITIES
// section by type.
//
// The reader is lenient where an import must not be: it stops without an error at a line that is not a
// group code, returns an empty drawing for a binary DXF, fills the vertices an LWPOLYLINE declares but
// does not write with (0, 0), and panics when it writes more than it declares. So the file is refused
// unless the reader's own tags reach the end of the ENTITIES section with every LWPOLYLINE whole.
func readDXF(content string) (doc *document.DxfDocument, entityTypes map[string]int, err error) {
	if strings.HasPrefix(content, "AutoCAD Binary DXF") {
		return nil, nil, i18n.Errorf("binary DXF is not supported: save the drawing as ASCII DXF")
	}
	entityTypes, err = countEntityTypes(core.AllTags(core.Tagger(strings.NewReader(content))))
	if err != nil {
		return nil, nil, err
	}

	defer func() {
		if r := recover(); r != nil {
			doc, entityTypes, err = nil, nil, i18n.Errorf("the DXF could not be read: %v", r)
		}
	}()
	doc, err = document.DxfDocumentFromStream(strings.NewReader(content))
	if err != nil {
		return nil, nil, err
	}
	return doc, entityTypes, nil
}

// countEntityTypes counts the entities of the ENTITIES section by type, leaving out the VERTEX and
// SEQEND entities that belong to a POLYLINE. It fails when the tags end before the ENDSEC of that
// section or an LWPOLYLINE writes a different number of vertices than it declares.
func countEntityTypes(tags []*core.Tag) (map[string]int, error) {
	counts := map[string]int{}
	inEntities := false
	lw := lwpolylineCount{declared: -1}
	for i, tag := range tags {
		value := tag.Value.ToString()
		if !inEntities {
			inEntities = tag.Code == 2 && value == "ENTITIES" && i > 0 && tags[i-1].Code == 0 && tags[i-1].Value.ToString() == "SECTION"
			continue
		}
		switch tag.Code {
		case 0:
			if err := lw.check(); err != nil {
				return nil, err
			}
			lw = lwpolylineCount{declared: -1, open: value == "LWPOLYLINE"}
			switch value {
			case "ENDSEC":
				return counts, nil
			case "VERTEX", "SEQEND":
			default:
				counts[value]++
			}
		case 90:
			if n, ok := core.AsInt(tag.Value); ok && lw.open {
				lw.declared = n
			}
		case 10:
			lw.written++
		}
	}
	return nil, i18n.Errorf("the DXF has no complete ENTITIES section: the file is truncated or has a line that is not a group code")
}

// lwpolylineCount compares the vertices an LWPOLYLINE declares (90) with the ones it writes (10).
type lwpolylineCount struct {
	open              bool
	declared, written int
}

func (c lwpolylineCount) check() error {
	if c.open && c.declared < 0 {
		return i18n.Errorf("an LWPOLYLINE does not declare how many vertices it has (group code 90): the DXF is damaged")
	}
	if c.open && c.declared != c.written {
		return i18n.Errorf("an LWPOLYLINE declares %d vertices but writes %d: the DXF is damaged", c.declared, c.written)
	}
	return nil
}
