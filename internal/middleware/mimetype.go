package middleware

import (
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// mimeTypes maps file extensions to MIME types
var mimeTypes = map[string]string{
	".mjs":   "application/javascript",
	".js":    "application/javascript",
	".json":  "application/json",
	".css":   "text/css",
	".html":  "text/html",
	".htm":   "text/html",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".jpg":   "image/jpeg",
	".jpeg":  "image/jpeg",
	".gif":   "image/gif",
	".ico":   "image/x-icon",
	".woff":  "font/woff",
	".woff2": "font/woff2",
	".ttf":   "font/ttf",
	".otf":   "font/otf",
	".map":   "application/json",
}

// MIMEType returns middleware that sets correct Content-Type for static files
func MIMEType() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		ext := strings.ToLower(filepath.Ext(path))

		if mimeType, ok := mimeTypes[ext]; ok {
			c.Header("Content-Type", mimeType)
		}

		c.Next()
	}
}
