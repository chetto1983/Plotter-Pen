package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

// RecoveryConfig holds recovery middleware configuration
type RecoveryConfig struct {
	StackTrace bool     // Include stack trace in logs
	Logger     *log.Logger
	JSONError  bool     // Return JSON error response
}

// DefaultRecoveryConfig returns default recovery configuration
func DefaultRecoveryConfig() RecoveryConfig {
	return RecoveryConfig{
		StackTrace: true,
		Logger:     log.New(os.Stderr, "[PANIC] ", log.LstdFlags),
		JSONError:  true,
	}
}

// Recovery returns a recovery middleware with default configuration
func Recovery() gin.HandlerFunc {
	return RecoveryWithConfig(DefaultRecoveryConfig())
}

// RecoveryWithConfig returns a recovery middleware with custom configuration
func RecoveryWithConfig(cfg RecoveryConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// Log the panic
				logPanic(cfg, c, err)

				// Return error response
				if cfg.JSONError {
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
						"error":   "internal server error",
						"message": "An unexpected error occurred",
					})
				} else {
					c.AbortWithStatus(http.StatusInternalServerError)
				}
			}
		}()

		c.Next()
	}
}

// logPanic logs panic information
func logPanic(cfg RecoveryConfig, c *gin.Context, err interface{}) {
	entry := map[string]interface{}{
		"type":    "panic",
		"error":   err,
		"method":  c.Request.Method,
		"path":    c.Request.URL.Path,
		"ip":      c.ClientIP(),
	}

	if cfg.StackTrace {
		entry["stack"] = string(debug.Stack())
	}

	if requestID, exists := c.Get("RequestID"); exists {
		entry["request_id"] = requestID
	}

	jsonBytes, _ := json.Marshal(entry)
	cfg.Logger.Println(string(jsonBytes))
}
