package handler

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// HealthHandler handles health check endpoints
type HealthHandler struct {
	db        *gorm.DB
	startTime time.Time
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(db *gorm.DB) *HealthHandler {
	return &HealthHandler{
		db:        db,
		startTime: time.Now(),
	}
}

// RegisterRoutes registers health check routes (no /api prefix)
// HEAD is registered too: the Docker HEALTHCHECK probes with `wget --spider`
func (h *HealthHandler) RegisterRoutes(r *gin.Engine) {
	for _, method := range []string{http.MethodGet, http.MethodHead} {
		r.Handle(method, "/healthz", h.Healthz)
		r.Handle(method, "/readyz", h.Readyz)
		r.Handle(method, "/health", h.Health) // Alias for /healthz
	}
}

// Healthz is a simple liveness probe
// Returns 200 if the server is running
func (h *HealthHandler) Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
	})
}

// Readyz is a readiness probe
// Returns 200 if the server is ready to accept requests
func (h *HealthHandler) Readyz(c *gin.Context) {
	// Check database connection
	dbOK := h.checkDatabase()

	status := "ready"
	httpStatus := http.StatusOK

	if !dbOK {
		status = "not ready"
		httpStatus = http.StatusServiceUnavailable
	}

	c.JSON(httpStatus, gin.H{
		"status": status,
		"checks": gin.H{
			"database": statusString(dbOK),
		},
	})
}

// Health returns detailed health information
func (h *HealthHandler) Health(c *gin.Context) {
	dbOK := h.checkDatabase()

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	c.JSON(http.StatusOK, gin.H{
		"status": statusString(dbOK),
		"uptime": time.Since(h.startTime).String(),
		"checks": gin.H{
			"database": statusString(dbOK),
		},
		"system": gin.H{
			"goroutines":   runtime.NumGoroutine(),
			"memory_alloc": memStats.Alloc,
			"memory_sys":   memStats.Sys,
			"gc_runs":      memStats.NumGC,
		},
		"version": gin.H{
			"go":   runtime.Version(),
			"arch": runtime.GOARCH,
			"os":   runtime.GOOS,
		},
	})
}

// checkDatabase tests database connectivity
func (h *HealthHandler) checkDatabase() bool {
	if h.db == nil {
		return false
	}

	sqlDB, err := h.db.DB()
	if err != nil {
		return false
	}

	if err := sqlDB.Ping(); err != nil {
		return false
	}

	return true
}

// statusString returns "ok" or "error" based on boolean
func statusString(ok bool) string {
	if ok {
		return "ok"
	}
	return "error"
}
