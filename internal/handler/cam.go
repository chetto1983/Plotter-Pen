package handler

import (
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"plotter-pen/internal/service/cam"
	"plotter-pen/pkg/geom"

	"github.com/gin-gonic/gin"
)

// CAMHandler handles CAM processing endpoints
type CAMHandler struct{}

// NewCAMHandler creates a new CAM handler
func NewCAMHandler() *CAMHandler {
	return &CAMHandler{}
}

// RegisterRoutes registers CAM routes
func (h *CAMHandler) RegisterRoutes(r *gin.RouterGroup) {
	camGroup := r.Group("/cam")
	{
		camGroup.POST("/process", h.Process)
		camGroup.POST("/parse", h.Parse)
		camGroup.POST("/postprocess", h.Postprocess)
	}
}

// ProcessRequest represents CAM processing input
type ProcessRequest struct {
	Primitives  []PrimitiveInput `json:"primitives"`
	Settings    CAMSettings      `json:"settings"`
	MachineType string           `json:"machineType"`
}

// PrimitiveInput represents a geometric primitive from frontend
type PrimitiveInput struct {
	Type       string    `json:"type"`
	Points     []PointXY `json:"points"`
	X          float64   `json:"x"`
	Y          float64   `json:"y"`
	Radius     float64   `json:"radius"`
	X1         float64   `json:"x1"`
	Y1         float64   `json:"y1"`
	X2         float64   `json:"x2"`
	Y2         float64   `json:"y2"`
	StartAngle float64   `json:"startAngle"` // Arc: start angle in radians
	EndAngle   float64   `json:"endAngle"`   // Arc: end angle in radians
	Clockwise  bool      `json:"clockwise"`  // Arc: direction
	CenterX    float64   `json:"centerX"`    // Arc: center X
	CenterY    float64   `json:"centerY"`    // Arc: center Y
}

// PointXY represents a 2D point from JSON
type PointXY struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// CAMSettings represents CAM configuration
type CAMSettings struct {
	Operation    string  `json:"operation"` // profile, pocket
	ToolDiameter float64 `json:"toolDiameter"`
	Stepover     float64 `json:"stepover"`
	FeedXY       float64 `json:"feedXY"`
	FeedZ        float64 `json:"feedZ"`
	SafeZ        float64 `json:"safeZ"`
	CutDepth     float64 `json:"cutDepth"`
	StepDown     float64 `json:"stepDown"`
	Tolerance    float64 `json:"tolerance"`
	Offset       string  `json:"offset"` // inside, outside, on
}

// Process handles CAM toolpath generation
func (h *CAMHandler) Process(c *gin.Context) {
	var req ProcessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert primitives to geom.Path
	paths := h.convertPrimitives(req.Primitives)
	if len(paths) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no valid primitives"})
		return
	}

	// Optimize path order
	paths = cam.OptimizePathOrder(paths)

	var gcode, plc string
	var toolpath []geom.Path

	switch req.Settings.Operation {
	case "pocket":
		settings := cam.PocketSettings{
			ToolDiameter: req.Settings.ToolDiameter,
			Stepover:     req.Settings.Stepover,
			FeedXY:       req.Settings.FeedXY,
			FeedZ:        req.Settings.FeedZ,
			SafeZ:        req.Settings.SafeZ,
			CutDepth:     req.Settings.CutDepth,
			StepDown:     req.Settings.StepDown,
			Tolerance:    req.Settings.Tolerance,
		}
		result := cam.GeneratePocket(paths, settings)
		gcode = result.GCode
		plc = result.PLC
		toolpath = result.Toolpath

	default: // profile
		settings := cam.ProfileSettings{
			ToolDiameter: req.Settings.ToolDiameter,
			FeedXY:       req.Settings.FeedXY,
			FeedZ:        req.Settings.FeedZ,
			SafeZ:        req.Settings.SafeZ,
			CutDepth:     req.Settings.CutDepth,
			StepDown:     req.Settings.StepDown,
			Tolerance:    req.Settings.Tolerance,
			Offset:       req.Settings.Offset,
		}
		result := cam.GenerateProfile(paths, settings)
		gcode = result.GCode
		plc = result.PLC
		toolpath = result.Toolpath
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"gcode":    gcode,
		"plc":      plc,
		"toolpath": toolpath,
		"stats": gin.H{
			"primitiveCount": len(req.Primitives),
			"pathCount":      len(toolpath),
			"operation":      req.Settings.Operation,
		},
	})
}

