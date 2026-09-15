package opcua

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GenerateCert generates a self-signed certificate for OPC UA client authentication
func GenerateCert(org string, bits int, appURI string, validFor time.Duration) ([]byte, *rsa.PrivateKey, error) {
	priv, err := rsa.GenerateKey(rand.Reader, bits)
	if err != nil {
		return nil, nil, err
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, err
	}

	notBefore := time.Now()
	notAfter := notBefore.Add(validFor)

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{org},
			CommonName:   "PlotterPen OPC UA Client",
		},
		NotBefore: notBefore,
		NotAfter:  notAfter,
		// OPC UA 10000-6 6.2.2 requires: digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
		KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageContentCommitment |
			x509.KeyUsageKeyEncipherment | x509.KeyUsageDataEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	if appURI != "" {
		if u, err := url.Parse("urn:" + appURI); err == nil {
			template.URIs = []*url.URL{u}
		}
	}

	// Include common IP addresses for industrial networks
	template.IPAddresses = []net.IP{
		net.ParseIP("127.0.0.1"),
		net.ParseIP("192.168.0.1"), // Common PLC address
		net.ParseIP("192.168.1.1"), // Alternative network
		net.ParseIP("10.0.0.1"),    // Alternative network
	}
	template.DNSNames = []string{"localhost", "plc", "plotter-pen"}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}

	return certDER, priv, nil
}

// GenerateAndSaveCert writes to paths chosen by local configuration.
// HTTP callers must use GenerateAndSaveCertInDir with a fixed root instead.
func GenerateAndSaveCert(certPath, keyPath string) (err error) {
	certRoot, err := openCertificateDir(filepath.Dir(certPath))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, certRoot.Close()) }()
	keyRoot, err := openCertificateDir(filepath.Dir(keyPath))
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, keyRoot.Close()) }()
	return generateAndSaveCert(certRoot, filepath.Base(certPath), keyRoot, filepath.Base(keyPath))
}

// GenerateAndSaveCertInDir writes client.pem, client.der and client.key beneath root.
// os.Root confines even symlinks and concurrent directory changes to that root.
func GenerateAndSaveCertInDir(root *os.Root, dir string) (err error) {
	if !filepath.IsLocal(dir) {
		return fmt.Errorf("certificate directory must be within the certificate root")
	}
	if err := root.MkdirAll(dir, 0700); err != nil {
		return err
	}
	certRoot, err := root.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, certRoot.Close()) }()
	return generateAndSaveCert(certRoot, "client.pem", certRoot, "client.key")
}

func openCertificateDir(dir string) (*os.Root, error) {
	// #nosec G703 -- Only local OPCUA_CERT_PATH/OPCUA_KEY_PATH choose this directory; HTTP generation uses a fixed os.Root.
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	return os.OpenRoot(dir)
}

func generateAndSaveCert(certRoot *os.Root, certName string, keyRoot *os.Root, keyName string) error {
	certDER, key, err := GenerateCert("PlotterPen", 2048, "plotter-pen-client", time.Hour*24*365*10)
	if err != nil {
		return err
	}

	// Save certificate as DER (for PLC import)
	derName := strings.TrimSuffix(certName, filepath.Ext(certName)) + ".der"
	if err := writeCertificateFile(certRoot, derName, certDER); err != nil {
		return err
	}

	// Save certificate as PEM
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	if err := writeCertificateFile(certRoot, certName, certPEM); err != nil {
		return err
	}

	// Save private key as PEM
	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	if err := writeCertificateFile(keyRoot, keyName, keyPEM); err != nil {
		return err
	}

	return nil
}

// Tighten existing files too: WriteFile's mode only applies to newly created files.
func writeCertificateFile(root *os.Root, name string, data []byte) (err error) {
	f, err := root.OpenFile(name, os.O_WRONLY|os.O_CREATE, 0600)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, f.Close()) }()
	if err := f.Chmod(0600); err != nil {
		return err
	}
	if err := f.Truncate(0); err != nil {
		return err
	}
	_, err = f.Write(data)
	return err
}

func readCertificateFile(path string) (data []byte, err error) {
	// The directory is selected by local configuration, and the file cannot escape it.
	root, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	defer func() { err = errors.Join(err, root.Close()) }()
	return root.ReadFile(filepath.Base(path))
}

// LoadOrGenerateCert loads an existing cert or generates a new one, then reads it once.
func LoadOrGenerateCert(certPath, keyPath string) ([]byte, *rsa.PrivateKey, error) {
	if cert, key, err := loadCertPair(certPath, keyPath); err == nil {
		return cert, key, nil
	}
	if err := GenerateAndSaveCert(certPath, keyPath); err != nil {
		return nil, nil, err
	}
	return loadCertPair(certPath, keyPath)
}

func loadCertPair(certPath, keyPath string) ([]byte, *rsa.PrivateKey, error) {
	certPEM, err := readCertificateFile(certPath)
	if err != nil {
		return nil, nil, err
	}
	keyPEM, err := readCertificateFile(keyPath)
	if err != nil {
		return nil, nil, err
	}
	certBlock, _ := pem.Decode(certPEM)
	keyBlock, _ := pem.Decode(keyPEM)
	if certBlock == nil || keyBlock == nil {
		return nil, nil, fmt.Errorf("invalid certificate or private key PEM")
	}
	key, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return nil, nil, err
	}
	return certBlock.Bytes, key, nil
}
