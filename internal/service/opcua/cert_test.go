package opcua

import (
	"bytes"
	"crypto/x509"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLoadOrGenerateCertPreservesExistingPair(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := filepath.Join(dir, "client.pem"), filepath.Join(dir, "keys", "client.key")
	cert, key, err := LoadOrGenerateCert(certPath, keyPath)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := x509.ParseCertificate(cert)
	if err != nil || !key.PublicKey.Equal(parsed.PublicKey) {
		t.Fatal("certificate and private key do not match")
	}
	loadedCert, loadedKey, err := LoadOrGenerateCert(certPath, keyPath)
	if err != nil || !bytes.Equal(cert, loadedCert) || !key.Equal(loadedKey) {
		t.Fatalf("existing pair was not preserved: %v", err)
	}
}

func TestGenerateAndSaveCertTightensPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix permission bits are not enforced on Windows")
	}
	dir := filepath.Join(t.TempDir(), "certs")
	certPath, keyPath := filepath.Join(dir, "client.pem"), filepath.Join(dir, "client.key")
	if err := GenerateAndSaveCert(certPath, keyPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(keyPath, 0644); err != nil {
		t.Fatal(err)
	}
	if err := GenerateAndSaveCert(certPath, keyPath); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		path string
		mode os.FileMode
	}{
		{dir, 0700},
		{certPath, 0600},
		{filepath.Join(dir, "client.der"), 0600},
		{keyPath, 0600},
	} {
		info, err := os.Stat(tc.path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != tc.mode {
			t.Errorf("%s mode %o, want %o", filepath.Base(tc.path), info.Mode().Perm(), tc.mode)
		}
	}
}

func TestGenerateAndSaveCertRejectsEscapingFileSymlink(t *testing.T) {
	dir := t.TempDir()
	outsidePath := filepath.Join(t.TempDir(), "existing-file")
	sentinel := []byte("preserve this file")
	if err := os.WriteFile(outsidePath, sentinel, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsidePath, filepath.Join(dir, "client.key")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := GenerateAndSaveCert(filepath.Join(dir, "client.pem"), filepath.Join(dir, "client.key")); err == nil {
		t.Fatal("expected an error for an escaping symlink")
	}
	got, err := os.ReadFile(outsidePath)
	if err != nil || !bytes.Equal(got, sentinel) {
		t.Fatalf("outside file was modified: %v", err)
	}
}
