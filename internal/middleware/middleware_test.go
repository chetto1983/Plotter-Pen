package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// === CORS Tests ===

func TestCORS_DefaultConfig(t *testing.T) {
	r := gin.New()
	r.Use(CORS())
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://example.com")
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	origin := w.Header().Get("Access-Control-Allow-Origin")
	if origin != "http://example.com" {
		t.Errorf("Expected origin 'http://example.com', got '%s'", origin)
	}

	methods := w.Header().Get("Access-Control-Allow-Methods")
	if methods == "" {
		t.Error("Expected Access-Control-Allow-Methods header")
	}
}

func TestCORS_OptionsRequest(t *testing.T) {
	r := gin.New()
	r.Use(CORS())
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("OPTIONS", "/test", nil)
	req.Header.Set("Origin", "http://example.com")
	r.ServeHTTP(w, req)

	if w.Code != 204 {
		t.Errorf("Expected status 204 for OPTIONS, got %d", w.Code)
	}
}

func TestCORS_CustomConfig(t *testing.T) {
	cfg := CORSConfig{
		AllowOrigins:     []string{"http://trusted.com"},
		AllowMethods:     []string{"GET"},
		AllowHeaders:     []string{"X-Custom"},
		AllowCredentials: true,
		MaxAge:           3600,
	}

	r := gin.New()
	r.Use(CORSWithConfig(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	// Test trusted origin
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "http://trusted.com")
	r.ServeHTTP(w, req)

	origin := w.Header().Get("Access-Control-Allow-Origin")
	if origin != "http://trusted.com" {
		t.Errorf("Expected origin 'http://trusted.com', got '%s'", origin)
	}

	creds := w.Header().Get("Access-Control-Allow-Credentials")
	if creds != "true" {
		t.Errorf("Expected credentials 'true', got '%s'", creds)
	}
}

// === Security Tests ===

func TestSecurity_DefaultHeaders(t *testing.T) {
	r := gin.New()
	r.Use(Security())
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	headers := map[string]string{
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options":        "DENY",
		"X-XSS-Protection":       "1; mode=block",
	}

	for name, expected := range headers {
		actual := w.Header().Get(name)
		if actual != expected {
			t.Errorf("Header %s: expected '%s', got '%s'", name, expected, actual)
		}
	}
}

func TestSecurity_CustomConfig(t *testing.T) {
	cfg := SecurityConfig{
		XFrameOptions: "SAMEORIGIN",
	}

	r := gin.New()
	r.Use(SecurityWithConfig(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	frame := w.Header().Get("X-Frame-Options")
	if frame != "SAMEORIGIN" {
		t.Errorf("Expected X-Frame-Options 'SAMEORIGIN', got '%s'", frame)
	}
}

func TestSecurity_APIConfig(t *testing.T) {
	cfg := APISecurityConfig()
	if cfg.XFrameOptions != "DENY" {
		t.Errorf("Expected XFrameOptions 'DENY', got '%s'", cfg.XFrameOptions)
	}
}

func TestSecurity_StaticConfig(t *testing.T) {
	cfg := StaticSecurityConfig()
	if cfg.XFrameOptions != "SAMEORIGIN" {
		t.Errorf("Expected XFrameOptions 'SAMEORIGIN', got '%s'", cfg.XFrameOptions)
	}
}

// === Logger Tests ===

func TestLogger_StructuredOutput(t *testing.T) {
	r := gin.New()
	r.Use(Logger())
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	// Check request ID header was set
	requestID := w.Header().Get("X-Request-ID")
	if requestID == "" {
		t.Error("Expected X-Request-ID header to be set")
	}
}

func TestLogger_SkipPaths(t *testing.T) {
	cfg := LogConfig{
		SkipPaths:  []string{"/healthz"},
		JSONFormat: true,
	}

	r := gin.New()
	r.Use(LoggerWithConfig(cfg))
	r.GET("/healthz", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/healthz", nil)
	r.ServeHTTP(w, req)

	// Should not have request ID for skipped paths
	requestID := w.Header().Get("X-Request-ID")
	if requestID != "" {
		t.Error("Expected no X-Request-ID for skipped path")
	}
}

func TestLogger_LogLevels(t *testing.T) {
	tests := []struct {
		status   int
		expected string
	}{
		{200, "INFO"},
		{201, "INFO"},
		{400, "WARN"},
		{404, "WARN"},
		{500, "ERROR"},
		{503, "ERROR"},
	}

	for _, tt := range tests {
		level := getLogLevel(tt.status)
		if level != tt.expected {
			t.Errorf("Status %d: expected '%s', got '%s'", tt.status, tt.expected, level)
		}
	}
}

// === RateLimit Tests ===

func TestRateLimit_AllowsNormalTraffic(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 10,
		BurstSize:         20,
		CleanupInterval:   time.Minute,
		KeyFunc:           func(c *gin.Context) string { return "test" },
	}

	r := gin.New()
	r.Use(RateLimitWithConfig(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	// Should allow first few requests
	for i := range 5 {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		r.ServeHTTP(w, req)

		if w.Code != 200 {
			t.Errorf("Request %d: expected 200, got %d", i, w.Code)
		}
	}
}

func TestRateLimit_BlocksExcessiveTraffic(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 1,
		BurstSize:         2,
		CleanupInterval:   time.Minute,
		KeyFunc:           func(c *gin.Context) string { return "test" },
	}

	r := gin.New()
	r.Use(RateLimitWithConfig(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	// Exhaust the burst
	for range 3 {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		r.ServeHTTP(w, req)
	}

	// Next request should be rate limited
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	if w.Code != 429 {
		t.Errorf("Expected 429 Too Many Requests, got %d", w.Code)
	}

	// Check response body
	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "rate limit exceeded" {
		t.Errorf("Expected error 'rate limit exceeded', got '%v'", resp["error"])
	}
}

func TestRateLimit_DifferentKeys(t *testing.T) {
	keyCounter := 0
	cfg := RateLimitConfig{
		RequestsPerSecond: 1,
		BurstSize:         1,
		CleanupInterval:   time.Minute,
		KeyFunc: func(c *gin.Context) string {
			keyCounter++
			return string(rune('a' + keyCounter%26))
		},
	}

	r := gin.New()
	r.Use(RateLimitWithConfig(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	// Different keys should each get their own bucket
	for i := range 5 {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		r.ServeHTTP(w, req)

		if w.Code != 200 {
			t.Errorf("Request %d with unique key: expected 200, got %d", i, w.Code)
		}
	}
}

func TestRateLimit_Configs(t *testing.T) {
	apiCfg := APIRateLimitConfig()
	if apiCfg.RequestsPerSecond != 50 {
		t.Errorf("Expected API RPS 50, got %f", apiCfg.RequestsPerSecond)
	}

	strictCfg := StrictRateLimitConfig()
	if strictCfg.RequestsPerSecond != 10 {
		t.Errorf("Expected Strict RPS 10, got %f", strictCfg.RequestsPerSecond)
	}
}

// === Recovery Tests ===

func TestRecovery_HandlesPanic(t *testing.T) {
	r := gin.New()
	r.Use(Recovery())
	r.GET("/panic", func(c *gin.Context) {
		panic("test panic")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/panic", nil)
	r.ServeHTTP(w, req)

	if w.Code != 500 {
		t.Errorf("Expected status 500 after panic, got %d", w.Code)
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "internal server error" {
		t.Errorf("Expected error 'internal server error', got '%v'", resp["error"])
	}
}

func TestRecovery_NormalRequest(t *testing.T) {
	r := gin.New()
	r.Use(Recovery())
	r.GET("/ok", func(c *gin.Context) {
		c.String(200, "ok")
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/ok", nil)
	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

// === Helper Function Tests ===

func TestJoinStrings(t *testing.T) {
	tests := []struct {
		input    []string
		expected string
	}{
		{[]string{}, ""},
		{[]string{"a"}, "a"},
		{[]string{"a", "b"}, "a, b"},
		{[]string{"GET", "POST", "PUT"}, "GET, POST, PUT"},
	}

	for _, tt := range tests {
		result := joinStrings(tt.input)
		if result != tt.expected {
			t.Errorf("joinStrings(%v): expected '%s', got '%s'", tt.input, tt.expected, result)
		}
	}
}

func TestIntToString(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{0, "0"},
		{1, "1"},
		{42, "42"},
		{3600, "3600"},
		{86400, "86400"},
		{-1, "-1"},
		{-42, "-42"},
	}

	for _, tt := range tests {
		result := intToString(tt.input)
		if result != tt.expected {
			t.Errorf("intToString(%d): expected '%s', got '%s'", tt.input, tt.expected, result)
		}
	}
}

func TestGenerateRequestID(t *testing.T) {
	seen := make(map[string]bool)
	for range 100 {
		id := generateRequestID()
		if len(id) != 12 {
			t.Errorf("Expected ID length 12, got %d", len(id))
		}
		if seen[id] {
			t.Error("Generated duplicate request ID")
		}
		seen[id] = true
		time.Sleep(time.Nanosecond) // Ensure different timestamps
	}
}

// === Concurrent Tests ===

func TestRateLimit_Concurrent(t *testing.T) {
	cfg := RateLimitConfig{
		RequestsPerSecond: 100,
		BurstSize:         200,
		CleanupInterval:   time.Minute,
		KeyFunc:           defaultKeyFunc,
	}

	r := gin.New()
	r.Use(RateLimitWithConfig(cfg))
	r.GET("/test", func(c *gin.Context) {
		c.String(200, "ok")
	})

	var wg sync.WaitGroup
	successCount := 0
	var mu sync.Mutex

	for range 50 {
		wg.Go(func() {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "127.0.0.1:12345"
			r.ServeHTTP(w, req)

			mu.Lock()
			if w.Code == 200 {
				successCount++
			}
			mu.Unlock()
		})
	}

	wg.Wait()

	// Most requests should succeed with high burst
	if successCount < 40 {
		t.Errorf("Expected at least 40 successful requests, got %d", successCount)
	}
}
