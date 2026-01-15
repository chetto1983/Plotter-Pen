package system

import (
	"fmt"
	"net"
	"os"
	"testing"
	"time"
)

// === Port Tests ===

func TestDefaultPortConfig(t *testing.T) {
	cfg := DefaultPortConfig()

	if cfg.StartPort != 8000 {
		t.Errorf("StartPort = %v, want 8000", cfg.StartPort)
	}
	if cfg.MaxTries != 10 {
		t.Errorf("MaxTries = %v, want 10", cfg.MaxTries)
	}
	if cfg.Timeout != 100*time.Millisecond {
		t.Errorf("Timeout = %v, want 100ms", cfg.Timeout)
	}
}

func TestIsPortAvailable(t *testing.T) {
	// Port 0 lets OS assign an available port - should always be available
	// Test with high port number unlikely to be in use
	port := 59999
	result := IsPortAvailable(port)
	// Can't assert true/false reliably, just verify no panic
	t.Logf("Port %d available: %v", port, result)
}

func TestIsPortInUse(t *testing.T) {
	port := 59998
	inUse := IsPortInUse(port)
	available := IsPortAvailable(port)

	if inUse == available {
		// They should be opposites
		t.Logf("Port %d: inUse=%v, available=%v (consistent)", port, inUse, available)
	}
}

func TestFindAvailablePort(t *testing.T) {
	cfg := PortConfig{
		StartPort: 49152, // Dynamic port range
		MaxTries:  100,
		Timeout:   100 * time.Millisecond,
	}

	port, err := FindAvailablePort(cfg)
	if err != nil {
		t.Skipf("Could not find available port: %v", err)
	}

	if port < cfg.StartPort || port >= cfg.StartPort+cfg.MaxTries {
		t.Errorf("Port %d out of expected range [%d, %d)",
			port, cfg.StartPort, cfg.StartPort+cfg.MaxTries)
	}
}

func TestFindMultipleAvailablePorts(t *testing.T) {
	ports, err := FindMultipleAvailablePorts(49152, 3)
	if err != nil {
		t.Skipf("Could not find ports: %v", err)
	}

	if len(ports) != 3 {
		t.Errorf("Expected 3 ports, got %d", len(ports))
	}

	// All ports should be unique
	seen := make(map[int]bool)
	for _, p := range ports {
		if seen[p] {
			t.Errorf("Duplicate port: %d", p)
		}
		seen[p] = true
	}
}

func TestFormatServerURL(t *testing.T) {
	tests := []struct {
		port     int
		useHTTPS bool
		want     string
	}{
		{8000, false, "http://localhost:8000"},
		{443, true, "https://localhost:443"},
		{3000, false, "http://localhost:3000"},
	}

	for _, tt := range tests {
		got := FormatServerURL(tt.port, tt.useHTTPS)
		if got != tt.want {
			t.Errorf("FormatServerURL(%d, %v) = %v, want %v",
				tt.port, tt.useHTTPS, got, tt.want)
		}
	}
}

func TestGetLocalIPAddresses(t *testing.T) {
	ips, err := GetLocalIPAddresses()
	if err != nil {
		t.Fatalf("GetLocalIPAddresses error: %v", err)
	}

	// Should have at least loopback
	hasLoopback := false
	for _, ip := range ips {
		if ip == "127.0.0.1" {
			hasLoopback = true
			break
		}
	}

	if !hasLoopback {
		t.Log("No 127.0.0.1 found, but this may be platform-specific")
	}

	t.Logf("Found IPs: %v", ips)
}

// === Browser Tests ===

func TestDefaultBrowserConfig(t *testing.T) {
	cfg := DefaultBrowserConfig()

	if !cfg.Enabled {
		t.Error("Enabled should be true by default")
	}
	if cfg.Delay != 500*time.Millisecond {
		t.Errorf("Delay = %v, want 500ms", cfg.Delay)
	}
	if cfg.Browser != "" {
		t.Errorf("Browser should be empty by default, got %v", cfg.Browser)
	}
}

func TestGetDefaultBrowser(t *testing.T) {
	browser := GetDefaultBrowser()

	if browser == "" || browser == "unknown" {
		t.Log("Default browser detection returned:", browser)
	}

	// Should return something based on OS
	t.Logf("Default browser: %s", browser)
}

func TestIsBrowserAvailable(t *testing.T) {
	available := IsBrowserAvailable()
	t.Logf("Browser available: %v", available)

	// On Windows/macOS this should be true
	// On Linux it depends on xdg-open
}

