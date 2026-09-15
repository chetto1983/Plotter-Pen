package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateCertificateConfinesOutput(t *testing.T) {
	t.Chdir(t.TempDir())
	r, _ := setupTestWSServer(t)
	for _, tc := range []struct {
		name, dir string
		status    int
	}{
		{"default", "", http.StatusOK},
		{"explicit default", "certs", http.StatusOK},
		{"subdirectory", "certs/machine", http.StatusOK},
		{"parent", "../outside", http.StatusBadRequest},
		{"sibling", "certs-other", http.StatusBadRequest},
		{"escape", "certs/../../outside", http.StatusBadRequest},
		{"absolute outside", t.TempDir(), http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := json.Marshal(CertRequest{OutputDir: tc.dir})
			if err != nil {
				t.Fatal(err)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/opcua/certificates/generate", bytes.NewReader(body)))
			if w.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", w.Code, tc.status, w.Body.String())
			}
			if tc.status != http.StatusOK {
				return
			}
			dir := tc.dir
			if dir == "" {
				dir = DefaultCertsDir
			}
			for _, name := range []string{"client.pem", "client.der", "client.key"} {
				if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestGenerateCertificateRejectsEscapingSymlink(t *testing.T) {
	t.Chdir(t.TempDir())
	outside := t.TempDir()
	if err := os.Mkdir(DefaultCertsDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(DefaultCertsDir, "outside")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	r, _ := setupTestWSServer(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/opcua/certificates/generate",
		bytes.NewBufferString(`{"outputDir":"certs/outside"}`)))
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", w.Code)
	}
	entries, err := os.ReadDir(outside)
	if err != nil || len(entries) != 0 {
		t.Fatalf("outside directory modified: %d entries, error %v", len(entries), err)
	}
}
