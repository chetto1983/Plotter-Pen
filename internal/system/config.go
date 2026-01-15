package system

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// ServerConfig holds all server configuration
type ServerConfig struct {
	Port         int
	Host         string
	DBPath       string
	StaticDir    string
	OpenBrowser  bool
	BrowserDelay time.Duration
	GinMode      string
	OPCUAConfig  string
	MaxPortTries int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
}

// DefaultServerConfig returns default server configuration
func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		Port:         8000,
		Host:         "",
		DBPath:       "plotter_pen.db",
		StaticDir:    ".",
		OpenBrowser:  true,
		BrowserDelay: 500 * time.Millisecond,
		GinMode:      "release",
		OPCUAConfig:  "opcua_config.json",
		MaxPortTries: 10,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}
}

// LoadServerConfig loads configuration from environment variables
func LoadServerConfig() ServerConfig {
	cfg := DefaultServerConfig()

	cfg.Port = GetEnvInt("PORT", cfg.Port)
	cfg.Port = GetEnvInt("SERVER_PORT", cfg.Port)
	cfg.Host = GetEnvString("HOST", cfg.Host)
	cfg.DBPath = GetEnvString("DB_PATH", cfg.DBPath)
	cfg.StaticDir = GetEnvString("STATIC_DIR", cfg.StaticDir)
	cfg.OpenBrowser = GetEnvBool("OPEN_BROWSER", cfg.OpenBrowser)
	cfg.GinMode = GetEnvString("GIN_MODE", cfg.GinMode)
	cfg.OPCUAConfig = GetEnvString("OPCUA_CONFIG", cfg.OPCUAConfig)
	cfg.MaxPortTries = GetEnvInt("MAX_PORT_TRIES", cfg.MaxPortTries)

	if delay := GetEnvInt("BROWSER_DELAY_MS", 0); delay > 0 {
		cfg.BrowserDelay = time.Duration(delay) * time.Millisecond
	}

	if timeout := GetEnvInt("READ_TIMEOUT_SEC", 0); timeout > 0 {
		cfg.ReadTimeout = time.Duration(timeout) * time.Second
	}

	if timeout := GetEnvInt("WRITE_TIMEOUT_SEC", 0); timeout > 0 {
		cfg.WriteTimeout = time.Duration(timeout) * time.Second
	}

	return cfg
}

// GetEnvString gets a string from environment variable with default
func GetEnvString(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

// GetEnvInt gets an integer from environment variable with default
func GetEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

// GetEnvBool gets a boolean from environment variable with default
func GetEnvBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		lower := strings.ToLower(val)
		switch lower {
		case "true", "1", "yes", "on":
			return true
		case "false", "0", "no", "off":
			return false
		}
	}
	return defaultVal
}

// GetEnvFloat gets a float64 from environment variable with default
func GetEnvFloat(key string, defaultVal float64) float64 {
	if val := os.Getenv(key); val != "" {
		if f, err := strconv.ParseFloat(val, 64); err == nil {
			return f
		}
	}
	return defaultVal
}

// GetEnvDuration gets a duration from environment variable with default
// Accepts formats: "30s", "5m", "1h", or plain milliseconds
func GetEnvDuration(key string, defaultVal time.Duration) time.Duration {
	if val := os.Getenv(key); val != "" {
		// Try parsing as duration string first
		if d, err := time.ParseDuration(val); err == nil {
			return d
		}
		// Try parsing as milliseconds
		if ms, err := strconv.Atoi(val); err == nil {
			return time.Duration(ms) * time.Millisecond
		}
	}
	return defaultVal
}

// GetEnvStringSlice gets a comma-separated list from environment variable
func GetEnvStringSlice(key string, defaultVal []string) []string {
	if val := os.Getenv(key); val != "" {
		parts := strings.Split(val, ",")
		result := make([]string, 0, len(parts))
		for _, p := range parts {
			if trimmed := strings.TrimSpace(p); trimmed != "" {
				result = append(result, trimmed)
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return defaultVal
}

// MustGetEnv gets an environment variable or panics if not set
func MustGetEnv(key string) string {
	val := os.Getenv(key)
	if val == "" {
		panic("required environment variable not set: " + key)
	}
	return val
}

// IsProduction returns true if running in production mode
func IsProduction() bool {
	mode := GetEnvString("GIN_MODE", "debug")
	return mode == "release"
}

// IsDevelopment returns true if running in development mode
func IsDevelopment() bool {
	return !IsProduction()
}
