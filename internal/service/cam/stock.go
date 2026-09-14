package cam

// Stock is the piece on the machine bed. Work Z is the bed, as the paper is for the pen, so the top
// of the piece, where cuts and holes start, is at work Z + Thickness.
type Stock struct {
	Thickness float64 `json:"thickness"`
	// Through cuts the whole piece and Overcut below the bed, into the spoilboard, whatever the
	// actual thickness; otherwise the cut goes Depth below the top of the piece.
	Through bool    `json:"through"`
	Overcut float64 `json:"overcut"`
	Depth   float64 `json:"depth"`
}

// top is the Z of the top of the piece lying on the bed at workZ.
func (s Stock) top(workZ float64) float64 {
	return workZ + s.Thickness
}

// cutDepth is how far below the top of the piece the cut goes.
func (s Stock) cutDepth() float64 {
	if s.Through {
		return s.Thickness + s.Overcut
	}
	return s.Depth
}

// validate reports to check what is wrong with the piece, and a safe Z that does not clear it.
func (s Stock) validate(check func(ok bool, problem string), workZ, safeZ float64) {
	check(s.Thickness > 0, "thickness must be positive")
	check(s.Overcut >= 0, "overcut must not be negative")
	check(s.Through || (s.Depth > 0 && s.Depth <= s.Thickness), "a cut that does not go through needs a depth above 0 and at most the thickness")
	check(safeZ > s.top(workZ), "safe Z must be above the top of the piece, work Z + thickness")
}
