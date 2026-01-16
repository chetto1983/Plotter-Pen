package middleware

import (
	"github.com/gin-gonic/gin"
)

// SecurityConfig holds security headers configuration
type SecurityConfig struct {
	ContentTypeNosniff     bool
	XFrameOptions          string // DENY, SAMEORIGIN, or ALLOW-FROM uri
	XSSProtection          string
	ContentSecurityPolicy  string
	ReferrerPolicy         string
	PermissionsPolicy      string
	StrictTransportSec     string
	CacheControl           string
	XContentTypeOptions    string
	XPermittedCrossDomain  string
}

// DefaultSecurityConfig returns default security configuration
func DefaultSecurityConfig() SecurityConfig {
	return SecurityConfig{
		ContentTypeNosniff:    true,
		XFrameOptions:         "DENY",
		XSSProtection:         "1; mode=block",
		ContentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'",
		ReferrerPolicy:        "strict-origin-when-cross-origin",
		CacheControl:          "no-store, max-age=0",
	}
}

// Security returns a security middleware with default configuration
func Security() gin.HandlerFunc {
	return SecurityWithConfig(DefaultSecurityConfig())
}

// SecurityWithConfig returns a security middleware with custom configuration
func SecurityWithConfig(cfg SecurityConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prevent MIME type sniffing
		if cfg.ContentTypeNosniff {
			c.Header("X-Content-Type-Options", "nosniff")
		}

		// Prevent clickjacking
		if cfg.XFrameOptions != "" {
			c.Header("X-Frame-Options", cfg.XFrameOptions)
		}

		// XSS protection (legacy but still useful)
		if cfg.XSSProtection != "" {
			c.Header("X-XSS-Protection", cfg.XSSProtection)
		}

		// Content Security Policy
		if cfg.ContentSecurityPolicy != "" {
			c.Header("Content-Security-Policy", cfg.ContentSecurityPolicy)
		}

		// Referrer Policy
		if cfg.ReferrerPolicy != "" {
			c.Header("Referrer-Policy", cfg.ReferrerPolicy)
		}

		// Permissions Policy
		if cfg.PermissionsPolicy != "" {
			c.Header("Permissions-Policy", cfg.PermissionsPolicy)
		}

		// Strict Transport Security (HSTS)
		if cfg.StrictTransportSec != "" {
			c.Header("Strict-Transport-Security", cfg.StrictTransportSec)
		}

		// Cache Control
		if cfg.CacheControl != "" {
			c.Header("Cache-Control", cfg.CacheControl)
		}

		// X-Permitted-Cross-Domain-Policies
		if cfg.XPermittedCrossDomain != "" {
			c.Header("X-Permitted-Cross-Domain-Policies", cfg.XPermittedCrossDomain)
		}

		c.Next()
	}
}

// APISecurityConfig returns security config optimized for API endpoints
func APISecurityConfig() SecurityConfig {
	return SecurityConfig{
		ContentTypeNosniff: true,
		XFrameOptions:      "DENY",
		XSSProtection:      "1; mode=block",
		CacheControl:       "no-store, no-cache, must-revalidate",
	}
}

// StaticSecurityConfig returns security config optimized for static files
func StaticSecurityConfig() SecurityConfig {
	return SecurityConfig{
		ContentTypeNosniff: true,
		XFrameOptions:      "SAMEORIGIN",
		CacheControl:       "public, max-age=31536000", // 1 year for static assets
	}
}
