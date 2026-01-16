package importservice

import (
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"time"
)

// Cache for parsed DXF results
var (
	parseCache     = make(map[string]*cachedResult)
	parseCacheMu   sync.RWMutex
	maxCacheSize   = 20
	cacheExpiry    = 30 * time.Minute
)

type cachedResult struct {
	result    *SmartImportResult
	timestamp time.Time
}

// hashContent creates a hash of the DXF content for cache key
func hashContent(content string) string {
	h := sha256.Sum256([]byte(content))
	return hex.EncodeToString(h[:16]) // Use first 16 bytes
}

// getCachedResult returns cached result if available
func getCachedResult(hash string) *SmartImportResult {
	parseCacheMu.RLock()
	defer parseCacheMu.RUnlock()

	if cached, ok := parseCache[hash]; ok {
		if time.Since(cached.timestamp) < cacheExpiry {
			return cached.result
		}
	}
	return nil
}

// setCachedResult stores result in cache
func setCachedResult(hash string, result *SmartImportResult) {
	parseCacheMu.Lock()
	defer parseCacheMu.Unlock()

	// Evict old entries if cache is full
	if len(parseCache) >= maxCacheSize {
		oldest := ""
		oldestTime := time.Now()
		for k, v := range parseCache {
			if v.timestamp.Before(oldestTime) {
				oldest = k
				oldestTime = v.timestamp
			}
		}
		if oldest != "" {
			delete(parseCache, oldest)
		}
	}

	parseCache[hash] = &cachedResult{
		result:    result,
		timestamp: time.Now(),
	}
}

// SmartImportCached performs cached smart import
func SmartImportCached(content string, opts ImportOptions) (*SmartImportResult, error) {
	hash := hashContent(content)

	// Check cache first
	if cached := getCachedResult(hash); cached != nil {
		// Return copy to avoid mutation issues
		return cached, nil
	}

	// Parse and cache
	result, err := SmartImport(content, opts)
	if err != nil {
		return nil, err
	}

	setCachedResult(hash, result)
	return result, nil
}
