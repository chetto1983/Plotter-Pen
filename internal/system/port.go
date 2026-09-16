package system

import (
	"fmt"
	"net"
	"strconv"
	"time"
)

// PortConfig holds port detection settings
type PortConfig struct {
	StartPort int
	MaxTries  int
	Timeout   time.Duration
}

// DefaultPortConfig returns default port configuration
func DefaultPortConfig() PortConfig {
	return PortConfig{
		StartPort: 8000,
		MaxTries:  10,
		Timeout:   100 * time.Millisecond,
	}
}

// FindAvailablePort finds an available port starting from config.StartPort
func FindAvailablePort(cfg PortConfig) (int, error) {
	for i := 0; i < cfg.MaxTries; i++ {
		port := cfg.StartPort + i
		if IsPortAvailable(port) {
			return port, nil
		}
	}
	return 0, fmt.Errorf("no available port found in range %d-%d",
		cfg.StartPort, cfg.StartPort+cfg.MaxTries-1)
}

// IsPortAvailable checks if a TCP port is available
func IsPortAvailable(port int) bool {
	addr := fmt.Sprintf(":%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return false
	}
	return ln.Close() == nil
}

// IsPortInUse reports whether something is serving on the port, by connecting to it.
// It does not ask whether the port can be listened on: an operating system refuses a listen
// for reasons of its own, and Windows reserves whole ranges for Hyper-V, where nothing is
// serving at all.
func IsPortInUse(port int) bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), 200*time.Millisecond)
	if err != nil {
		return false
	}
	return conn.Close() == nil
}

// FindMultipleAvailablePorts finds n available ports
func FindMultipleAvailablePorts(startPort, count int) ([]int, error) {
	ports := make([]int, 0, count)
	port := startPort

	for len(ports) < count && port < startPort+count*10 {
		if IsPortAvailable(port) {
			ports = append(ports, port)
		}
		port++
	}

	if len(ports) < count {
		return nil, fmt.Errorf("could only find %d available ports, needed %d", len(ports), count)
	}

	return ports, nil
}

// WaitForPort waits for a port to become available or times out
func WaitForPort(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if IsPortAvailable(port) {
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("port %d did not become available within %v", port, timeout)
}

// WaitForPortInUse waits for a port to become in use (server started)
func WaitForPortInUse(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if IsPortInUse(port) {
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("port %d did not become in use within %v", port, timeout)
}

// GetLocalIPAddresses returns all local IP addresses
func GetLocalIPAddresses() ([]string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil, fmt.Errorf("failed to get interface addresses: %w", err)
	}

	var ips []string
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok {
			if ip4 := ipnet.IP.To4(); ip4 != nil {
				ips = append(ips, ip4.String())
			}
		}
	}

	return ips, nil
}

// FormatServerURL formats server URL from port
func FormatServerURL(port int, useHTTPS bool) string {
	scheme := "http"
	if useHTTPS {
		scheme = "https"
	}
	return fmt.Sprintf("%s://localhost:%d", scheme, port)
}
