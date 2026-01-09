import { Vector2, distance, normalizeAngle } from './core.js';
import { Arc } from './primitives.js';

export function computeFillet(line1, line2, radius) {
    // line1: {x1, y1, x2, y2}
    // line2: {x1, y1, x2, y2}

    // 1. Find intersection of infinite lines
    const result = lineIntersection(line1, line2);
    if (!result) return null; // Parallel

    const I = new Vector2(result.x, result.y);

    // 2. Vectors from Intersection along the lines
    // We need to determine "which direction" the lines go from intersection.
    // The fillet uses the smaller angle sector usually, but it depends on line configuration.
    // For CAD "Fillet", we usually select the segments we want to KEEP. 
    // The algorithm needs to know "Direction A" and "Direction B" from Intersection.
    // This depends on where the user clicked, generally.
    // But this low-level function might just return the geometry for the "inner" angle.

    // Let's assume input vectors are directed FROM intersection TO ends.
    // But we receive full lines. 

    // We need 4 points to determine segments.
    // For pure geometric fillet of 2 infinite lines, there are 4 possible solutions (4 quadrants).
    // The tool must select one.
    return null; // Logic moved to tool
}

/**
 * Computes fillet arc between two vectors originating from a common point (Intersection)
 * @param {Vector2} intersection - The intersection point
 * @param {Vector2} v1 - Direction vector 1 (normalized)
 * @param {Vector2} v2 - Direction vector 2 (normalized)
 * @param {number} radius - Radius of fillet
 */
export function computeFilletGeometry(intersection, v1, v2, radius) {
    // Angle between vectors
    let angle = v1.angleTo(v2);
    // We want the inner angle.
    // If angle is 0 or 180, parallel/collinear.

    // Simplify: Use half-angle formula.
    // Tangent distance from intersection = R / tan(theta/2).
    // theta is the angle between the two vectors.
    const cosAngle = v1.dot(v2);
    if (Math.abs(cosAngle) > 0.9999) return null; // Parallel

    const theta = Math.acos(cosAngle);
    const tanHalf = Math.tan(theta / 2);
    const dist = radius / tanHalf;

    // Tangent points
    const T1 = intersection.clone().add(v1.clone().scale(dist));
    const T2 = intersection.clone().add(v2.clone().scale(dist));

    // Center calculation:
    // Move from T1 perpendicular to v1 by Radius.
    // Move from T2 perpendicular to v2 by Radius.
    // Direction depends on convexity.

    // Alternative: Center is on the angle bisector.
    const bisector = v1.clone().add(v2).normalize();
    const distToCenter = radius / Math.sin(theta / 2);
    const Center = intersection.clone().add(bisector.scale(distToCenter));

    // Angles for Arc
    const startAngle = Math.atan2(T1.y - Center.y, T1.x - Center.x);
    const endAngle = Math.atan2(T2.y - Center.y, T2.x - Center.x);

    // Determine anticlockwise?
    // Cross product of v1, v2 tells us orientation?
    const cross = v1.cross(v2);
    const anticlockwise = cross > 0;

    // If we swap T1/T2, we might swap angles.
    // Arc is usually drawn counter-clockwise in Canvas.
    // We need to ensure we go from Angle1 to Angle2 correctly short way.

    return {
        center: Center,
        radius: radius,
        startAngle: startAngle,
        endAngle: endAngle,
        anticlockwise: !anticlockwise, // Check logic
        t1: T1,
        t2: T2
    };
}


function lineIntersection(l1, l2) {
    const x1 = l1.x1, y1 = l1.y1, x2 = l1.x2, y2 = l1.y2;
    const x3 = l2.x1, y3 = l2.y1, x4 = l2.x2, y4 = l2.y2;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-6) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}
