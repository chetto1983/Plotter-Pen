package importservice

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"maps"
	"sync"
	"time"
)

// Cache for parsed DXF results
var (
	parseCache   = make(map[string]*cachedResult)
	parseCacheMu sync.RWMutex
	maxCacheSize = 20
	cacheExpiry  = 30 * time.Minute
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

// cacheKey ties a cache entry to the DXF content and the exact options it was imported with, so
// that two imports of the same content under different options never share an entry. Content and
// options are hashed independently into fixed-length (32 hex char) digests before being joined:
// since each half always has the same length, no combination of content and options can produce
// the string a different combination would (the ImportOptions fields are all bool/float64, so
// %t/%b give an exact, deterministic rendering of every option value).
func cacheKey(content string, opts ImportOptions) string {
	optsText := fmt.Sprintf("%t|%t|%b|%t|%t|%b",
		opts.Normalize, opts.CenterOrigin, opts.ScaleFactor, opts.ExtractPLC, opts.FitArcs, opts.ArcTolerance)
	optsHash := sha256.Sum256([]byte(optsText))
	return hashContent(content) + "_" + hex.EncodeToString(optsHash[:16])
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

// SmartImportCached performs cached smart import. The cache always keeps the value it computed for
// itself: every call, hit or miss, gets back a deep copy it can mutate freely, so one caller's edits
// can never corrupt what another caller reads from the cache later.
func SmartImportCached(content string, opts ImportOptions) (*SmartImportResult, error) {
	key := cacheKey(content, opts)

	// Check cache first
	if cached := getCachedResult(key); cached != nil {
		return cloneSmartImportResult(cached), nil
	}

	// Parse and cache
	result, err := SmartImport(content, opts)
	if err != nil {
		return nil, err
	}

	setCachedResult(key, result)
	return cloneSmartImportResult(result), nil
}

// cloneSmartImportResult deep-copies a SmartImportResult: every slice, and every slice or pointer
// field reachable from its primitives, gets its own backing array so a caller mutating the copy -
// including appending to Primitives/PLCData, editing one primitive's Points, or moving its
// ThroughPoint - cannot reach the original.
func cloneSmartImportResult(r *SmartImportResult) *SmartImportResult {
	if r == nil {
		return nil
	}
	clone := *r
	clone.Primitives = clonePrimitives(r.Primitives)
	clone.PLCData = clonePLCData(r.PLCData)
	clone.Bounds = cloneBounds(r.Bounds)
	clone.Stats = cloneStats(r.Stats)
	return &clone
}

func clonePrimitives(prims []Primitive) []Primitive {
	if prims == nil {
		return nil
	}
	out := make([]Primitive, len(prims))
	for i, p := range prims {
		out[i] = p
		if p.ThroughPoint != nil {
			through := *p.ThroughPoint
			out[i].ThroughPoint = &through
		}
		if p.Points != nil {
			out[i].Points = append([]Point(nil), p.Points...)
		}
	}
	return out
}

func clonePLCData(items []PLCItem) []PLCItem {
	if items == nil {
		return nil
	}
	out := make([]PLCItem, len(items))
	for i, it := range items {
		out[i] = it
		if it.Coords != nil {
			out[i].Coords = append([]float64(nil), it.Coords...)
		}
	}
	return out
}

func cloneBounds(b *Bounds) *Bounds {
	if b == nil {
		return nil
	}
	clone := *b
	return &clone
}

func cloneStats(s ParseStats) ParseStats {
	clone := s
	if s.ByType != nil {
		clone.ByType = make(map[string]int, len(s.ByType))
		maps.Copy(clone.ByType, s.ByType)
	}
	if s.Skipped != nil {
		clone.Skipped = make(map[string]int, len(s.Skipped))
		maps.Copy(clone.Skipped, s.Skipped)
	}
	return clone
}