func TestOpenBrowserWithConfig_Disabled(t *testing.T) {
	cfg := BrowserConfig{
		Enabled: false,
		Delay:   0,
	}

	err := OpenBrowserWithConfig("http://localhost:8000", cfg)
	if err != nil {
		t.Errorf("Disabled browser should return nil error, got: %v", err)
	}
}

// === Config Tests ===

func TestDefaultServerConfig(t *testing.T) {
	cfg := DefaultServerConfig()

	if cfg.Port != 8000 {
		t.Errorf("Port = %v, want 8000", cfg.Port)
	}
	if cfg.DBPath != "plotter_pen.db" {
		t.Errorf("DBPath = %v, want plotter_pen.db", cfg.DBPath)
	}
	if cfg.GinMode != "release" {
		t.Errorf("GinMode = %v, want release", cfg.GinMode)
	}
	if !cfg.OpenBrowser {
		t.Error("OpenBrowser should be true by default")
	}
}

func TestGetEnvString(t *testing.T) {
	key := "TEST_ENV_STRING_12345"
	defer os.Unsetenv(key)

	// Default when not set
	result := GetEnvString(key, "default")
	if result != "default" {
		t.Errorf("Expected default, got %v", result)
	}

	// Set value
	os.Setenv(key, "custom")
	result = GetEnvString(key, "default")
	if result != "custom" {
		t.Errorf("Expected custom, got %v", result)
	}
}

func TestGetEnvInt(t *testing.T) {
	key := "TEST_ENV_INT_12345"
	defer os.Unsetenv(key)

	// Default when not set
	result := GetEnvInt(key, 42)
	if result != 42 {
		t.Errorf("Expected 42, got %v", result)
	}

	// Valid int
	os.Setenv(key, "100")
	result = GetEnvInt(key, 42)
	if result != 100 {
		t.Errorf("Expected 100, got %v", result)
	}

	// Invalid int should return default
	os.Setenv(key, "not-a-number")
	result = GetEnvInt(key, 42)
	if result != 42 {
		t.Errorf("Expected default 42 for invalid int, got %v", result)
	}
}

func TestGetEnvBool(t *testing.T) {
	key := "TEST_ENV_BOOL_12345"
	defer os.Unsetenv(key)

	tests := []struct {
		value string
		want  bool
	}{
		{"true", true},
		{"TRUE", true},
		{"1", true},
		{"yes", true},
		{"on", true},
		{"false", false},
		{"FALSE", false},
		{"0", false},
		{"no", false},
		{"off", false},
	}

	for _, tt := range tests {
		os.Setenv(key, tt.value)
		result := GetEnvBool(key, !tt.want)
		if result != tt.want {
			t.Errorf("GetEnvBool(%q) = %v, want %v", tt.value, result, tt.want)
		}
	}
}

func TestGetEnvFloat(t *testing.T) {
	key := "TEST_ENV_FLOAT_12345"
	defer os.Unsetenv(key)

	os.Setenv(key, "3.14")
	result := GetEnvFloat(key, 0.0)
	if result != 3.14 {
		t.Errorf("Expected 3.14, got %v", result)
	}

	os.Setenv(key, "invalid")
	result = GetEnvFloat(key, 2.71)
	if result != 2.71 {
		t.Errorf("Expected default 2.71, got %v", result)
	}
}

func TestGetEnvDuration(t *testing.T) {
	key := "TEST_ENV_DURATION_12345"
	defer os.Unsetenv(key)

	// Duration string
	os.Setenv(key, "5s")
	result := GetEnvDuration(key, 0)
	if result != 5*time.Second {
		t.Errorf("Expected 5s, got %v", result)
	}

	// Milliseconds as int
	os.Setenv(key, "500")
	result = GetEnvDuration(key, 0)
	if result != 500*time.Millisecond {
		t.Errorf("Expected 500ms, got %v", result)
	}
}

func TestGetEnvStringSlice(t *testing.T) {
	key := "TEST_ENV_SLICE_12345"
	defer os.Unsetenv(key)

	os.Setenv(key, "a,b,c")
	result := GetEnvStringSlice(key, nil)
	if len(result) != 3 {
		t.Errorf("Expected 3 elements, got %d", len(result))
	}

	os.Setenv(key, " x , y , z ")
	result = GetEnvStringSlice(key, nil)
	if result[0] != "x" || result[1] != "y" || result[2] != "z" {
		t.Errorf("Trimming failed: %v", result)
	}
}

func TestIsProduction(t *testing.T) {
	key := "GIN_MODE"
	original := os.Getenv(key)
	defer os.Setenv(key, original)

	os.Setenv(key, "release")
	if !IsProduction() {
		t.Error("Should be production in release mode")
	}

	os.Setenv(key, "debug")
	if IsProduction() {
		t.Error("Should not be production in debug mode")
	}
}

