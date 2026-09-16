package handler

import (
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
)

func camOperationRequest(r *gin.Engine, method, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/api/cam/operation", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func loadCAMOperation(t *testing.T, r *gin.Engine) persistence.CAMOperation {
	t.Helper()
	w := camOperationRequest(r, http.MethodGet, "")
	var resp struct {
		Data persistence.CAMOperation `json:"data"`
	}
	if w.Code != http.StatusOK {
		t.Fatalf("load: status %d, body %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("load: %v, body %s", err, w.Body.String())
	}
	return resp.Data
}

// The operation shown in the PLC output and its parameters are saved as sent and read back.
func TestCAMOperation_SavesAndLoads(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := camOperationRequest(r, http.MethodPost, `{"operation": "drill", "thickness": 18, "overcut": 0.5,
		"toolDiameter": 3, "side": "inside", "direction": "climb", "profileThrough": false, "profileDepth": 4,
		"drillDiameter": 0.8, "minHoleDiameter": 0.5, "maxHoleDiameter": 0.9, "peckDepth": 0.6, "tipAngle": 130, "tipThrough": true,
		"drillThrough": false, "drillDepth": 12}`)
	if w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}

	got := loadCAMOperation(t, r)
	// the body carries no kind of tool, so the defaults stand: they are drawn, never cut with
	want := persistence.CAMOperation{ID: 1, Operation: "drill", Thickness: 18, Overcut: 0.5,
		ToolDiameter: 3, ToolType: "endmill", DrillType: "drill", Side: "inside", Direction: "climb", ProfileThrough: false, ProfileDepth: 4,
		DrillDiameter: 0.8, MinHoleDiameter: 0.5, MaxHoleDiameter: 0.9, PeckDepth: 0.6, TipAngle: 130, TipThrough: true,
		DrillThrough: false, DrillDepth: 12}
	got.UpdatedAt = want.UpdatedAt
	if got != want {
		t.Fatalf("loaded %+v, want %+v", got, want)
	}

	// false and 0 are values too, not missing fields
	camOperationRequest(r, http.MethodPost, `{"operation": "pen", "thickness": 18, "overcut": 0,
		"toolDiameter": 3, "side": "inside", "direction": "climb", "profileThrough": true, "profileDepth": 4,
		"drillDiameter": 0.8, "minHoleDiameter": 0.5, "maxHoleDiameter": 0.9, "peckDepth": 0, "tipAngle": 130, "tipThrough": false,
		"drillThrough": true, "drillDepth": 12}`)
	if got := loadCAMOperation(t, r); got.Operation != "pen" || got.Overcut != 0 || got.PeckDepth != 0 || got.TipThrough ||
		!got.ProfileThrough || !got.DrillThrough {
		t.Fatalf("after saving zero values: %+v", got)
	}
}

// A profile cut on the line is a choice like the other two sides, and is saved as such.
func TestCAMOperation_SavesTheProfileOnTheLine(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := camOperationRequest(r, http.MethodPost, `{"operation": "profile", "thickness": 1.6, "overcut": 0.2,
		"toolDiameter": 2, "side": "on", "direction": "conventional", "profileThrough": true, "profileDepth": 1,
		"drillDiameter": 1, "minHoleDiameter": 0.4, "maxHoleDiameter": 1.2, "peckDepth": 0, "tipAngle": 118, "tipThrough": false,
		"drillThrough": true, "drillDepth": 1}`)
	if w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}
	if got := loadCAMOperation(t, r); got.Side != "on" {
		t.Fatalf("loaded side %q, want %q", got.Side, "on")
	}
}

// The kind of tool chosen in the library travels with its diameter, so the 3D view can draw it.
func TestCAMOperation_SavesTheKindOfTool(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := camOperationRequest(r, http.MethodPost, `{"operation": "profile", "thickness": 1.6, "overcut": 0.2,
		"toolDiameter": 6, "toolType": "vbit", "side": "outside", "direction": "conventional", "profileThrough": true, "profileDepth": 1,
		"drillDiameter": 2, "drillType": "ballnose", "minHoleDiameter": 0.4, "maxHoleDiameter": 1.2, "peckDepth": 0, "tipAngle": 118,
		"tipThrough": false, "drillThrough": true, "drillDepth": 1}`)
	if w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}
	if got := loadCAMOperation(t, r); got.ToolType != "vbit" || got.DrillType != "ballnose" {
		t.Fatalf("loaded tool %q and drill %q, want %q and %q", got.ToolType, got.DrillType, "vbit", "ballnose")
	}
}

// Numbers are checked when the program is generated, where the error shows in the PLC output; a
// choice outside the known ones is refused and nothing is saved.
func TestCAMOperation_RejectsUnknownChoices(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()
	valid := map[string]any{"operation": "profile", "thickness": 1.6, "overcut": 0.2,
		"toolDiameter": 2, "side": "outside", "direction": "conventional", "profileThrough": true, "profileDepth": 1,
		"drillDiameter": 1, "minHoleDiameter": 0.4, "maxHoleDiameter": 1.2, "peckDepth": 0, "tipAngle": 118, "tipThrough": false,
		"drillThrough": true, "drillDepth": 1}

	valid["toolType"] = "endmill"
	valid["drillType"] = "drill"
	for field, value := range map[string]string{"operation": "pocket", "side": "left", "direction": "down",
		"toolType": "laser", "drillType": "saw"} {
		body := maps.Clone(valid)
		body[field] = value
		raw, _ := json.Marshal(body)
		if w := camOperationRequest(r, http.MethodPost, string(raw)); w.Code != http.StatusBadRequest {
			t.Errorf("%s %q: status %d, body %s; want 400", field, value, w.Code, w.Body.String())
		}
	}
	if got := loadCAMOperation(t, r); got.Operation != "pen" || got.Side != "outside" || got.Direction != "conventional" {
		t.Fatalf("a refused request changed the operation: %+v", got)
	}
}
