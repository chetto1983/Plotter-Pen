package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/service/plc"
)

func postCAMProfile(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return postCAM(t, "/api/cam/profile", body)
}

func postCAM(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewCAMHandler().RegisterRoutes(r.Group("/api"))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

// The request carries the PLC settings under the names /api/plc/extract uses, and the response
// has the extract shape, so the output list, the 3D simulation and the transfer can show it.
func TestCAMProfile_ReturnsProgramInExtractShape(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [{"type": "rectangle", "id": "r1", "x": 0, "y": 0, "width": 20, "height": 10}],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0, "waitTime": 0,
		"thickness": 0.8, "through": true, "overcut": 0.2, "depth": 0,
		"toolDiameter": 3, "side": "outside", "direction": "climb",
		"stepDown": 0.5, "plungeSpeed": 5, "rampAngle": 90
	}`)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var resp plc.ExtractResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response: %v", err)
	}
	if resp.Count == 0 || resp.Count != len(resp.Output) || len(resp.Commands) != resp.Count {
		t.Fatalf("count %d, %d output lines, %d commands", resp.Count, len(resp.Output), len(resp.Commands))
	}
	plunges := 0
	for _, line := range resp.Output {
		if strings.HasSuffix(line, "V 5.000") {
			plunges++
		}
	}
	if program := strings.Join(resp.Output, "\n"); plunges != 2 || !strings.Contains(program, "Z -0.200, V 5.000") {
		t.Fatalf("%d plunges, want one per 0.5 mm pass through the 0.8 mm piece down to 0.2 mm below the bed:\n%s", plunges, program)
	}
}

// The program is returned with the contours the tool cannot reach listed under "warnings".
func TestCAMProfile_ListsUnreachableContoursAsWarnings(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [
			{"type": "rectangle", "x": 0, "y": 0, "width": 60, "height": 60},
			{"type": "circle", "cx": 30, "cy": 30, "radius": 2}
		],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0,
		"thickness": 1, "through": true,
		"toolDiameter": 6, "side": "outside", "stepDown": 1, "plungeSpeed": 5, "rampAngle": 3
	}`)

	var resp struct {
		Count    int      `json:"count"`
		Warnings []string `json:"warnings"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil || w.Code != http.StatusOK {
		t.Fatalf("status %d, body %s, err %v", w.Code, w.Body.String(), err)
	}
	if resp.Count == 0 || len(resp.Warnings) != 1 {
		t.Fatalf("count %d, warnings %q; want the outline cut and one warning for the hole", resp.Count, resp.Warnings)
	}
}

// The drilling request carries the PLC settings like the profile and the extract, and the
// response has the extract shape with each hole's commands naming its circle.
func TestCAMDrill_ReturnsProgramInExtractShape(t *testing.T) {
	w := postCAM(t, "/api/cam/drill", `{
		"primitives": [
			{"type": "circle", "id": "pin", "cx": 10, "cy": 5, "radius": 0.5},
			{"type": "circle", "id": "mount", "cx": 20, "cy": 5, "radius": 1.6}
		],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0, "waitTime": 0,
		"thickness": 1.6, "through": true, "overcut": 0.2, "depth": 0,
		"plungeSpeed": 5, "retractClearance": 1,
		"drillDiameter": 1, "minHoleDiameter": 0.4, "maxHoleDiameter": 1.2,
		"peckDepth": 0.8, "tipAngle": 118, "tipThrough": true
	}`)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d: %s", w.Code, w.Body.String())
	}
	var resp plc.ExtractResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("response: %v", err)
	}
	if resp.Count == 0 || resp.Count != len(resp.Output) || len(resp.Commands) != resp.Count {
		t.Fatalf("count %d, %d output lines, %d commands", resp.Count, len(resp.Output), len(resp.Commands))
	}
	program := strings.Join(resp.Output, "\n")
	// 0.2 mm below the bed plus the 0.300 mm point of the 1 mm 118° drill
	if resp.Commands[0].PrimitiveID != "pin" || strings.Contains(program, "X 20.000") || !strings.Contains(program, "Z -0.500, V 5.000") {
		t.Fatalf("want only the pin drilled, through the piece with the tip, down to -0.500:\n%s", program)
	}
}

func TestCAMDrill_NoHoleInTheRangeIsBadRequest(t *testing.T) {
	w := postCAM(t, "/api/cam/drill", `{
		"primitives": [{"type": "circle", "cx": 20, "cy": 5, "radius": 1.6}],
		"rapidSpeed": 1000, "safeZ": 5, "workZ": 0, "thickness": 1.6, "through": true, "plungeSpeed": 5, "retractClearance": 1,
		"drillDiameter": 1, "minHoleDiameter": 0.4, "maxHoleDiameter": 1.2
	}`)

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "nothing to drill") {
		t.Fatalf("status %d, body %s; want 400 saying there is nothing to drill", w.Code, w.Body.String())
	}
}

func TestCAMProfile_OpenContourIsBadRequest(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [{"type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0}],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0,
		"thickness": 1, "through": true,
		"toolDiameter": 3, "side": "outside", "stepDown": 1, "plungeSpeed": 5, "rampAngle": 3
	}`)

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "open contour") {
		t.Fatalf("status %d, body %s; want 400 naming the open contour", w.Code, w.Body.String())
	}
}