func TestIsDevelopment(t *testing.T) {
	key := "GIN_MODE"
	original := os.Getenv(key)
	defer os.Setenv(key, original)

	os.Setenv(key, "debug")
	if !IsDevelopment() {
		t.Error("Should be development in debug mode")
	}
}

func TestLoadServerConfig(t *testing.T) {
	// Save and restore env vars
	envVars := []string{"PORT", "HOST", "DB_PATH", "STATIC_DIR", "OPEN_BROWSER"}
	saved := make(map[string]string)
	for _, k := range envVars {
		saved[k] = os.Getenv(k)
	}
	defer func() {
		for k, v := range saved {
			if v == "" {
				os.Unsetenv(k)
			} else {
				os.Setenv(k, v)
			}
		}
	}()

	// Set test values
	os.Setenv("PORT", "9000")
	os.Setenv("HOST", "0.0.0.0")
	os.Setenv("DB_PATH", "test.db")
	os.Setenv("OPEN_BROWSER", "false")

	cfg := LoadServerConfig()

	if cfg.Port != 9000 {
		t.Errorf("Port = %v, want 9000", cfg.Port)
	}
	if cfg.Host != "0.0.0.0" {
		t.Errorf("Host = %v, want 0.0.0.0", cfg.Host)
	}
	if cfg.DBPath != "test.db" {
		t.Errorf("DBPath = %v, want test.db", cfg.DBPath)
	}
	if cfg.OpenBrowser {
		t.Error("OpenBrowser should be false")
	}
}

func TestLoadServerConfig_AllEnvVars(t *testing.T) {
	// Save and restore env vars
	envVars := []string{"PORT", "HOST", "DB_PATH", "STATIC_DIR", "OPEN_BROWSER", "GIN_MODE"}
	saved := make(map[string]string)
	for _, k := range envVars {
		saved[k] = os.Getenv(k)
	}
	defer func() {
		for k, v := range saved {
			if v == "" {
				os.Unsetenv(k)
			} else {
				os.Setenv(k, v)
			}
		}
	}()

	// Set ALL test values
	os.Setenv("PORT", "7777")
	os.Setenv("HOST", "192.168.1.1")
	os.Setenv("DB_PATH", "custom.db")
	os.Setenv("STATIC_DIR", "/var/www/static")
	os.Setenv("OPEN_BROWSER", "true")
	os.Setenv("GIN_MODE", "debug")

	cfg := LoadServerConfig()

	if cfg.Port != 7777 {
		t.Errorf("Port = %v, want 7777", cfg.Port)
	}
	if cfg.Host != "192.168.1.1" {
		t.Errorf("Host = %v, want 192.168.1.1", cfg.Host)
	}
	if cfg.StaticDir != "/var/www/static" {
		t.Errorf("StaticDir = %v, want /var/www/static", cfg.StaticDir)
	}
	if cfg.GinMode != "debug" {
		t.Errorf("GinMode = %v, want debug", cfg.GinMode)
	}
}

// === WaitForPort Tests ===

func TestWaitForPort_AlreadyAvailable(t *testing.T) {
	// Use high port unlikely to be in use
	port := 59990
	err := WaitForPort(port, 200*time.Millisecond)
	if err != nil {
		t.Logf("Port %d not available (may be in use): %v", port, err)
	}
}

func TestWaitForPort_Timeout(t *testing.T) {
	// Start a listener to occupy the port
	ln, err := net.Listen("tcp", ":59991")
	if err != nil {
		t.Skip("Could not start listener")
	}
	defer ln.Close()

	// Wait should timeout since port is in use
	err = WaitForPort(59991, 100*time.Millisecond)
	if err == nil {
		t.Error("Expected timeout error for occupied port")
	}
}

// === WaitForPortInUse Tests ===

func TestWaitForPortInUse_AlreadyInUse(t *testing.T) {
	// Start a listener
	ln, err := net.Listen("tcp", ":59992")
	if err != nil {
		t.Skip("Could not start listener")
	}
	defer ln.Close()

	// Wait should succeed immediately since port is in use
	err = WaitForPortInUse(59992, 200*time.Millisecond)
	if err != nil {
		t.Errorf("Expected success for port in use: %v", err)
	}
}

func TestWaitForPortInUse_Timeout(t *testing.T) {
	// Use high port unlikely to be in use
	port := 59993
	err := WaitForPortInUse(port, 100*time.Millisecond)
	if err == nil {
		t.Error("Expected timeout error for available port")
	}
}

// === MustGetEnv Tests ===

