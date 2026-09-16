package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/persistence"
)

func jobRequest(r *gin.Engine, method, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(method, "/api/cam/job", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func saveJob(t *testing.T, r *gin.Engine, steps []persistence.JobStep) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{"steps": steps})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return jobRequest(r, http.MethodPost, string(body))
}

func loadJob(t *testing.T, r *gin.Engine) []persistence.JobStep {
	t.Helper()
	w := jobRequest(r, http.MethodGet, "")
	if w.Code != http.StatusOK {
		t.Fatalf("load: status %d, body %s", w.Code, w.Body.String())
	}
	var resp struct {
		Data struct {
			Steps []persistence.JobStep `json:"steps"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("load: %v, body %s", err, w.Body.String())
	}
	return resp.Data.Steps
}

// step is a step the job accepts, for the tests to change what they are about.
func step(operation, layer string) persistence.JobStep {
	return persistence.JobStep{Layer: layer,
		Operation: operation, Thickness: 1.6, Overcut: 0.2, ToolDiameter: 2, ToolType: "endmill",
		Side: "outside", Direction: "conventional", ProfileThrough: true, ProfileDepth: 1,
		DrillDiameter: 1, DrillType: "drill", MinHoleDiameter: 0.4, MaxHoleDiameter: 1.2,
		TipAngle: 118, DrillThrough: true, DrillDepth: 1,
	}
}

func sameSteps(t *testing.T, got, want []persistence.JobStep) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%d steps, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("step %d is %+v, want %+v", i+1, got[i], want[i])
		}
	}
}

// A database with no job has an empty list, not a null one.
func TestCAMJob_NewDatabaseHasAnEmptyJob(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	w := jobRequest(r, http.MethodGet, "")
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"steps":[]`) {
		t.Fatalf("body %s, want an empty list of steps", w.Body.String())
	}
}

// The steps come back in the order they were sent, each with its layer, its tool and its
// parameters — false and 0 included, which a column default must not overwrite.
func TestCAMJob_SavesTheStepsInOrder(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	holes := step("drill", "FORI")
	holes.DrillID = 5
	holes.DrillType = "drill"
	holes.DrillThrough = false
	holes.TipThrough = true
	holes.DrillDepth = 0.8
	outline := step("profile", "CONTORNO")
	outline.ToolID = 3
	outline.ToolType = "vbit"
	outline.Side = "inside"
	outline.Direction = "climb"
	outline.ProfileThrough = false
	outline.Overcut = 0
	lettering := step("pen", "")
	steps := []persistence.JobStep{holes, outline, lettering}

	if w := saveJob(t, r, steps); w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}
	sameSteps(t, loadJob(t, r), steps)
}

// The panel reads the steps as the operation is read today: the parameters sit beside the layer,
// and the row id and position, which change at every save, are not part of it.
func TestCAMJob_StepsAreFlatJSON(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()
	if w := saveJob(t, r, []persistence.JobStep{step("drill", "FORI")}); w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data struct {
			Steps []map[string]any `json:"steps"`
		} `json:"data"`
	}
	if err := json.Unmarshal(jobRequest(r, http.MethodGet, "").Body.Bytes(), &resp); err != nil {
		t.Fatalf("load: %v", err)
	}
	got := resp.Data.Steps[0]
	for _, key := range []string{"layer", "operation", "drillId", "toolId", "drillThrough"} {
		if _, ok := got[key]; !ok {
			t.Errorf("step has no %q: %v", key, got)
		}
	}
	for _, key := range []string{"id", "position", "CAMParams", "ID", "Position"} {
		if _, ok := got[key]; ok {
			t.Errorf("step carries %q: %v", key, got)
		}
	}
}

// A body without the kinds of tool gets the defaults, as the operation does.
func TestCAMJob_EmptyKindsTakeTheDefaults(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()
	bare := step("profile", "")
	bare.ToolType = ""
	bare.DrillType = ""

	if w := saveJob(t, r, []persistence.JobStep{bare}); w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}
	sameSteps(t, loadJob(t, r), []persistence.JobStep{step("profile", "")})
}

// What is sent is the whole job: fewer steps take the others away, none empties it.
func TestCAMJob_ASaveReplacesTheJob(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()

	first := []persistence.JobStep{step("drill", "FORI"), step("profile", "CONTORNO"), step("pen", "TESTO")}
	if w := saveJob(t, r, first); w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}
	reordered := []persistence.JobStep{first[1], first[0]}
	if w := saveJob(t, r, reordered); w.Code != http.StatusOK {
		t.Fatalf("second save: status %d, body %s", w.Code, w.Body.String())
	}
	sameSteps(t, loadJob(t, r), reordered)

	if w := saveJob(t, r, []persistence.JobStep{}); w.Code != http.StatusOK {
		t.Fatalf("empty save: status %d, body %s", w.Code, w.Body.String())
	}
	sameSteps(t, loadJob(t, r), nil)
}

// One wrong step refuses the whole job, names the step, and leaves the saved job as it was.
func TestCAMJob_RefusesABadStepAndKeepsTheJob(t *testing.T) {
	r, cleanup := setupTestDB(t)
	defer cleanup()
	saved := []persistence.JobStep{step("drill", "FORI"), step("profile", "CONTORNO")}
	if w := saveJob(t, r, saved); w.Code != http.StatusOK {
		t.Fatalf("save: status %d, body %s", w.Code, w.Body.String())
	}

	bad := map[string]func(*persistence.JobStep){
		"operation": func(s *persistence.JobStep) { s.Operation = "pocket" },
		"side":      func(s *persistence.JobStep) { s.Side = "around" },
		"direction": func(s *persistence.JobStep) { s.Direction = "sideways" },
		"toolType":  func(s *persistence.JobStep) { s.ToolType = "spoon" },
		"drillId":   func(s *persistence.JobStep) { s.DrillID = -1 },
	}
	for name, spoil := range bad {
		wrong := step("profile", "CONTORNO")
		spoil(&wrong)
		w := saveJob(t, r, []persistence.JobStep{step("pen", ""), wrong})
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, w.Code)
			continue
		}
		if !strings.Contains(w.Body.String(), "step 2") {
			t.Errorf("%s: body %s does not name step 2", name, w.Body.String())
		}
	}
	if w := jobRequest(r, http.MethodPost, `{}`); w.Code != http.StatusBadRequest {
		t.Errorf("a body without steps: status %d, want 400", w.Code)
	}
	sameSteps(t, loadJob(t, r), saved)
}
