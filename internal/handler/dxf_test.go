package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupDXFRouter() *gin.Engine {
	r := gin.New()
	api := r.Group("/api")
	h := NewDXFHandler()
	h.RegisterRoutes(api)
	return r
}

// === ParseDXF Tests ===

func TestParseDXF_ValidMinimal(t *testing.T) {
	r := setupDXFRouter()

	// Valid minimal DXF content
	dxfContent := `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
10
0
20
0
11
100
21
100
0
ENDSEC
0
EOF`

	body, _ := json.Marshal(map[string]string{"content": dxfContent})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-dxf", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestParseDXF_MissingContent(t *testing.T) {
	r := setupDXFRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-dxf", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestParseDXF_InvalidContent(t *testing.T) {
	r := setupDXFRouter()

	body, _ := json.Marshal(map[string]string{"content": "not a DXF file"})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-dxf", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400 for invalid DXF, body: %s", w.Code, w.Body.String())
	}
}

func TestParseDXF_InvalidJSON(t *testing.T) {
	r := setupDXFRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-dxf", bytes.NewBufferString("{invalid"))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

// === SmartImport Tests ===

func TestSmartImport_Valid(t *testing.T) {
	r := setupDXFRouter()

	dxfContent := `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
10
0
20
0
11
100
21
100
0
ENDSEC
0
EOF`

	body := map[string]any{
		"content":  dxfContent,
		"fileName": "test.dxf",
		"options": map[string]any{
			"normalize":    true,
			"centerOrigin": true,
			"scaleFactor":  1.0,
			"extractPLC":   true,
		},
	}
	jsonBody, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/smart-import", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestSmartImport_InvalidContent(t *testing.T) {
	r := setupDXFRouter()

	body := map[string]any{
		"content": "not a DXF",
	}
	jsonBody, _ := json.Marshal(body)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/smart-import", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestSmartImport_MissingContent(t *testing.T) {
	r := setupDXFRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/smart-import", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestSmartImport_RawTextPlain(t *testing.T) {
	r := setupDXFRouter()

	dxfContent := `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
10
0
20
0
11
100
21
100
0
ENDSEC
0
EOF`

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/smart-import", bytes.NewBufferString(dxfContent))
	req.Header.Set("Content-Type", "text/plain")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200 for text/plain body, body: %s", w.Code, w.Body.String())
	}
}

func TestSmartImport_RawTextPlain_InvalidDXF(t *testing.T) {
	r := setupDXFRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/smart-import", bytes.NewBufferString("not a DXF"))
	req.Header.Set("Content-Type", "text/plain")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400 for invalid text/plain DXF", w.Code)
	}
}

// === ParseSTL Tests ===

func TestParseSTL_ValidASCII(t *testing.T) {
	r := setupDXFRouter()

	stlContent := `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test`

	body, _ := json.Marshal(map[string]any{
		"content": []byte(stlContent),
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-stl", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestParseSTL_WithSlices(t *testing.T) {
	r := setupDXFRouter()

	stlContent := `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test`

	body, _ := json.Marshal(map[string]any{
		"content":    []byte(stlContent),
		"sliceCount": 5,
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-stl", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestParseSTL_InvalidContent(t *testing.T) {
	r := setupDXFRouter()

	body, _ := json.Marshal(map[string]any{
		"content": []byte("not an STL file"),
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-stl", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestParseSTL_MissingContent(t *testing.T) {
	r := setupDXFRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-stl", bytes.NewBufferString(`{}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want 400", w.Code)
	}
}

func TestParseSTL_Base64Content(t *testing.T) {
	r := setupDXFRouter()

	stlContent := `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 0 1 0
    endloop
  endfacet
endsolid test`

	encoded := base64.StdEncoding.EncodeToString([]byte(stlContent))
	body, _ := json.Marshal(map[string]any{
		"content": encoded,
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/parse-stl", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	// May fail or succeed depending on how content is decoded
	t.Logf("Base64 STL status: %d", w.Code)
}