// convertPrimitives converts frontend primitives to geom.Path
func (h *CAMHandler) convertPrimitives(primitives []PrimitiveInput) []geom.Path {
	var paths []geom.Path

	for _, p := range primitives {
		switch p.Type {
		case "line":
			path := geom.Path{
				{X: p.X1, Y: p.Y1},
				{X: p.X2, Y: p.Y2},
			}
			paths = append(paths, path)

		case "circle":
			// Approximate circle as polygon (36 segments)
			path := h.circleToPath(p.X, p.Y, p.Radius, 36)
			paths = append(paths, path)

		case "arc":
			// Convert arc to polyline (segments based on arc length)
			path := h.arcToPath(p.CenterX, p.CenterY, p.Radius, p.StartAngle, p.EndAngle, p.Clockwise)
			if len(path) > 0 {
				paths = append(paths, path)
			}

		case "rectangle", "polygon", "polyline":
			if len(p.Points) >= 2 {
				path := make(geom.Path, len(p.Points))
				for i, pt := range p.Points {
					path[i] = geom.Point{X: pt.X, Y: pt.Y}
				}
				paths = append(paths, path)
			}
		}
	}

	return paths
}

// circleToPath converts a circle to a polygon path
func (h *CAMHandler) circleToPath(cx, cy, r float64, segments int) geom.Path {
	path := make(geom.Path, segments+1)
	for i := 0; i <= segments; i++ {
		angle := float64(i) * 2 * math.Pi / float64(segments)
		path[i] = geom.Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		}
	}
	return path
}

// arcToPath converts an arc to a polyline path
func (h *CAMHandler) arcToPath(cx, cy, r, startAngle, endAngle float64, clockwise bool) geom.Path {
	if r <= 0 {
		return nil
	}

	// Normalize angles to [0, 2π)
	for startAngle < 0 {
		startAngle += 2 * math.Pi
	}
	for endAngle < 0 {
		endAngle += 2 * math.Pi
	}

	// Calculate sweep angle
	var sweep float64
	if clockwise {
		sweep = startAngle - endAngle
		if sweep <= 0 {
			sweep += 2 * math.Pi
		}
	} else {
		sweep = endAngle - startAngle
		if sweep <= 0 {
			sweep += 2 * math.Pi
		}
	}

	// Calculate segments based on arc length (at least 8, max 72)
	arcLen := r * sweep
	segments := max(8, min(72, int(arcLen/2.0))) // ~2mm per segment

	path := make(geom.Path, segments+1)
	for i := 0; i <= segments; i++ {
		var angle float64
		t := float64(i) / float64(segments)
		if clockwise {
			angle = startAngle - t*sweep
		} else {
			angle = startAngle + t*sweep
		}
		path[i] = geom.Point{
			X: cx + r*math.Cos(angle),
			Y: cy + r*math.Sin(angle),
		}
	}
	return path
}

// ParseRequest represents G-code parse input
type ParseRequest struct {
	GCode string `json:"gcode" binding:"required"`
}

// Parse handles G-code parsing for visualization
func (h *CAMHandler) Parse(c *gin.Context) {
	var req ParseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse G-code into segments for visualization
	segments, bounds := h.parseGCode(req.GCode)

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"segments": segments,
		"bounds":   bounds,
	})
}

// GCodeSegment represents a parsed G-code move
type GCodeSegment struct {
	Type string  `json:"type"` // rapid, feed
	X1   float64 `json:"x1"`
	Y1   float64 `json:"y1"`
	Z1   float64 `json:"z1"`
	X2   float64 `json:"x2"`
	Y2   float64 `json:"y2"`
	Z2   float64 `json:"z2"`
}

