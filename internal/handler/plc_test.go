package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"plotter-pen/internal/service/plc"
)

func setupPLCRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewPLCHandler()
	h.RegisterRoutes(r.Group("/api"))
	return r
}

func TestPLCExtract_Line(t *testing.T) {
	r := setupPLCRouter()

	x1, y1, x2, y2 := 0.0, 0.0, 100.0, 100.0
	req := plc.ExtractRequest{
		Primitives: []plc.Primitive{{
			Type: plc.PrimitiveLine,
			ID:   "line1",
			X1:   &x1, Y1: &y1,
			X2:   &x2, Y2: &y2,
		}},
		DefaultSpeed: 500,
		RapidSpeed:   2000,
		SafeZ:        5,
		WorkZ:        -2,
	}

	body, _ := json.Marshal(req)
	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp plc.ExtractResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Count < 4 {
		t.Errorf("Expected at least 4 commands, got %d", resp.Count)
	}

	// Check 3D interpolation format
	hasJump := false
	hasLine := false
	for _, cmd := range resp.Output {
		if strings.HasPrefix(cmd, "J ") && strings.Contains(cmd, "Z") {
			hasJump = true
		}
		if strings.HasPrefix(cmd, "L ") && strings.Contains(cmd, "Z") {
			hasLine = true
		}
	}

	if !hasJump {
		t.Error("Expected Jump command with Z coordinate")
	}
	if !hasLine {
		t.Error("Expected Line command with Z coordinate")
	}
}

func TestPLCExtract_Arc(t *testing.T) {
	r := setupPLCRouter()

	x1, y1, x2, y2 := 10.0, 0.0, 0.0, 10.0
	cx, cy := 0.0, 0.0

	req := plc.ExtractRequest{
		Primitives: []plc.Primitive{{
			Type:        plc.PrimitiveArc,
			ID:          "arc1",
			X1:          &x1, Y1: &y1,
			X2:          &x2, Y2: &y2,
			Cx:          &cx, Cy: &cy,
			IsClockwise: false,
		}},
		DefaultSpeed: 300,
		RapidSpeed:   1500,
		SafeZ:        10,
		WorkZ:        -5,
	}

	body, _ := json.Marshal(req)
	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp plc.ExtractResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Check for Arc command
	hasArc := false
	for _, cmd := range resp.Output {
		if strings.HasPrefix(cmd, "A ") && strings.Contains(cmd, "I ") {
			hasArc = true
		}
	}

	if !hasArc {
		t.Error("Expected Arc command with I/J midpoint")
	}
}

func TestPLCExtract_Circle(t *testing.T) {
	r := setupPLCRouter()

	cx, cy, radius := 50.0, 50.0, 25.0

	req := plc.ExtractRequest{
		Primitives: []plc.Primitive{{
			Type:   plc.PrimitiveCircle,
			ID:     "circle1",
			Cx:     &cx,
			Cy:     &cy,
			Radius: &radius,
		}},
		DefaultSpeed: 200,
		RapidSpeed:   1000,
		SafeZ:        3,
		WorkZ:        -1,
	}

	body, _ := json.Marshal(req)
	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp plc.ExtractResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Circle should generate: J, L, A, A, J = 5 commands minimum
	if resp.Count < 5 {
		t.Errorf("Expected at least 5 commands for circle (2 arcs), got %d", resp.Count)
	}

	// Verify we have exactly 2 arc commands with DIFFERENT midpoints
	arcCount := 0
	var arcMidpoints []string
	for _, cmd := range resp.Output {
		if strings.HasPrefix(cmd, "A ") {
			arcCount++
			arcMidpoints = append(arcMidpoints, cmd)
		}
	}

	if arcCount != 2 {
		t.Errorf("Expected exactly 2 arc commands for circle, got %d", arcCount)
	}

	// Verify arc midpoints are different (not degenerate)
	if len(arcMidpoints) == 2 && arcMidpoints[0] == arcMidpoints[1] {
		t.Errorf("Arc midpoints are identical (degenerate circle): %s", arcMidpoints[0])
	}
}

func TestPLCExtract_Rectangle(t *testing.T) {
	r := setupPLCRouter()

	x, y, w, h := 10.0, 10.0, 80.0, 60.0

	req := plc.ExtractRequest{
		Primitives: []plc.Primitive{{
			Type:   plc.PrimitiveRectangle,
			ID:     "rect1",
			X:      &x,
			Y:      &y,
			Width:  &w,
			Height: &h,
		}},
		DefaultSpeed: 400,
		RapidSpeed:   1800,
		SafeZ:        5,
		WorkZ:        -3,
	}

	body, _ := json.Marshal(req)
	rec := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(rec, httpReq)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp plc.ExtractResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Rectangle = 5 corners (closed) + plunge + retract
	if resp.Count < 7 {
		t.Errorf("Expected at least 7 commands for rectangle, got %d", resp.Count)
	}
}

func TestPLCExtract_Empty(t *testing.T) {
	r := setupPLCRouter()

	req := plc.ExtractRequest{
		Primitives: []plc.Primitive{},
	}

	body, _ := json.Marshal(req)
	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var resp plc.ExtractResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if resp.Count != 0 {
		t.Errorf("Expected 0 commands for empty input, got %d", resp.Count)
	}
}

func TestPLCExtract_InvalidJSON(t *testing.T) {
	r := setupPLCRouter()

	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBufferString("{invalid"))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

func TestPLCExtract_3DFormat(t *testing.T) {
	r := setupPLCRouter()

	x1, y1, x2, y2 := 0.0, 0.0, 50.0, 0.0
	req := plc.ExtractRequest{
		Primitives: []plc.Primitive{{
			Type: plc.PrimitiveLine,
			ID:   "line1",
			X1:   &x1, Y1: &y1,
			X2:   &x2, Y2: &y2,
		}},
		DefaultSpeed: 100,
		RapidSpeed:   1000,
		SafeZ:        5,
		WorkZ:        -2,
	}

	body, _ := json.Marshal(req)
	w := httptest.NewRecorder()
	httpReq, _ := http.NewRequest("POST", "/api/plc/extract", bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, httpReq)

	var resp plc.ExtractResponse
	json.Unmarshal(w.Body.Bytes(), &resp)

	// Verify 3D format: each command should have X, Y, Z, V
	for _, cmd := range resp.Output {
		if cmd == "" {
			continue
		}
		if strings.HasPrefix(cmd, "J ") || strings.HasPrefix(cmd, "L ") {
			if !strings.Contains(cmd, "X ") {
				t.Errorf("Command missing X: %s", cmd)
			}
			if !strings.Contains(cmd, "Y ") {
				t.Errorf("Command missing Y: %s", cmd)
			}
			if !strings.Contains(cmd, "Z ") {
				t.Errorf("Command missing Z: %s", cmd)
			}
			if !strings.Contains(cmd, "V ") {
				t.Errorf("Command missing V: %s", cmd)
			}
		}
	}
}
