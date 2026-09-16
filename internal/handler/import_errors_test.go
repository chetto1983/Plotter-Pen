package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func importRequest(path, contentType, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	setupDXFRouter().ServeHTTP(w, req)
	return w
}

// What the import refuses is said in Italian, with what is wrong in the file.
func TestImport_ErrorsInItalian(t *testing.T) {
	expectError(t, importRequest("/api/smart-import", "text/plain", "hello"),
		http.StatusBadRequest, "il contenuto non è un file DXF valido")
	expectError(t, importRequest("/api/parse-stl", "application/json", `{"content": "c29s"}`),
		http.StatusBadRequest, "il contenuto non è un file STL valido")
	expectError(t, importRequest("/api/parse-dxf", "application/json", `{}`),
		http.StatusBadRequest, "il campo content è obbligatorio")

	truncated := importRequest("/api/smart-import", "text/plain", "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF")
	if truncated.Code != http.StatusInternalServerError ||
		!strings.HasPrefix(truncated.Body.String(), `{"error":"il DXF non si può importare: il DXF non ha una sezione ENTITIES completa`) {
		t.Errorf("truncated DXF: status %d, body %s", truncated.Code, truncated.Body.String())
	}

	path := importRequest("/api/smart-import-svg", "text/plain", `<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10"/></svg>`)
	if path.Code != http.StatusInternalServerError ||
		path.Body.String() != `{"error":"lo SVG non si può importare: percorso SVG: al comando M (spostamento) manca y"}` {
		t.Errorf("broken SVG path: status %d, body %s", path.Code, path.Body.String())
	}
}
