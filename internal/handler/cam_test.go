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
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewCAMHandler().RegisterRoutes(r.Group("/api"))

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/cam/profile", strings.NewReader(body))
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
		"toolDiameter": 3, "side": "outside", "direction": "climb",
		"depth": 1, "stepDown": 0.5, "plungeSpeed": 5
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
	if plunges != 2 {
		t.Fatalf("%d plunges, want one per 0.5 mm pass:\n%s", plunges, strings.Join(resp.Output, "\n"))
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
		"toolDiameter": 6, "side": "outside", "depth": 1, "stepDown": 1, "plungeSpeed": 5
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

func TestCAMProfile_OpenContourIsBadRequest(t *testing.T) {
	w := postCAMProfile(t, `{
		"primitives": [{"type": "line", "x1": 0, "y1": 0, "x2": 10, "y2": 0}],
		"defaultSpeed": 50, "rapidSpeed": 1000, "safeZ": 5, "workZ": 0,
		"toolDiameter": 3, "side": "outside", "depth": 1, "stepDown": 1, "plungeSpeed": 5
	}`)

	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "open contour") {
		t.Fatalf("status %d, body %s; want 400 naming the open contour", w.Code, w.Body.String())
	}
}
