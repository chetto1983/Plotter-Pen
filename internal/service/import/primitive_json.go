package importservice

import (
	"encoding/json"
	"math"
)

// MarshalJSON outputs JS-compatible field names for primitives.
func (p Primitive) MarshalJSON() ([]byte, error) {
	payload := map[string]any{
		"type": p.Type,
	}
	if p.ID != "" {
		payload["id"] = p.ID
	}
	if p.Layer != "" {
		payload["layer"] = p.Layer
	}
	if p.Stroke != "" {
		payload["stroke"] = p.Stroke
	}

	switch p.Type {
	case "line":
		payload["x1"] = p.StartX
		payload["y1"] = p.StartY
		payload["x2"] = p.EndX
		payload["y2"] = p.EndY
	case "arc":
		payload["ax"] = p.StartX
		payload["ay"] = p.StartY
		payload["bx"] = p.EndX
		payload["by"] = p.EndY
		payload["cx"] = p.CenterX
		payload["cy"] = p.CenterY

		radius := p.Radius
		if radius == 0 {
			radius = distance(Point{X: p.StartX, Y: p.StartY}, Point{X: p.CenterX, Y: p.CenterY})
		}
		payload["radius"] = radius

		startAngle := math.Atan2(p.StartY-p.CenterY, p.StartX-p.CenterX)
		endAngle := math.Atan2(p.EndY-p.CenterY, p.EndX-p.CenterX)
		sweep := p.Sweep
		if sweep == 0 {
			sweep = calcSweep(startAngle, endAngle, Point{X: p.CenterX, Y: p.CenterY}, p.ThroughPoint)
		}
		payload["startAngle"] = startAngle
		payload["sweep"] = sweep

		if p.ThroughPoint != nil {
			payload["throughPoint"] = p.ThroughPoint
		}
	case "circle":
		payload["cx"] = p.CenterX
		payload["cy"] = p.CenterY
		payload["radius"] = p.Radius
	case "rectangle":
		payload["x"] = p.X
		payload["y"] = p.Y
		payload["width"] = p.Width
		payload["height"] = p.Height
	case "polyline", "polygon":
		payload["points"] = p.Points
		if p.Type == "polygon" {
			payload["closed"] = true
		} else if p.Closed {
			payload["closed"] = true
		}
	}

	return json.Marshal(payload)
}

// UnmarshalJSON accepts both JS and legacy field names for primitives.
func (p *Primitive) UnmarshalJSON(data []byte) error {
	type primitiveJSON struct {
		Type         string   `json:"type"`
		ID           string   `json:"id"`
		Layer        string   `json:"layer"`
		Stroke       string   `json:"stroke"`
		X1           *float64 `json:"x1"`
		Y1           *float64 `json:"y1"`
		X2           *float64 `json:"x2"`
		Y2           *float64 `json:"y2"`
		Ax           *float64 `json:"ax"`
		Ay           *float64 `json:"ay"`
		Bx           *float64 `json:"bx"`
		By           *float64 `json:"by"`
		StartX       *float64 `json:"startX"`
		StartY       *float64 `json:"startY"`
		EndX         *float64 `json:"endX"`
		EndY         *float64 `json:"endY"`
		Cx           *float64 `json:"cx"`
		Cy           *float64 `json:"cy"`
		CenterX      *float64 `json:"centerX"`
		CenterY      *float64 `json:"centerY"`
		Radius       *float64 `json:"radius"`
		Sweep        *float64 `json:"sweep"`
		ThroughPoint *Point   `json:"throughPoint"`
		ThroughX     *float64 `json:"throughX"`
		ThroughY     *float64 `json:"throughY"`
		Points       []Point  `json:"points"`
		Closed       *bool    `json:"closed"`
		X            *float64 `json:"x"`
		Y            *float64 `json:"y"`
		Width        *float64 `json:"width"`
		Height       *float64 `json:"height"`
	}

	var aux primitiveJSON
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	p.Type = aux.Type
	p.ID = aux.ID
	p.Layer = aux.Layer
	p.Stroke = aux.Stroke

	pick := func(values ...*float64) float64 {
		for _, v := range values {
			if v != nil {
				return *v
			}
		}
		return 0
	}

	if aux.Type == "arc" {
		p.StartX = pick(aux.Ax, aux.StartX, aux.X1)
		p.StartY = pick(aux.Ay, aux.StartY, aux.Y1)
		p.EndX = pick(aux.Bx, aux.EndX, aux.X2)
		p.EndY = pick(aux.By, aux.EndY, aux.Y2)
	} else {
		p.StartX = pick(aux.X1, aux.StartX, aux.Ax)
		p.StartY = pick(aux.Y1, aux.StartY, aux.Ay)
		p.EndX = pick(aux.X2, aux.EndX, aux.Bx)
		p.EndY = pick(aux.Y2, aux.EndY, aux.By)
	}

	p.CenterX = pick(aux.Cx, aux.CenterX)
	p.CenterY = pick(aux.Cy, aux.CenterY)

	if aux.Radius != nil {
		p.Radius = *aux.Radius
	}
	if aux.Sweep != nil {
		p.Sweep = *aux.Sweep
	}

	if aux.ThroughPoint != nil {
		p.ThroughPoint = aux.ThroughPoint
	} else if aux.ThroughX != nil && aux.ThroughY != nil {
		p.ThroughPoint = &Point{X: *aux.ThroughX, Y: *aux.ThroughY}
	}

	if aux.Points != nil {
		p.Points = aux.Points
	}
	if aux.Closed != nil {
		p.Closed = *aux.Closed
	}

	if aux.X != nil {
		p.X = *aux.X
	}
	if aux.Y != nil {
		p.Y = *aux.Y
	}
	if aux.Width != nil {
		p.Width = *aux.Width
	}
	if aux.Height != nil {
		p.Height = *aux.Height
	}

	return nil
}
