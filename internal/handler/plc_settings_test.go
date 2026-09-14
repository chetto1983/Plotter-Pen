package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"plotter-pen/internal/persistence"
)

// The profile and drilling settings travel with the pen settings in the same dialog and request.
// The depth is not one of them: it belongs to the piece, with the operation.
func TestPLCSimSettings_SavesCAMSettings(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/plc/settings", strings.NewReader(
		`{"workSpeed": 40, "rapidSpeed": 800, "safeZ": 10, "workZ": 2, "waitTime": 100, "stepDown": 0.4, "plungeSpeed": 3, "rampAngle": 7.5, "retractClearance": 2.5}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}

	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/plc/settings", nil))
	var resp struct {
		Data persistence.PLCSimulationSettings `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("load: %v, body %s", err, w.Body.String())
	}
	got := resp.Data
	if got.WorkSpeed != 40 || got.WorkZ != 2 || got.StepDown != 0.4 || got.PlungeSpeed != 3 || got.RampAngle != 7.5 || got.RetractClearance != 2.5 {
		t.Fatalf("loaded %+v", got)
	}
	if strings.Contains(w.Body.String(), `"depth"`) {
		t.Fatalf("the settings still carry a depth: %s", w.Body.String())
	}
}
