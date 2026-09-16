package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/service/cam"
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

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "niente da forare") {
		t.Fatalf("status %d, body %s; want 400 saying in Italian there is nothing to drill", w.Code, w.Body.String())
	}
}

// Settings the profile refuses come back in Italian, every problem named, with the decimal comma.
func TestCAMProfile_RefusalIsInItalian(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [{"type": "rectangle", "x": 0, "y": 0, "width": 20, "height": 20}],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0,
		"thickness": 1, "through": true,
		"toolDiameter": 0, "side": "outside", "stepDown": 1, "plungeSpeed": 5, "rampAngle": 3, "closeGap": 2
	}`)

	want := `{"error":"il diametro della fresa deve essere maggiore di zero; l'apertura da chiudere deve essere fra 0 e 1 mm"}`
	if w.Code != http.StatusBadRequest || w.Body.String() != want {
		t.Fatalf("status %d, body %s; want 400 with %s", w.Code, w.Body.String(), want)
	}
}

// A drawing with nothing closed cannot be cut, but the answer still says where it is open and
// what gap would close it, so the panel can offer to close it.
func TestCAMProfile_OnlyOpenContoursAreUnprocessable(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [
			{"type": "line", "id": "a", "x1": 0, "y1": 0, "x2": 10, "y2": 0},
			{"type": "line", "id": "b", "x1": 10.04, "y1": 0, "x2": 0, "y2": 10},
			{"type": "line", "id": "c", "x1": 0, "y1": 10, "x2": 0, "y2": 0}
		],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0,
		"thickness": 1, "through": true,
		"toolDiameter": 3, "side": "outside", "stepDown": 1, "plungeSpeed": 5, "rampAngle": 3
	}`)

	var body struct {
		Error string            `json:"error"`
		Open  []cam.OpenContour `json:"open"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %s: %v", w.Body.String(), err)
	}
	if w.Code != http.StatusUnprocessableEntity || !strings.Contains(body.Error, "contorni aperti (1)") || !strings.Contains(body.Error, "0,040 mm") ||
		len(body.Open) != 1 || math.Abs(body.Open[0].Gap-0.04) > 1e-9 {
		t.Fatalf("status %d, body %s; want 422 with the contour and its gap", w.Code, w.Body.String())
	}
}

// Closed contours are cut, and the open ones come back beside the program.
func TestCAMProfile_ReportsOpenContoursBesideTheProgram(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [
			{"type": "rectangle", "id": "r", "x": 0, "y": 0, "width": 20, "height": 20},
			{"type": "line", "id": "stray", "x1": 30, "y1": 0, "x2": 40, "y2": 0}
		],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0,
		"thickness": 1, "through": true,
		"toolDiameter": 3, "side": "outside", "stepDown": 1, "plungeSpeed": 5, "rampAngle": 3
	}`)

	var body struct {
		Count int               `json:"count"`
		Open  []cam.OpenContour `json:"open"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %s: %v", w.Body.String(), err)
	}
	if w.Code != http.StatusOK || body.Count == 0 || len(body.Open) != 1 || body.Open[0].PrimitiveIDs[0] != "stray" {
		t.Fatalf("status %d, body %s; want the program and the stray line", w.Code, w.Body.String())
	}
}
