package plc

import (
	"encoding/json"
	"plotter-pen/pkg/geom"
)

// PrimitiveType identifies a drawable shape for PLC extraction.
type PrimitiveType string

// Supported primitive types.
const (
	PrimitiveLine      PrimitiveType = "line"
	PrimitiveArc       PrimitiveType = "arc"
	PrimitiveCircle    PrimitiveType = "circle"
	PrimitiveRectangle PrimitiveType = "rectangle"
	PrimitivePolygon   PrimitiveType = "polygon"
	PrimitivePolyline  PrimitiveType = "polyline"
)

// Primitive represents a drawable primitive from the frontend
type Primitive struct {
	Type   PrimitiveType `json:"type"`
	ID     string        `json:"id,omitempty"`
	Closed bool          `json:"closed,omitempty"`

	// Line/Arc endpoints
	X1 *float64 `json:"x1,omitempty"`
	Y1 *float64 `json:"y1,omitempty"`
	X2 *float64 `json:"x2,omitempty"`
	Y2 *float64 `json:"y2,omitempty"`

	// Arc/Circle center
	Cx *float64 `json:"cx,omitempty"`
	Cy *float64 `json:"cy,omitempty"`

	// Circle/Arc radius
	Radius *float64 `json:"radius,omitempty"`

	// Arc sweep and direction
	Sweep       *float64 `json:"sweep,omitempty"`
	StartAngle  *float64 `json:"startAngle,omitempty"`
	IsClockwise bool     `json:"isClockwise,omitempty"`

	// Rectangle
	X      *float64 `json:"x,omitempty"`
	Y      *float64 `json:"y,omitempty"`
	Width  *float64 `json:"width,omitempty"`
	Height *float64 `json:"height,omitempty"`

	// Polygon/Polyline points
	Points []geom.Point `json:"points,omitempty"`

	// Nested center object (frontend compatibility)
	Center       *geom.Point `json:"center,omitempty"`
	ThroughPoint *geom.Point `json:"throughPoint,omitempty"`
}

// GetStartPoint returns the starting point of a primitive
func (p *Primitive) GetStartPoint() geom.Point {
	switch p.Type {
	case PrimitiveCircle:
		cx, cy, r := p.GetCircleParams()
		return geom.Point{X: cx + r, Y: cy}
	case PrimitiveRectangle:
		if p.X != nil && p.Y != nil {
			return geom.Point{X: *p.X, Y: *p.Y}
		}
	case PrimitivePolygon, PrimitivePolyline:
		if len(p.Points) > 0 {
			return p.Points[0]
		}
	default:
		if p.X1 != nil && p.Y1 != nil {
			return geom.Point{X: *p.X1, Y: *p.Y1}
		}
	}
	return geom.Point{}
}

// GetEndPoint returns the ending point of a primitive
func (p *Primitive) GetEndPoint() geom.Point {
	switch p.Type {
	case PrimitiveCircle:
		return p.GetStartPoint() // Circle ends where it starts
	case PrimitiveRectangle:
		return p.GetStartPoint() // Rectangle ends where it starts
	case PrimitivePolygon:
		if len(p.Points) > 0 {
			return p.Points[0] // Polygon is closed
		}
	case PrimitivePolyline:
		if len(p.Points) > 0 {
			if p.Closed {
				return p.Points[0]
			}
			return p.Points[len(p.Points)-1]
		}
	default:
		if p.X2 != nil && p.Y2 != nil {
			return geom.Point{X: *p.X2, Y: *p.Y2}
		}
	}
	return geom.Point{}
}

// GetCircleParams returns cx, cy, radius for circle primitives
func (p *Primitive) GetCircleParams() (cx, cy, r float64) {
	if p.Center != nil {
		cx, cy = p.Center.X, p.Center.Y
	} else if p.Cx != nil && p.Cy != nil {
		cx, cy = *p.Cx, *p.Cy
	}
	if p.Radius != nil {
		r = *p.Radius
	}
	return
}

// IsClosed returns true if the primitive forms a closed shape
func (p *Primitive) IsClosed() bool {
	switch p.Type {
	case PrimitiveCircle, PrimitiveRectangle, PrimitivePolygon:
		return true
	case PrimitivePolyline:
		return p.Closed
	default:
		return false
	}
}

// UnmarshalJSON implements custom JSON unmarshaling to handle both frontend formats:
// - Frontend/DXF import: startX, startY, endX, endY, centerX, centerY
// - Internal format: x1, y1, x2, y2, cx, cy
func (p *Primitive) UnmarshalJSON(data []byte) error {
	// Use an alias type to avoid infinite recursion
	type PrimitiveAlias Primitive
	aux := &struct {
		StartX       *float64    `json:"startX,omitempty"`
		StartY       *float64    `json:"startY,omitempty"`
		EndX         *float64    `json:"endX,omitempty"`
		EndY         *float64    `json:"endY,omitempty"`
		CenterX      *float64    `json:"centerX,omitempty"`
		CenterY      *float64    `json:"centerY,omitempty"`
		ThroughX     *float64    `json:"throughX,omitempty"`
		ThroughY     *float64    `json:"throughY,omitempty"`
		ThroughPoint *geom.Point `json:"throughPoint,omitempty"`
		*PrimitiveAlias
	}{
		PrimitiveAlias: (*PrimitiveAlias)(p),
	}

	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	// Map DXF/frontend format to internal format (prefer DXF format if present)
	if aux.StartX != nil {
		p.X1 = aux.StartX
	}
	if aux.StartY != nil {
		p.Y1 = aux.StartY
	}
	if aux.EndX != nil {
		p.X2 = aux.EndX
	}
	if aux.EndY != nil {
		p.Y2 = aux.EndY
	}
	if aux.CenterX != nil {
		p.Cx = aux.CenterX
	}
	if aux.CenterY != nil {
		p.Cy = aux.CenterY
	}
	if aux.ThroughPoint != nil {
		p.ThroughPoint = aux.ThroughPoint
	} else if aux.ThroughX != nil && aux.ThroughY != nil {
		p.ThroughPoint = &geom.Point{X: *aux.ThroughX, Y: *aux.ThroughY}
	}

	return nil
}

// Command represents a single PLC instruction
type Command struct {
	Index       int    `json:"index"`
	Type        string `json:"type"`
	CommandStr  string `json:"command"`
	PrimitiveID string `json:"primitiveId,omitempty"`
}

// ExtractRequest is the API request for PLC extraction
type ExtractRequest struct {
	Primitives   []Primitive `json:"primitives"`
	DefaultSpeed float64     `json:"defaultSpeed,omitempty"`
	RapidSpeed   float64     `json:"rapidSpeed,omitempty"`
	SafeZ        float64     `json:"safeZ,omitempty"`
	WorkZ        float64     `json:"workZ,omitempty"`
	WaitTime     int         `json:"waitTime,omitempty"` // ms to wait after Z movements
}

// ExtractResponse is the API response for PLC extraction
type ExtractResponse struct {
	Commands []Command `json:"commands"`
	Output   []string  `json:"output"`
	Count    int       `json:"count"`
}
