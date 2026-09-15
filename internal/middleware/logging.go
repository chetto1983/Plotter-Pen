package middleware

import (
	"encoding/json"
	"log"
	"os"
	"slices"
	"time"

	"github.com/gin-gonic/gin"
)

// LogConfig holds logging configuration
type LogConfig struct {
	Output      *os.File
	SkipPaths   []string
	TimeFormat  string
	JSONFormat  bool
	IncludeIP   bool
	IncludeBody bool
}

// DefaultLogConfig returns default logging configuration
func DefaultLogConfig() LogConfig {
	return LogConfig{
		Output:      os.Stdout,
		SkipPaths:   []string{"/healthz", "/readyz"},
		TimeFormat:  time.RFC3339,
		JSONFormat:  true,
		IncludeIP:   true,
		IncludeBody: false,
	}
}

// LogEntry represents a structured log entry
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Status    int    `json:"status"`
	Latency   string `json:"latency"`
	LatencyMS int64  `json:"latency_ms"`
	ClientIP  string `json:"client_ip,omitempty"`
	UserAgent string `json:"user_agent,omitempty"`
	Error     string `json:"error,omitempty"`
	RequestID string `json:"request_id,omitempty"`
	BodySize  int    `json:"body_size,omitempty"`
}

// Logger returns a logging middleware with default configuration
func Logger() gin.HandlerFunc {
	return LoggerWithConfig(DefaultLogConfig())
}

// LoggerWithConfig returns a logging middleware with custom configuration
func LoggerWithConfig(cfg LogConfig) gin.HandlerFunc {
	logger := log.New(cfg.Output, "", 0)

	return func(c *gin.Context) {
		// Check if path should be skipped
		path := c.Request.URL.Path
		if slices.Contains(cfg.SkipPaths, path) {
			c.Next()
			return
		}

		// Start timer
		start := time.Now()

		// Get request ID if present
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = generateRequestID()
		}
		c.Set("RequestID", requestID)
		c.Header("X-Request-ID", requestID)

		// Process request
		c.Next()

		// Calculate latency
		latency := time.Since(start)

		// Build log entry
		entry := LogEntry{
			Timestamp: start.Format(cfg.TimeFormat),
			Level:     getLogLevel(c.Writer.Status()),
			Method:    c.Request.Method,
			Path:      path,
			Status:    c.Writer.Status(),
			Latency:   latency.String(),
			LatencyMS: latency.Milliseconds(),
			BodySize:  c.Writer.Size(),
			RequestID: requestID,
		}

		if cfg.IncludeIP {
			entry.ClientIP = c.ClientIP()
			entry.UserAgent = c.Request.UserAgent()
		}

		// Check for errors
		if len(c.Errors) > 0 {
			entry.Error = c.Errors.String()
		}

		// Output log
		if cfg.JSONFormat {
			jsonBytes, _ := json.Marshal(entry)
			logger.Println(string(jsonBytes))
		} else {
			logger.Printf("[%s] %s %s %d %s",
				entry.Level, entry.Method, entry.Path,
				entry.Status, entry.Latency)
		}
	}
}

// getLogLevel returns log level based on status code
func getLogLevel(status int) string {
	switch {
	case status >= 500:
		return "ERROR"
	case status >= 400:
		return "WARN"
	default:
		return "INFO"
	}
}

// generateRequestID generates a simple request ID
func generateRequestID() string {
	now := time.Now().UnixNano()
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, 12)
	for i := range 12 {
		result[i] = chars[(now>>(i*5))&31]
	}
	return string(result)
}
