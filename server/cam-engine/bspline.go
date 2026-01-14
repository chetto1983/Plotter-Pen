package main



// b-spline evaluation logic
// Helper functions for Spline processing

// splineToPoints samples a spline primitive into a polyline
func splineToPoints(prim Primitive, segments int) []Point {
    if len(prim.ControlPoints) == 0 {
        return nil
    }

    degree := prim.Degree
    if degree == 0 {
        degree = 3 // Default cubic
    }

    knots := prim.Knots
    n := len(prim.ControlPoints)

    // Validate or build knots
    if len(knots) != n+degree+1 {
        // Build uniform quasi-uniform knots if missing or invalid
        // 0..0 (degree+1 times), 1..1 (degree+1 times) with uniform spacing in between
        knots = make([]float64, n+degree+1)
        for i := 0; i < n+degree+1; i++ {
            if i <= degree {
                knots[i] = 0
            } else if i >= n {
                knots[i] = 1
            } else {
                knots[i] = float64(i-degree) / float64(n-degree)
            }
        }
    }

    // Determine domain
    minT := knots[degree]
    maxT := knots[len(knots)-1-degree]
    
    // Safety check for empty domain
    if maxT <= minT {
        // Fallback to simple control points if domain is invalid
        return prim.ControlPoints
    }

    points := make([]Point, segments+1)
    
    for i := 0; i <= segments; i++ {
        t := minT + float64(i)/float64(segments)*(maxT-minT)
        points[i] = interpolateBSpline(t, degree, prim.ControlPoints, knots)
    }
    
    return points
}

// interpolateBSpline evaluates a B-Spline at a specific parameter t using De Boor's algorithm
func interpolateBSpline(t float64, degree int, points []Point, knots []float64) Point {
    n := len(points)
    
    // Find knot span index s such that knots[s] <= t < knots[s+1]
    s := degree
    for i := degree; i < len(knots)-degree-1; i++ {
        if t >= knots[i] && t < knots[i+1] {
            s = i
            break
        }
    }
    
    // Handle t = maxT case (endpoint)
    if t >= knots[len(knots)-degree-1] {
        s = len(knots) - degree - 2
    }

    // Copy affected control points
    // We need d+1 points from index s-degree
    v := make([]Point, degree+1)
    startIdx := s - degree
    for i := 0; i <= degree; i++ {
        if startIdx+i < 0 || startIdx+i >= n {
             // Out of bounds safety
             v[i] = Point{0,0} 
        } else {
             v[i] = points[startIdx+i]
        }
    }

    // De Boor recursion
    for r := 1; r <= degree; r++ {
        for j := degree; j >= r; j-- {
            // Calculate alpha (weight)
            knotIdx := s + j - degree
            num := t - knots[knotIdx]
            den := knots[knotIdx+degree+1-r] - knots[knotIdx]
            
            w := 0.0
            if den != 0.0 {
                w = num / den
            }
            
            // Interpolate
            v[j].X = (1-w)*v[j-1].X + w*v[j].X
            v[j].Y = (1-w)*v[j-1].Y + w*v[j].Y
        }
    }

    return v[degree]
}