// parseGCode parses G-code string into segments
func (h *CAMHandler) parseGCode(gcode string) ([]GCodeSegment, gin.H) {
	var segments []GCodeSegment
	var curX, curY, curZ float64
	minX, minY, minZ := math.MaxFloat64, math.MaxFloat64, math.MaxFloat64
	maxX, maxY, maxZ := -math.MaxFloat64, -math.MaxFloat64, -math.MaxFloat64

	// Regex patterns for G-code parsing
	cmdRegex := regexp.MustCompile(`(?i)^(G[0123]|M\d+)`)
	xRegex := regexp.MustCompile(`(?i)X(-?\d+\.?\d*)`)
	yRegex := regexp.MustCompile(`(?i)Y(-?\d+\.?\d*)`)
	zRegex := regexp.MustCompile(`(?i)Z(-?\d+\.?\d*)`)

	lines := strings.Split(gcode, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "(") || strings.HasPrefix(line, ";") {
			continue
		}

		cmdMatch := cmdRegex.FindString(line)
		if cmdMatch == "" {
			continue
		}

		cmd := strings.ToUpper(cmdMatch)
		if cmd != "G0" && cmd != "G1" && cmd != "G2" && cmd != "G3" {
			continue
		}

		// Parse coordinates
		newX, newY, newZ := curX, curY, curZ
		if m := xRegex.FindStringSubmatch(line); len(m) > 1 {
			newX, _ = strconv.ParseFloat(m[1], 64)
		}
		if m := yRegex.FindStringSubmatch(line); len(m) > 1 {
			newY, _ = strconv.ParseFloat(m[1], 64)
		}
		if m := zRegex.FindStringSubmatch(line); len(m) > 1 {
			newZ, _ = strconv.ParseFloat(m[1], 64)
		}

		// Create segment
		segType := "feed"
		if cmd == "G0" {
			segType = "rapid"
		}

		segments = append(segments, GCodeSegment{
			Type: segType,
			X1:   curX, Y1: curY, Z1: curZ,
			X2: newX, Y2: newY, Z2: newZ,
		})

		// Update bounds
		minX, maxX = math.Min(minX, newX), math.Max(maxX, newX)
		minY, maxY = math.Min(minY, newY), math.Max(maxY, newY)
		minZ, maxZ = math.Min(minZ, newZ), math.Max(maxZ, newZ)

		curX, curY, curZ = newX, newY, newZ
	}

	// Handle empty case
	if len(segments) == 0 {
		return segments, gin.H{
			"minX": 0, "maxX": 0, "minY": 0, "maxY": 0, "minZ": 0, "maxZ": 0,
		}
	}

	return segments, gin.H{
		"minX": minX, "maxX": maxX,
		"minY": minY, "maxY": maxY,
		"minZ": minZ, "maxZ": maxZ,
	}
}

// PostprocessRequest represents postprocessing input
type PostprocessRequest struct {
	GCode       string `json:"gcode" binding:"required"`
	PostProc    string `json:"postproc"`    // grbl, marlin, custom
	MachineType string `json:"machineType"` // plotter, laser, router, printer
}

// Postprocess handles G-code postprocessing
func (h *CAMHandler) Postprocess(c *gin.Context) {
	var req PostprocessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Apply machine-specific postprocessing
	processed := h.applyPostprocessor(req.GCode, req.PostProc, req.MachineType)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"gcode":   processed,
	})
}

// applyPostprocessor applies machine-specific G-code modifications
func (h *CAMHandler) applyPostprocessor(gcode, _ /*postproc*/, machineType string) string {
	// Machine-specific postprocessing (postproc reserved for future use)
	switch machineType {
	case "plotter":
		// Pen plotter: M3/M5 for pen up/down
		return gcode
	case "laser":
		// Laser: S parameter for power
		return gcode
	case "router":
		// Router: Spindle M3/M5
		return gcode
	default:
		return gcode
	}
}