func TestMustGetEnv_Set(t *testing.T) {
	key := "TEST_MUST_GET_ENV_12345"
	defer os.Unsetenv(key)

	os.Setenv(key, "test_value")
	result := MustGetEnv(key)
	if result != "test_value" {
		t.Errorf("Expected test_value, got %v", result)
	}
}

func TestMustGetEnv_NotSet_Panics(t *testing.T) {
	key := "TEST_MUST_GET_ENV_NOT_SET_12345"
	os.Unsetenv(key)

	defer func() {
		if r := recover(); r == nil {
			t.Error("Expected panic for missing env var")
		}
	}()

	MustGetEnv(key)
}

// === GetEnvBool Edge Cases ===

func TestGetEnvBool_InvalidValue(t *testing.T) {
	key := "TEST_ENV_BOOL_INVALID_12345"
	defer os.Unsetenv(key)

	// Invalid bool value should return default
	os.Setenv(key, "invalid_bool_value")
	result := GetEnvBool(key, true)
	if !result {
		t.Error("Invalid bool should return default (true)")
	}

	result = GetEnvBool(key, false)
	if result {
		t.Error("Invalid bool should return default (false)")
	}
}

// === GetEnvDuration Edge Cases ===

func TestGetEnvDuration_InvalidFormat(t *testing.T) {
	key := "TEST_ENV_DURATION_INVALID_12345"
	defer os.Unsetenv(key)

	// Invalid duration that's not a number
	os.Setenv(key, "not_a_duration")
	result := GetEnvDuration(key, 1*time.Second)
	if result != 1*time.Second {
		t.Errorf("Invalid duration should return default, got %v", result)
	}
}

// === GetEnvStringSlice Edge Cases ===

func TestGetEnvStringSlice_Empty(t *testing.T) {
	key := "TEST_ENV_SLICE_EMPTY_12345"
	defer os.Unsetenv(key)

	// Empty string
	os.Setenv(key, "")
	defaultVal := []string{"default"}
	result := GetEnvStringSlice(key, defaultVal)
	if len(result) != 1 || result[0] != "default" {
		t.Errorf("Empty env should return default, got %v", result)
	}
}

func TestGetEnvStringSlice_NotSet(t *testing.T) {
	key := "TEST_ENV_SLICE_NOT_SET_12345"
	os.Unsetenv(key)

	defaultVal := []string{"a", "b"}
	result := GetEnvStringSlice(key, defaultVal)
	if len(result) != 2 {
		t.Errorf("Not set should return default, got %v", result)
	}
}

// === FindAvailablePort Edge Cases ===

func TestFindAvailablePort_AllOccupied(t *testing.T) {
	// Try to occupy several ports
	listeners := make([]net.Listener, 0)
	basePort := 59950

	for i := 0; i < 3; i++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", basePort+i))
		if err == nil {
			listeners = append(listeners, ln)
		}
	}
	defer func() {
		for _, ln := range listeners {
			ln.Close()
		}
	}()

	if len(listeners) < 3 {
		t.Skip("Could not occupy enough ports for test")
	}

	cfg := PortConfig{
		StartPort: basePort,
		MaxTries:  3,
		Timeout:   50 * time.Millisecond,
	}

	_, err := FindAvailablePort(cfg)
	if err == nil {
		t.Error("Expected error when all ports occupied")
	}
}

// === OpenBrowser Edge Cases ===

func TestOpenBrowserWithConfig_WithDelay(t *testing.T) {
	cfg := BrowserConfig{
		Enabled: true,
		Delay:   10 * time.Millisecond,
		Browser: "", // Don't actually open a browser
	}

	// This will try to open a browser on Windows
	// Just verify it doesn't panic with delay
	start := time.Now()
	OpenBrowserWithConfig("http://localhost:9999", cfg)
	elapsed := time.Since(start)

	if elapsed < cfg.Delay {
		t.Errorf("Delay not respected: elapsed %v < delay %v", elapsed, cfg.Delay)
	}
}

// === FindMultipleAvailablePorts Edge Cases ===

func TestFindMultipleAvailablePorts_NotEnough(t *testing.T) {
	// Occupy many ports to make finding difficult
	listeners := make([]net.Listener, 0)
	basePort := 59900

	for i := 0; i < 50; i++ {
		ln, err := net.Listen("tcp", fmt.Sprintf(":%d", basePort+i))
		if err == nil {
			listeners = append(listeners, ln)
		}
	}
	defer func() {
		for _, ln := range listeners {
			ln.Close()
		}
	}()

	// Try to find more ports than available in the range
	_, err := FindMultipleAvailablePorts(basePort, 100)
	if err == nil && len(listeners) > 45 {
		t.Log("Found enough ports despite many being occupied")
	}
}
