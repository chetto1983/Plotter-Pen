import { Vector2 } from './core.js';

/**
 * Find intersection between two lines (infinite)
 * @param {Line} l1 
 * @param {Line} l2 
 * @returns {Vector2|null} Intersection point or null if parallel
 */
export function findLineIntersection(l1, l2) {
    const x1 = l1.x1, y1 = l1.y1, x2 = l1.x2, y2 = l1.y2;
    const x3 = l2.x1, y3 = l2.y1, x4 = l2.x2, y4 = l2.y2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    if (Math.abs(denom) < 1e-9) return null; // Parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    // Check if intersection lies on first segment (0 <= t <= 1)
    // For Trim, we often intersect with infinite lines (cutting edge extension)
    // But usually we trim against the actual geometry.
    // Let's just return the infinite intersection point for now.

    const px = x1 + t * (x2 - x1);
    const py = y1 + t * (y2 - y1);

    return new Vector2(px, py);
}

/**
 * Check if point is on segment
 */
export function isPointOnSegment(point, line) {
    const minX = Math.min(line.x1, line.x2) - 1e-5;
    const maxX = Math.max(line.x1, line.x2) + 1e-5;
    const minY = Math.min(line.y1, line.y2) - 1e-5;
    const maxY = Math.max(line.y1, line.y2) + 1e-5;

    return point.x >= minX && point.x <= maxX &&
        point.y >= minY && point.y <= maxY;
}
