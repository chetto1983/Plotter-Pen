package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimitConfig holds rate limiting configuration
type RateLimitConfig struct {
	RequestsPerSecond float64       // Maximum requests per second
	BurstSize         int           // Maximum burst size
	CleanupInterval   time.Duration // How often to clean up old entries
	KeyFunc           func(*gin.Context) string
}

// DefaultRateLimitConfig returns default rate limit configuration
func DefaultRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		RequestsPerSecond: 100,
		BurstSize:         200,
		CleanupInterval:   5 * time.Minute,
		KeyFunc:           defaultKeyFunc,
	}
}

// defaultKeyFunc returns client IP as the rate limit key
func defaultKeyFunc(c *gin.Context) string {
	return c.ClientIP()
}

// tokenBucket implements a simple token bucket rate limiter
type tokenBucket struct {
	tokens     float64
	lastUpdate time.Time
	rate       float64
	burst      int
}

// rateLimiter manages rate limits per key
type rateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*tokenBucket
	rate     float64
	burst    int
	cleanup  time.Duration
	stopChan chan struct{}
}

// newRateLimiter creates a new rate limiter
func newRateLimiter(cfg RateLimitConfig) *rateLimiter {
	rl := &rateLimiter{
		buckets:  make(map[string]*tokenBucket),
		rate:     cfg.RequestsPerSecond,
		burst:    cfg.BurstSize,
		cleanup:  cfg.CleanupInterval,
		stopChan: make(chan struct{}),
	}

	// Start cleanup goroutine
	go rl.cleanupLoop()

	return rl
}

// cleanupLoop periodically removes old entries
func (rl *rateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.cleanup_old()
		case <-rl.stopChan:
			return
		}
	}
}

// cleanup_old removes entries that haven't been used recently
func (rl *rateLimiter) cleanup_old() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := time.Now().Add(-rl.cleanup)
	for key, bucket := range rl.buckets {
		if bucket.lastUpdate.Before(cutoff) {
			delete(rl.buckets, key)
		}
	}
}

// allow checks if a request should be allowed
func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	bucket, exists := rl.buckets[key]
	if !exists {
		bucket = &tokenBucket{
			tokens:     float64(rl.burst),
			lastUpdate: now,
			rate:       rl.rate,
			burst:      rl.burst,
		}
		rl.buckets[key] = bucket
	}

	// Add tokens based on elapsed time
	elapsed := now.Sub(bucket.lastUpdate).Seconds()
	bucket.tokens += elapsed * bucket.rate
	if bucket.tokens > float64(bucket.burst) {
		bucket.tokens = float64(bucket.burst)
	}
	bucket.lastUpdate = now

	// Check if we have tokens available
	if bucket.tokens >= 1 {
		bucket.tokens--
		return true
	}

	return false
}

// RateLimit returns a rate limiting middleware with default configuration
func RateLimit() gin.HandlerFunc {
	return RateLimitWithConfig(DefaultRateLimitConfig())
}

// RateLimitWithConfig returns a rate limiting middleware with custom config
func RateLimitWithConfig(cfg RateLimitConfig) gin.HandlerFunc {
	limiter := newRateLimiter(cfg)

	return func(c *gin.Context) {
		key := cfg.KeyFunc(c)

		if !limiter.allow(key) {
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":   "rate limit exceeded",
				"message": "Too many requests, please try again later",
			})
			return
		}

		c.Next()
	}
}

// APIRateLimitConfig returns rate limit config for API endpoints
func APIRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		RequestsPerSecond: 50,
		BurstSize:         100,
		CleanupInterval:   5 * time.Minute,
		KeyFunc:           defaultKeyFunc,
	}
}

// StrictRateLimitConfig returns stricter rate limit for sensitive endpoints
func StrictRateLimitConfig() RateLimitConfig {
	return RateLimitConfig{
		RequestsPerSecond: 10,
		BurstSize:         20,
		CleanupInterval:   5 * time.Minute,
		KeyFunc:           defaultKeyFunc,
	}
}
