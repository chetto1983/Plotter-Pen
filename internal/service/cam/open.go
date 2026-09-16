package cam

import "plotter-pen/internal/i18n"

// OpenContour is a chain of the drawing that is not closed, so no profile cuts it: where it starts
// and ends, the primitives it is drawn with, so the drawing can mark it, and a closing gap that
// closes it — 0 when none up to MaxCloseGap does.
type OpenContour struct {
	PrimitiveIDs []string `json:"primitiveIds,omitempty"`
	StartX       float64  `json:"startX"`
	StartY       float64  `json:"startY"`
	EndX         float64  `json:"endX"`
	EndY         float64  `json:"endY"`
	Gap          float64  `json:"gap"`
}

// OpenContoursError is a profile of a drawing whose contours are all open: nothing is cut, and the
// contours say what would close them.
type OpenContoursError struct {
	Open []OpenContour
}

func (e *OpenContoursError) Error() string { return e.message().Error() }

// Unwrap gives the message, which says the error in Italian too.
func (e *OpenContoursError) Unwrap() error { return e.message() }

func (e *OpenContoursError) message() error {
	widest, closable := 0.0, 0
	for _, c := range e.Open {
		if c.Gap > 0 {
			closable++
			widest = max(widest, c.Gap)
		}
	}
	if closable == 0 {
		return i18n.Errorf("nothing to cut: the drawing has no closed contour, only %d open contour(s); no closing gap up to %g mm closes them",
			len(e.Open), float64(MaxCloseGap))
	}
	return i18n.Errorf("nothing to cut: the drawing has no closed contour, only %d open contour(s); a closing gap of %.3f mm closes %d of them",
		len(e.Open), widest, closable)
}

// openContours describes the open chains of the drawing, with a warning for each.
func openContours(c Contours) ([]OpenContour, []i18n.Note) {
	var open []OpenContour
	var warnings []i18n.Note
	for i, path := range c.Open {
		start, end := path[0], path[len(path)-1]
		contour := OpenContour{PrimitiveIDs: c.OpenIDs[i],
			StartX: start.X, StartY: start.Y, EndX: end.X, EndY: end.Y, Gap: c.OpenGaps[i]}
		fix := i18n.Errorf("it is an open line")
		if contour.Gap > 0 {
			fix = i18n.Errorf("a closing gap of %.3f mm closes it", contour.Gap)
		}
		warnings = append(warnings, i18n.Notef("the open contour from (%.3f, %.3f) to (%.3f, %.3f) is not cut: %v",
			start.X, start.Y, end.X, end.Y, fix))
		open = append(open, contour)
	}
	return open, warnings
}
