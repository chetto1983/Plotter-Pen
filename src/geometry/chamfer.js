
/**
 * Computes chamfer geometry between two vectors originating from a common point (Intersection)
 * @param {Vector2} intersection - The intersection point
 * @param {Vector2} v1 - Direction vector 1 (normalized)
 * @param {Vector2} v2 - Direction vector 2 (normalized)
 * @param {number} distance - Chamfer distance (length along the lines from intersection)
 */
export function computeChamferGeometry(intersection, v1, v2, distance) {
    const cosAngle = v1.dot(v2);
    if (Math.abs(cosAngle) > 0.9999) return null; // Parallel or collinear

    // Calculate points on the lines at 'distance' from intersection
    const p1 = intersection.clone().add(v1.clone().scale(distance));
    const p2 = intersection.clone().add(v2.clone().scale(distance));

    return {
        p1: p1,
        p2: p2
    };
}
