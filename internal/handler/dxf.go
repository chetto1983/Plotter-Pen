package handler

import (
	"io"
	"net/http"
	"strings"

	"plotter-pen/internal/i18n"
	importservice "plotter-pen/internal/service/import"

	"github.com/gin-gonic/gin"
)

// DXFHandler handles DXF/SVG/STL import endpoints
type DXFHandler struct{}

// NewDXFHandler creates a new DXF handler
func NewDXFHandler() *DXFHandler {
	return &DXFHandler{}
}

// RegisterRoutes registers DXF routes
func (h *DXFHandler) RegisterRoutes(r *gin.RouterGroup) {
	r.POST("/parse-dxf", h.ParseDXF)
	r.POST("/smart-import", h.SmartImport)
	r.POST("/parse-svg", h.ParseSVG)
	r.POST("/smart-import-svg", h.SmartImportSVG)
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
		badRequest(c, err)
		return
	}

	parseDrawing(c, req.Content, "DXF", importservice.ValidateContent, importservice.ParseDXF)
}

// ParseSVGRequest represents SVG parse input
type ParseSVGRequest struct {
	Content string `json:"content" binding:"required"`
}

// ParseSVG parses an SVG file and returns primitives
func (h *DXFHandler) ParseSVG(c *gin.Context) {
	var req ParseSVGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	parseDrawing(c, req.Content, "SVG", importservice.ValidateSVGContent, importservice.ParseSVG)
}

// Keep format-specific binding errors in the handlers and share the parse response.
func parseDrawing(c *gin.Context, content, format string, validate func(string) bool, parse func(string) (*importservice.ParseResult, error)) {
	if !validate(content) {
		respondError(c, http.StatusBadRequest, i18n.Errorf("the content is not a valid %s file", format))
		return
	}

	result, err := parse(content)
	if err != nil {
		respondError(c, http.StatusInternalServerError, importError(format, err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"primitives": result.Primitives,
		"bounds":     result.Bounds,
		"stats":      result.Stats,
	})
}

// importError says that a file of the format could not be imported, and why.
func importError(format string, err error) error {
	switch format {
	case "SVG":
		return i18n.Errorf("the SVG could not be imported: %w", err)
	case "STL":
		return i18n.Errorf("the STL could not be imported: %w", err)
	}
	return i18n.Errorf("the DXF could not be imported: %w", err)
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
		FitArcs      bool    `json:"fitArcs"`
		ArcTolerance float64 `json:"arcTolerance"`
	} `json:"options"`
}

// SmartImportSVGRequest represents smart import SVG input
type SmartImportSVGRequest struct {
	Content string `json:"content" binding:"required"`
	Options struct {
		Normalize    bool    `json:"normalize"`
		CenterOrigin bool    `json:"centerOrigin"`
		ScaleFactor  float64 `json:"scaleFactor"`
		ExtractPLC   bool    `json:"extractPLC"`
		FitArcs      bool    `json:"fitArcs"`
		ArcTolerance float64 `json:"arcTolerance"`
		FlipY        bool    `json:"flipY"`
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
			respondError(c, http.StatusBadRequest, i18n.Errorf("failed to read body"))
			return
		}
		content = string(body)
		// Use default options for raw text - NO normalization to preserve mm units
		// ExtractPLC disabled for performance (can be enabled later when needed)
		opts = importservice.ImportOptions{
			Normalize:    false,
			CenterOrigin: true,
			ExtractPLC:   false,
			FitArcs:      true, // not read by the DXF path: closed SPLINEs always use ArcFitTolerance
			ArcTolerance: 0.1,  // not read by the DXF path
		}
	} else {
		// Handle JSON body
		var req SmartImportRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			badRequest(c, err)
			return
		}
		content = req.Content
		opts = importservice.ImportOptions{
			Normalize:    req.Options.Normalize,
			CenterOrigin: req.Options.CenterOrigin,
			ScaleFactor:  req.Options.ScaleFactor,
			ExtractPLC:   req.Options.ExtractPLC,
			FitArcs:      req.Options.FitArcs,
			ArcTolerance: req.Options.ArcTolerance,
		}
	}

	// Validate content
	if !importservice.ValidateContent(content) {
		respondError(c, http.StatusBadRequest, i18n.Errorf("the content is not a valid %s file", "DXF"))
		return
	}

	result, err := importservice.SmartImportCached(content, opts)
	if err != nil {
		respondError(c, http.StatusInternalServerError, importError("DXF", err))
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

// SmartImportSVG performs SVG import with DXF-like options
// Supports both JSON body and raw text/plain body for efficiency with large files
func (h *DXFHandler) SmartImportSVG(c *gin.Context) {
	var content string
	opts := importservice.SVGImportOptions{
		ImportOptions: importservice.ImportOptions{},
		FlipY:         true,
	}

	contentType := c.GetHeader("Content-Type")
	if strings.HasPrefix(contentType, "text/plain") {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			respondError(c, http.StatusBadRequest, i18n.Errorf("failed to read body"))
			return
		}
		content = string(body)
		opts.ImportOptions = importservice.ImportOptions{
			Normalize:    false,
			CenterOrigin: true,
			ExtractPLC:   false,
			FitArcs:      true,
			ArcTolerance: 0.1,
		}
		opts.FlipY = true
	} else {
		var req SmartImportSVGRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			badRequest(c, err)
			return
		}
		content = req.Content
		opts.ImportOptions = importservice.ImportOptions{
			Normalize:    req.Options.Normalize,
			CenterOrigin: req.Options.CenterOrigin,
			ScaleFactor:  req.Options.ScaleFactor,
			ExtractPLC:   req.Options.ExtractPLC,
			FitArcs:      req.Options.FitArcs,
			ArcTolerance: req.Options.ArcTolerance,
		}
		opts.FlipY = req.Options.FlipY
	}

	if !importservice.ValidateSVGContent(content) {
		respondError(c, http.StatusBadRequest, i18n.Errorf("the content is not a valid %s file", "SVG"))
		return
	}

	result, err := importservice.SmartImportSVG(content, opts)
	if err != nil {
		respondError(c, http.StatusInternalServerError, importError("SVG", err))
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

// ParseSTLRequest represents STL parse input
type ParseSTLRequest struct {
	Content    []byte `json:"content" binding:"required"`
	SliceCount int    `json:"sliceCount,omitempty"` // For 2D slice extraction
}

// ParseSTL parses an STL file and returns mesh data
func (h *DXFHandler) ParseSTL(c *gin.Context) {
	var req ParseSTLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		badRequest(c, err)
		return
	}

	if !importservice.ValidateSTLContent(req.Content) {
		respondError(c, http.StatusBadRequest, i18n.Errorf("the content is not a valid %s file", "STL"))
		return
	}

	result, err := importservice.ParseSTL(req.Content)
	if err != nil {
		respondError(c, http.StatusInternalServerError, importError("STL", err))
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
