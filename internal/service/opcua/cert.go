package opcua

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/url"
	"os"
	"path/filepath"
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
		net.ParseIP("192.168.0.1"),   // Common PLC address
		net.ParseIP("192.168.1.1"),   // Alternative network
		net.ParseIP("10.0.0.1"),      // Alternative network
	}
	template.DNSNames = []string{"localhost", "plc", "plotter-pen"}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}

	return certDER, priv, nil
}

// GenerateAndSaveCert generates certificate and saves to files
func GenerateAndSaveCert(certPath, keyPath string) error {
	certDER, key, err := GenerateCert("PlotterPen", 2048, "plotter-pen-client", time.Hour*24*365*10)
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(certPath), 0755); err != nil {
		return err
	}

	// Save certificate as DER (for PLC import)
	derPath := certPath[:len(certPath)-4] + ".der"
	if err := os.WriteFile(derPath, certDER, 0644); err != nil {
		return err
	}

	// Save certificate as PEM
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	if err := os.WriteFile(certPath, certPEM, 0644); err != nil {
		return err
	}

	// Save private key as PEM
	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		return err
	}

	return nil
}

// LoadOrGenerateCert loads existing cert or generates new one
func LoadOrGenerateCert(certPath, keyPath string) ([]byte, *rsa.PrivateKey, error) {
	// Try to load existing
	certPEM, err := os.ReadFile(certPath)
	if err == nil {
		keyPEM, err := os.ReadFile(keyPath)
		if err == nil {
			certBlock, _ := pem.Decode(certPEM)
			keyBlock, _ := pem.Decode(keyPEM)
			if certBlock != nil && keyBlock != nil {
				key, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
				if err == nil {
					return certBlock.Bytes, key, nil
				}
			}
		}
	}

	// Generate new
	if err := GenerateAndSaveCert(certPath, keyPath); err != nil {
		return nil, nil, err
	}

	return LoadOrGenerateCert(certPath, keyPath)
}
