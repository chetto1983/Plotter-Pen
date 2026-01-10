// Vector2 type used via passed parameters

/**
 * Computes fillet arc between two vectors originating from a common point (Intersection)
 * @param {Vector2} intersection - The intersection point
 * @param {Vector2} v1 - Direction vector 1 (normalized)
 * @param {Vector2} v2 - Direction vector 2 (normalized)
 * @param {number} radius - Radius of fillet
 */
export function computeFilletGeometry(intersection, v1, v2, radius) {
    // Use half-angle formula to compute fillet geometry
    // Tangent distance from intersection = R / tan(theta/2)
    const cosAngle = v1.dot(v2);
    if (Math.abs(cosAngle) > 0.9999) return null; // Parallel or collinear

    const theta = Math.acos(cosAngle);
    const tanHalf = Math.tan(theta / 2);
    const dist = radius / tanHalf;

    // Tangent points on each line
    const T1 = intersection.clone().add(v1.clone().scale(dist));
    const T2 = intersection.clone().add(v2.clone().scale(dist));

    // Center is on the angle bisector at distance R / sin(theta/2)
    const bisector = v1.clone().add(v2).normalize();
    const distToCenter = radius / Math.sin(theta / 2);
    const Center = intersection.clone().add(bisector.scale(distToCenter));

    // Arc angles
    const startAngle = Math.atan2(T1.y - Center.y, T1.x - Center.x);
    const endAngle = Math.atan2(T2.y - Center.y, T2.x - Center.x);

    // Determine arc direction from cross product
    const cross = v1.cross(v2);
    const anticlockwise = cross > 0;

    return {
        center: Center,
        radius: radius,
        startAngle: startAngle,
        endAngle: endAngle,
        anticlockwise: !anticlockwise,
        t1: T1,
        t2: T2
    };
}
