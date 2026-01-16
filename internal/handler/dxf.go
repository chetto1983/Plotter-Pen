package handler

import (
	"io"
	"net/http"
	"strings"

	importservice "plotter-pen/internal/service/import"

	"github.com/gin-gonic/gin"
)

// DXFHandler handles DXF import/export endpoints
type DXFHandler struct{}

// NewDXFHandler creates a new DXF handler
func NewDXFHandler() *DXFHandler {
	return &DXFHandler{}
}

// RegisterRoutes registers DXF routes
func (h *DXFHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/parse-dxf", h.ParseDXF)
	r.POST("/smart-import", h.SmartImport)
	r.POST("/export-dxf", h.ExportDXF)
	r.POST("/parse-svg", h.ParseSVG)
	r.POST("/parse-stl", h.ParseSTL)
}

// ParseDXFRequest represents DXF parse input
type ParseDXFRequest struct {
	Content string `json:"content" binding:"required"`
}

// ParseDXF parses a DXF file and returns primitives
func (h *DXFHandler) ParseDXF(c *gin.Context) {
	var req ParseDXFRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate content
	if !importservice.ValidateContent(req.Content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid DXF content"})
		return
	}

	result, err := importservice.ParseDXF(req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to parse DXF",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"primitives": result.Primitives,
		"bounds":     result.Bounds,
		"stats":      result.Stats,
	})
}

// SmartImportRequest represents smart import input
type SmartImportRequest struct {
	Content  string `json:"content" binding:"required"`
	FileName string `json:"fileName"`
	Options  struct {
		Normalize    bool    `json:"normalize"`
		CenterOrigin bool    `json:"centerOrigin"`
		ScaleFactor  float64 `json:"scaleFactor"`
		ExtractPLC   bool    `json:"extractPLC"`
	} `json:"options"`
}

// SmartImport performs intelligent DXF import with optimizations
// Supports both JSON body and raw text/plain body for efficiency with large files
func (h *DXFHandler) SmartImport(c *gin.Context) {
	var content string
	var opts importservice.ImportOptions

	contentType := c.GetHeader("Content-Type")

	// Handle raw text body (efficient for large DXF files)
	if strings.HasPrefix(contentType, "text/plain") {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
			return
		}
		content = string(body)
		// Use default options for raw text - NO normalization to preserve mm units
		// ExtractPLC disabled for performance (can be enabled later when needed)
		opts = importservice.ImportOptions{
			Normalize:    false,
			CenterOrigin: true,
			ExtractPLC:   false,
		}
	} else {
		// Handle JSON body
		var req SmartImportRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		content = req.Content
		opts = importservice.ImportOptions{
			Normalize:    req.Options.Normalize,
			CenterOrigin: req.Options.CenterOrigin,
			ScaleFactor:  req.Options.ScaleFactor,
			ExtractPLC:   req.Options.ExtractPLC,
		}
	}

	// Validate content
	if !importservice.ValidateContent(content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid DXF content"})
		return
	}

	result, err := importservice.SmartImportCached(content, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "smart import failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"primitives": result.Primitives,
		"plcData":    result.PLCData,
		"bounds":     result.Bounds,
		"stats":      result.Stats,
		"layers":     importservice.GetLayerNames(result.Primitives),
	})
}

// ExportDXFRequest represents DXF export input
type ExportDXFRequest struct {
	Primitives []importservice.Primitive `json:"primitives" binding:"required"`
	Options    struct {
		Version string `json:"version"` // AC2000
		Units   string `json:"units"`   // mm, inch
	} `json:"options"`
}

// ExportDXF exports primitives to DXF format
func (h *DXFHandler) ExportDXF(c *gin.Context) {
	var req ExportDXFRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.Primitives) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no primitives to export"})
		return
	}

	content, err := importservice.ExportDXF(req.Primitives, req.Options.Version)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "export failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"content":   content,
		"format":    "AC2000",
		"mimeType":  "application/dxf",
		"extension": ".dxf",
	})
}

// ParseSVGRequest represents SVG parse input
type ParseSVGRequest struct {
	Content string  `json:"content" binding:"required"`
	Scale   float64 `json:"scale,omitempty"`
}

// ParseSVG parses an SVG file and returns primitives
func (h *DXFHandler) ParseSVG(c *gin.Context) {
	var req ParseSVGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !importservice.ValidateSVGContent(req.Content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid SVG content"})
		return
	}

	scale := req.Scale
	if scale <= 0 {
		scale = 1.0
	}

	result, err := importservice.ParseSVG(req.Content, scale)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to parse SVG",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"primitives": result.Primitives,
		"bounds":     result.Bounds,
		"stats":      result.Stats,
		"width":      result.Width,
		"height":     result.Height,
		"viewBox":    result.ViewBox,
	})
}

// ParseSTLRequest represents STL parse input
type ParseSTLRequest struct {
	Content    []byte `json:"content" binding:"required"`
	SliceCount int    `json:"sliceCount,omitempty"` // For 2D slice extraction
}

// ParseSTL parses an STL file and returns mesh data
func (h *DXFHandler) ParseSTL(c *gin.Context) {
	var req ParseSTLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !importservice.ValidateSTLContent(req.Content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid STL content"})
		return
	}

	result, err := importservice.ParseSTL(req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to parse STL",
			"details": err.Error(),
		})
		return
	}

	response := gin.H{
		"success":   true,
		"name":      result.Name,
		"bounds":    result.Bounds,
		"stats":     result.Stats,
		"isAscii":   result.IsASCII,
		"triangles": result.Triangles,
	}

	// Extract 2D slices if requested
	if req.SliceCount > 0 {
		slices := importservice.STLTo2D(result, req.SliceCount)
		response["slices"] = slices
		response["sliceCount"] = len(slices)
	}

	c.JSON(http.StatusOK, response)
}
