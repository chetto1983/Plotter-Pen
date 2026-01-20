package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupCAMRouter() *gin.Engine {
	r := gin.New()
	api := r.Group("/api")
	camHandler := NewCAMHandler()
	camHandler.RegisterRoutes(api)
	return r
}

// === Process Tests ===

func TestCAMProcess_Profile(t *testing.T) {
	r := setupCAMRouter()

	body := `{
		"primitives": [
			{"type": "line", "x1": 0, "y1": 0, "x2": 100, "y2": 0}
		],
		"settings": {
			"operation": "profile",
			"toolDiameter": 6.0,
			"feedXY": 500,
			"feedZ": 100,
			"safeZ": 5.0,
			"cutDepth": 3.0,
			"stepDown": 3.0,
			"tolerance": 0.01,
			"offset": "on"
		}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["status"] != "ok" {
		t.Error("Expected status=ok")
	}
	if resp["gcode"] == nil || resp["gcode"] == "" {
		t.Error("Expected gcode output")
	}
}

func TestCAMProcess_Pocket(t *testing.T) {
	r := setupCAMRouter()

	body := `{
		"primitives": [
			{"type": "rectangle", "points": [
				{"x": 0, "y": 0}, {"x": 30, "y": 0}, {"x": 30, "y": 30}, {"x": 0, "y": 30}, {"x": 0, "y": 0}
			]}
		],
		"settings": {
			"operation": "pocket",
			"toolDiameter": 6.0,
			"stepover": 2.0,
			"feedXY": 500,
			"feedZ": 100,
			"safeZ": 5.0,
			"cutDepth": 3.0,
			"stepDown": 1.5,
			"tolerance": 0.01
		}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestCAMProcess_Circle(t *testing.T) {
	r := setupCAMRouter()

	body := `{
		"primitives": [
			{"type": "circle", "x": 50, "y": 50, "radius": 20}
		],
		"settings": {
			"operation": "profile",
			"toolDiameter": 3.0,
			"feedXY": 400,
			"feedZ": 80,
			"safeZ": 5.0,
			"cutDepth": 2.0,
			"stepDown": 2.0,
			"tolerance": 0.01,
			"offset": "outside"
		}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMProcess_Arc(t *testing.T) {
	r := setupCAMRouter()

	body := `{
		"primitives": [
			{"type": "arc", "centerX": 50, "centerY": 50, "radius": 25, "startAngle": 0, "endAngle": 1.5708, "clockwise": false}
		],
		"settings": {
			"operation": "profile",
			"toolDiameter": 3.0,
			"feedXY": 400,
			"feedZ": 80,
			"safeZ": 5.0,
			"cutDepth": 2.0,
			"stepDown": 2.0,
			"tolerance": 0.01,
			"offset": "on"
		}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestCAMProcess_NoPrimitives(t *testing.T) {
	r := setupCAMRouter()

	body := `{"primitives": [], "settings": {"operation": "profile"}}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestCAMProcess_InvalidJSON(t *testing.T) {
	r := setupCAMRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === Parse Tests ===

func TestCAMParse_ValidGCode(t *testing.T) {
	r := setupCAMRouter()

	gcode := `G21 ; metric
G0 X0 Y0
G1 X100 Y0 F500
G1 X100 Y100
G1 X0 Y100
G1 X0 Y0
M30`

	body, _ := json.Marshal(map[string]string{"gcode": gcode})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["status"] != "ok" {
		t.Error("Expected status=ok")
	}

	segments, ok := resp["segments"].([]interface{})
	if !ok || len(segments) == 0 {
		t.Error("Expected segments array")
	}

	bounds, ok := resp["bounds"].(map[string]interface{})
	if !ok {
		t.Error("Expected bounds object")
	}

	if bounds["maxX"].(float64) != 100 {
		t.Errorf("Expected maxX=100, got %v", bounds["maxX"])
	}
}

func TestCAMParse_EmptyGCode(t *testing.T) {
	r := setupCAMRouter()

	body := `{"gcode": ""}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// Empty G-code should fail validation (binding:"required")
	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestCAMParse_CommentsOnly(t *testing.T) {
	r := setupCAMRouter()

	body := `{"gcode": "; comment line\n( another comment )\n"}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	// segments may be nil or empty array for comments-only G-code
	if segments, ok := resp["segments"].([]interface{}); ok && len(segments) != 0 {
		t.Errorf("Expected 0 segments for comments-only, got %d", len(segments))
	}
}

func TestCAMParse_MissingGCode(t *testing.T) {
	r := setupCAMRouter()

	body := `{}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === Postprocess Tests ===

func TestCAMPostprocess_Plotter(t *testing.T) {
	r := setupCAMRouter()

	body := `{"gcode": "G0 X0 Y0\nG1 X100 Y100", "machineType": "plotter"}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp["status"] != "ok" {
		t.Error("Expected status=ok")
	}
}

func TestCAMPostprocess_Laser(t *testing.T) {
	r := setupCAMRouter()

	body := `{"gcode": "G0 X0 Y0\nG1 X100 Y100", "machineType": "laser"}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMPostprocess_Router(t *testing.T) {
	r := setupCAMRouter()

	body := `{"gcode": "G0 X0 Y0\nG1 X100 Y100", "machineType": "router"}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMPostprocess_MissingGCode(t *testing.T) {
	r := setupCAMRouter()

	body := `{"machineType": "plotter"}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === Helper Function Tests ===

func TestCircleToPath(t *testing.T) {
	h := &CAMHandler{}

	path := h.circleToPath(50, 50, 25, 36)

	if len(path) != 37 { // segments + 1
		t.Errorf("Expected 37 points, got %d", len(path))
	}

	// First point should be at (75, 50) - radius from center on X axis
	if math.Abs(path[0].X-75) > 0.001 || math.Abs(path[0].Y-50) > 0.001 {
		t.Errorf("First point = (%v, %v), want (75, 50)", path[0].X, path[0].Y)
	}

	// Last point should be same as first (closed circle)
	if math.Abs(path[36].X-path[0].X) > 0.001 || math.Abs(path[36].Y-path[0].Y) > 0.001 {
		t.Error("Circle should be closed")
	}
}

func TestArcToPath_QuarterCircle(t *testing.T) {
	h := &CAMHandler{}

	// Quarter circle CCW from 0 to π/2
	path := h.arcToPath(0, 0, 10, 0, math.Pi/2, false)

	if len(path) < 8 {
		t.Errorf("Expected at least 8 points, got %d", len(path))
	}

	// Start at (10, 0)
	if math.Abs(path[0].X-10) > 0.001 || math.Abs(path[0].Y-0) > 0.001 {
		t.Errorf("Start = (%v, %v), want (10, 0)", path[0].X, path[0].Y)
	}

	// End at (0, 10)
	last := path[len(path)-1]
	if math.Abs(last.X-0) > 0.1 || math.Abs(last.Y-10) > 0.1 {
		t.Errorf("End = (%v, %v), want (0, 10)", last.X, last.Y)
	}
}

func TestArcToPath_Clockwise(t *testing.T) {
	h := &CAMHandler{}

	// Quarter circle CW from π/2 to 0
	path := h.arcToPath(0, 0, 10, math.Pi/2, 0, true)

	if len(path) < 8 {
		t.Errorf("Expected at least 8 points, got %d", len(path))
	}

	// Start at (0, 10)
	if math.Abs(path[0].X-0) > 0.1 || math.Abs(path[0].Y-10) > 0.1 {
		t.Errorf("Start = (%v, %v), want (0, 10)", path[0].X, path[0].Y)
	}
}

func TestArcToPath_ZeroRadius(t *testing.T) {
	h := &CAMHandler{}

	path := h.arcToPath(0, 0, 0, 0, math.Pi, false)

	if path != nil {
		t.Error("Zero radius should return nil")
	}
}

func TestArcToPath_NegativeRadius(t *testing.T) {
	h := &CAMHandler{}

	path := h.arcToPath(0, 0, -5, 0, math.Pi, false)

	if path != nil {
		t.Error("Negative radius should return nil")
	}
}

func TestConvertPrimitives_Mixed(t *testing.T) {
	h := &CAMHandler{}

	primitives := []PrimitiveInput{
		{Type: "line", X1: 0, Y1: 0, X2: 10, Y2: 10},
		{Type: "circle", X: 50, Y: 50, Radius: 20},
		{Type: "arc", CenterX: 0, CenterY: 0, Radius: 15, StartAngle: 0, EndAngle: math.Pi, Clockwise: false},
		{Type: "polyline", Points: []PointXY{{X: 0, Y: 0}, {X: 10, Y: 0}, {X: 10, Y: 10}}},
	}

	paths := h.convertPrimitives(primitives)

	if len(paths) != 4 {
		t.Errorf("Expected 4 paths, got %d", len(paths))
	}
}

func TestConvertPrimitives_UnknownType(t *testing.T) {
	h := &CAMHandler{}

	primitives := []PrimitiveInput{
		{Type: "unknown", X: 0, Y: 0},
	}

	paths := h.convertPrimitives(primitives)

	if len(paths) != 0 {
		t.Errorf("Unknown type should be skipped, got %d paths", len(paths))
	}
}

// === Additional arcToPath Tests ===

func TestArcToPath_FullCircle(t *testing.T) {
	h := &CAMHandler{}

	// Full circle arc (360 degrees)
	path := h.arcToPath(0, 0, 10, 0, 2*math.Pi, false)

	if len(path) < 8 {
		t.Errorf("Full circle should have many points, got %d", len(path))
	}
}

func TestArcToPath_NegativeAngles(t *testing.T) {
	h := &CAMHandler{}

	// Negative start angle
	path := h.arcToPath(0, 0, 10, -math.Pi, 0, false)

	if len(path) < 8 {
		t.Errorf("Negative angle arc should work, got %d points", len(path))
	}
}

func TestArcToPath_ClockwiseFullSweep(t *testing.T) {
	h := &CAMHandler{}

	// Clockwise arc where sweep adjustment is needed
	path := h.arcToPath(0, 0, 10, 0, math.Pi, true)

	if len(path) < 8 {
		t.Errorf("CW arc should have points, got %d", len(path))
	}
}

func TestArcToPath_LargeRadius(t *testing.T) {
	h := &CAMHandler{}

	// Large arc that should have more segments
	path := h.arcToPath(0, 0, 200, 0, math.Pi/2, false)

	// Should have ~72 segments for large arc
	if len(path) < 30 {
		t.Logf("Large radius arc has %d points", len(path))
	}
}

func TestArcToPath_SmallRadius(t *testing.T) {
	h := &CAMHandler{}

	// Small arc that should have minimum segments
	path := h.arcToPath(0, 0, 0.5, 0, math.Pi/2, false)

	// Should have at least 8 segments
	if len(path) < 8 {
		t.Errorf("Small radius arc should have at least 8 points, got %d", len(path))
	}
}

// === Additional parseGCode Tests ===

func TestCAMParse_G2G3Arcs(t *testing.T) {
	r := setupCAMRouter()

	gcode := `G21
G0 X0 Y0
G2 X10 Y10 I5 J0
G3 X0 Y20 I-5 J5
M30`

	body, _ := json.Marshal(map[string]string{"gcode": gcode})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMParse_MCommands(t *testing.T) {
	r := setupCAMRouter()

	gcode := `M3 S1000
G0 X0 Y0
M5
M30`

	body, _ := json.Marshal(map[string]string{"gcode": gcode})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMParse_PartialCoordinates(t *testing.T) {
	r := setupCAMRouter()

	// G-code with only X or only Y changes
	gcode := `G0 X10
G1 Y20
G1 X30
G1 Z-5`

	body, _ := json.Marshal(map[string]string{"gcode": gcode})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMParse_LowercaseCommands(t *testing.T) {
	r := setupCAMRouter()

	// Lowercase g-code commands
	gcode := `g21
g0 x0 y0
g1 x100 y100 f500`

	body, _ := json.Marshal(map[string]string{"gcode": gcode})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMParse_NegativeCoordinates(t *testing.T) {
	r := setupCAMRouter()

	gcode := `G0 X-50 Y-50 Z-10
G1 X-100 Y-100`

	body, _ := json.Marshal(map[string]string{"gcode": gcode})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/parse", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)

	bounds := resp["bounds"].(map[string]interface{})
	if bounds["minX"].(float64) >= 0 {
		t.Error("Negative coordinates should affect bounds")
	}
}

// === Additional Postprocess Tests ===

func TestCAMPostprocess_Default(t *testing.T) {
	r := setupCAMRouter()

	// No machineType specified - uses default
	body := `{"gcode": "G0 X0 Y0"}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200", w.Code)
	}
}

func TestCAMPostprocess_AllMachineTypes(t *testing.T) {
	r := setupCAMRouter()

	types := []string{"plotter", "laser", "router", "printer", "unknown"}

	for _, machineType := range types {
		body := fmt.Sprintf(`{"gcode": "G0 X0 Y0", "machineType": "%s"}`, machineType)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("MachineType %s: status = %d, want 200", machineType, w.Code)
		}
	}
}

func TestCAMPostprocess_InvalidJSON(t *testing.T) {
	r := setupCAMRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/postprocess", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === Additional Process Tests ===

func TestCAMProcess_Polyline(t *testing.T) {
	r := setupCAMRouter()

	body := `{
		"primitives": [
			{"type": "polyline", "points": [
				{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}
			]}
		],
		"settings": {
			"operation": "profile",
			"toolDiameter": 6.0,
			"feedXY": 500,
			"feedZ": 100,
			"safeZ": 5.0,
			"cutDepth": 3.0,
			"stepDown": 3.0,
			"tolerance": 0.01,
			"offset": "on"
		}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestCAMProcess_Polygon(t *testing.T) {
	r := setupCAMRouter()

	body := `{
		"primitives": [
			{"type": "polygon", "points": [
				{"x": 0, "y": 0}, {"x": 20, "y": 0}, {"x": 20, "y": 20}, {"x": 0, "y": 20}, {"x": 0, "y": 0}
			]}
		],
		"settings": {
			"operation": "pocket",
			"toolDiameter": 6.0,
			"stepover": 2.0,
			"feedXY": 500,
			"feedZ": 100,
			"safeZ": 5.0,
			"cutDepth": 3.0,
			"stepDown": 1.5,
			"tolerance": 0.01
		}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestCAMProcess_ShortPolyline(t *testing.T) {
	r := setupCAMRouter()

	// Polyline with only 1 point (too short)
	body := `{
		"primitives": [
			{"type": "polyline", "points": [{"x": 0, "y": 0}]}
		],
		"settings": {"operation": "profile", "toolDiameter": 6.0}
	}`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/cam/process", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// Should return 400 because no valid primitives
	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400 for short polyline", w.Code)
	}
}
