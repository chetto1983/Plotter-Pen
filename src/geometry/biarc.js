/**
 * Biarc Library - Convert curves to circular arcs
 * 
 * Based on: https://dlacko.org/blog/2016/10/19/approximating-bezier-curves-by-biarcs/
 * JS port from: https://editor.p5js.org/dnmade/sketches/e1a6b-liN
 * 
 * A biarc is a pair of circular arcs with matching tangent at the connection point.
 * This library provides functions to:
 * - Convert Bezier curves to biarcs
 * - Convert point sequences to arcs + lines
 * - Fit arcs to curves with adaptive subdivision
 */

import { ArcBuilder } from './arcBuilder.js';
import { pointToSegmentDistance } from './core.js';

// ============================================================================
// Vector2D utilities
// ============================================================================

export const Vec2 = {
    create(x = 0, y = 0) { return { x, y }; },
    add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
    sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
    mul(v, s) { return { x: v.x * s, y: v.y * s }; },
    div(v, s) { return { x: v.x / s, y: v.y / s }; },
    dot(a, b) { return a.x * b.x + a.y * b.y; },
    cross(a, b) { return a.x * b.y - a.y * b.x; },
    len(v) { return Math.sqrt(v.x * v.x + v.y * v.y); },
    dist(a, b) { return Vec2.len(Vec2.sub(a, b)); },
    normalize(v) {
        const l = Vec2.len(v);
        return l > 0 ? Vec2.div(v, l) : { x: 1, y: 0 };
    },
    equals(a, b, eps = 0.0001) {
        return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
    },
    lerp(a, b, t) {
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
};

// ============================================================================
// Line utilities
// ============================================================================

/**
 * Get slope of line through two points
 */
function getSlope(p1, p2) {
    if (Math.abs(p2.x - p1.x) < 0.0001) return Infinity;
    return (p2.y - p1.y) / (p2.x - p1.x);
}

/**
 * Create perpendicular line at point P, perpendicular to line P-P1
 */
function createPerpendicularAt(P, P1) {
    const dx = P1.x - P.x;
    const dy = P1.y - P.y;
    if (Math.abs(dx) < 0.0001) return { p: P, m: 0 };
    if (Math.abs(dy) < 0.0001) return { p: P, m: Infinity };
    return { p: P, m: -dx / dy };
}

/**
 * Find intersection of two lines
 */
function lineIntersection(l1, l2) {
    if (l1.m === Infinity) {
        if (l2.m === Infinity) return null;
        return { x: l1.p.x, y: l2.m * (l1.p.x - l2.p.x) + l2.p.y };
    }
    if (l2.m === Infinity) {
        return { x: l2.p.x, y: l1.m * (l2.p.x - l1.p.x) + l1.p.y };
    }
    if (Math.abs(l1.m - l2.m) < 0.0001) return null;

    const x = (l1.m * l1.p.x - l2.m * l2.p.x - l1.p.y + l2.p.y) / (l1.m - l2.m);
    const y = l1.m * (x - l1.p.x) + l1.p.y;
    return { x, y };
}

// ============================================================================
// Arc representation
// ============================================================================

/**
 * Arc data structure
 * @typedef {Object} Arc
 * @property {Vec2} C - Center point
 * @property {number} r - Radius
 * @property {number} startAngle - Start angle in radians
 * @property {number} sweepAngle - Sweep angle in radians (positive = CCW, negative = CW)
 * @property {Vec2} P1 - Start point
 * @property {Vec2} P2 - End point
 */

/**
 * Get point on arc at parameter t (0-1)
 */
export function arcPointAt(arc, t) {
    return {
        x: arc.C.x + arc.r * Math.cos(arc.startAngle + t * arc.sweepAngle),
        y: arc.C.y + arc.r * Math.sin(arc.startAngle + t * arc.sweepAngle)
    };
}

/**
 * Get arc length
 */
export function arcLength(arc) {
    return Math.abs(arc.r * arc.sweepAngle);
}

// ============================================================================
// Biarc creation
// ============================================================================

/**
 * Create a biarc (pair of arcs) connecting P1 to P2 through transition point T
 * 
 * @param {Vec2} P1 - Start point
 * @param {Vec2} T1 - Tangent direction at P1 (normalized)
 * @param {Vec2} P2 - End point
 * @param {Vec2} T2 - Tangent direction at P2 (normalized)
 * @param {Vec2} T - Transition point (where the two arcs meet)
 * @returns {[Arc, Arc] | null} Pair of arcs, or null if impossible
 */
export function createBiarc(P1, T1, P2, T2, T) {
    // Calculate curve orientation using signed area
    let sum = 0;
    sum += (T.x - P1.x) * (T.y + P1.y);
    sum += (P2.x - T.x) * (P2.y + T.y);
    sum += (P1.x - P2.x) * (P1.y + P2.y);
    const cw = sum < 0;

    // Perpendicular lines at P1 and P2 (perpendicular to tangents)
    const tl1 = createPerpendicularAt(P1, Vec2.add(P1, T1));
    const tl2 = createPerpendicularAt(P2, Vec2.add(P2, T2));

    // Perpendicular bisectors of P1-T and P2-T
    const midP1T = Vec2.lerp(P1, T, 0.5);
    const pbP1T = createPerpendicularAt(midP1T, T);

    const midP2T = Vec2.lerp(P2, T, 0.5);
    const pbP2T = createPerpendicularAt(midP2T, T);

    // Circle centers are at intersection of perpendicular lines
    const C1 = lineIntersection(tl1, pbP1T);
    const C2 = lineIntersection(tl2, pbP2T);

    if (!C1 || !C2) return null;

    // Calculate radii
    const r1 = Vec2.dist(C1, P1);
    const r2 = Vec2.dist(C2, P2);

    if (r1 < 0.01 || r2 < 0.01 || r1 > 100000 || r2 > 100000) return null;

    // Calculate start and sweep angles
    const startAngle1 = Math.atan2(P1.y - C1.y, P1.x - C1.x);
    let sweepAngle1 = Math.atan2(T.y - C1.y, T.x - C1.x) - startAngle1;

    const startAngle2 = Math.atan2(T.y - C2.y, T.x - C2.x);
    let sweepAngle2 = Math.atan2(P2.y - C2.y, P2.x - C2.x) - startAngle2;

    // Adjust sweep angles based on orientation
    if (cw && sweepAngle1 < 0) sweepAngle1 += 2 * Math.PI;
    if (!cw && sweepAngle1 > 0) sweepAngle1 -= 2 * Math.PI;
    if (cw && sweepAngle2 < 0) sweepAngle2 += 2 * Math.PI;
    if (!cw && sweepAngle2 > 0) sweepAngle2 -= 2 * Math.PI;

    return [
        { C: C1, r: r1, startAngle: startAngle1, sweepAngle: sweepAngle1, P1, P2: T },
        { C: C2, r: r2, startAngle: startAngle2, sweepAngle: sweepAngle2, P1: T, P2 }
    ];
}

/**
 * Get point on biarc at parameter t (0-1)
 */
export function biarcPointAt(arcs, t) {
    const [A1, A2] = arcs;
    const len1 = arcLength(A1);
    const len2 = arcLength(A2);
    const s = len1 / (len1 + len2);

    if (t <= s) {
        return arcPointAt(A1, t / s);
    } else {
        return arcPointAt(A2, (t - s) / (1 - s));
    }
}

// ============================================================================
// Cubic Bezier to Biarc conversion
// ============================================================================

/**
 * Evaluate cubic Bezier at parameter t
 */
export function bezierPointAt(p1, c1, c2, p2, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    return {
        x: mt3 * p1.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p2.x,
        y: mt3 * p1.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p2.y
    };
}

/**
 * Get tangent of cubic Bezier at parameter t
 */
export function bezierTangentAt(p1, c1, c2, p2, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;

    const dx = 3 * mt2 * (c1.x - p1.x) + 6 * mt * t * (c2.x - c1.x) + 3 * t2 * (p2.x - c2.x);
    const dy = 3 * mt2 * (c1.y - p1.y) + 6 * mt * t * (c2.y - c1.y) + 3 * t2 * (p2.y - c2.y);

    return Vec2.normalize({ x: dx, y: dy });
}

/**
 * Split cubic Bezier at parameter t using De Casteljau's algorithm
 */
export function bezierSplit(p1, c1, c2, p2, t) {
    const p0 = Vec2.lerp(p1, c1, t);
    const p01 = Vec2.lerp(c1, c2, t);
    const p02 = Vec2.lerp(c2, p2, t);
    const p001 = Vec2.lerp(p0, p01, t);
    const p012 = Vec2.lerp(p01, p02, t);
    const dp = Vec2.lerp(p001, p012, t);

    return [
        { p1, c1: p0, c2: p001, p2: dp },
        { p1: dp, c1: p012, c2: p02, p2 }
    ];
}

/**
 * Convert cubic Bezier to biarcs with adaptive subdivision
 * 
 * @param {Vec2} p1 - Start point
 * @param {Vec2} c1 - First control point
 * @param {Vec2} c2 - Second control point
 * @param {Vec2} p2 - End point
 * @param {Object} options - Options
 * @param {number} options.tolerance - Max deviation allowed (default 0.5)
 * @param {number} options.maxDepth - Max recursion depth (default 10)
 * @returns {Arc[]} Array of arcs
 */
export function bezierToBiarcs(p1, c1, c2, p2, options = {}) {
    const tolerance = options.tolerance ?? 0.5;
    const maxDepth = options.maxDepth ?? 10;
    const nrPointsToCheck = options.samples ?? 5;

    const arcs = [];
    const curves = [{ p1, c1, c2, p2, depth: 0 }];

    while (curves.length > 0) {
        const bz = curves.pop();
        const { depth } = bz;

        // Get tangent directions
        const T1 = Vec2.equals(bz.p1, bz.c1)
            ? Vec2.normalize(Vec2.sub(bz.c2, bz.p1))
            : Vec2.normalize(Vec2.sub(bz.c1, bz.p1));

        const T2 = Vec2.equals(bz.p2, bz.c2)
            ? Vec2.normalize(Vec2.sub(bz.p2, bz.c1))
            : Vec2.normalize(Vec2.sub(bz.p2, bz.c2));

        // Calculate incenter of triangle (P1, V, P2) as transition point
        const V = lineIntersection(
            { p: bz.p1, m: getSlope(bz.p1, bz.c1) },
            { p: bz.p2, m: getSlope(bz.p2, bz.c2) }
        );

        // If tangent lines are parallel, subdivide
        if (!V) {
            if (depth < maxDepth) {
                const [b1, b2] = bezierSplit(bz.p1, bz.c1, bz.c2, bz.p2, 0.5);
                curves.push({ ...b2, depth: depth + 1 });
                curves.push({ ...b1, depth: depth + 1 });
            }
            continue;
        }

        // Calculate incenter as transition point
        const dP2V = Vec2.dist(bz.p2, V);
        const dP1V = Vec2.dist(bz.p1, V);
        const dP1P2 = Vec2.dist(bz.p1, bz.p2);
        const G = Vec2.div(
            Vec2.add(Vec2.add(
                Vec2.mul(bz.p1, dP2V),
                Vec2.mul(bz.p2, dP1V)),
                Vec2.mul(V, dP1P2)),
            dP2V + dP1V + dP1P2
        );

        // Create biarc
        const biarc = createBiarc(bz.p1, T1, bz.p2, Vec2.mul(T2, -1), G);

        if (!biarc) {
            if (depth < maxDepth) {
                const [b1, b2] = bezierSplit(bz.p1, bz.c1, bz.c2, bz.p2, 0.5);
                curves.push({ ...b2, depth: depth + 1 });
                curves.push({ ...b1, depth: depth + 1 });
            }
            continue;
        }

        // Check error
        let maxError = 0;
        for (let i = 1; i < nrPointsToCheck; i++) {
            const t = i / nrPointsToCheck;
            const bp = biarcPointAt(biarc, t);
            const bzp = bezierPointAt(bz.p1, bz.c1, bz.c2, bz.p2, t);
            maxError = Math.max(maxError, Vec2.dist(bp, bzp));
        }

        if (maxError > tolerance && depth < maxDepth) {
            // Find parameter with max error and split there
            let maxT = 0.5;
            let maxD = 0;
            for (let i = 1; i < nrPointsToCheck; i++) {
                const t = i / nrPointsToCheck;
                const bp = biarcPointAt(biarc, t);
                const bzp = bezierPointAt(bz.p1, bz.c1, bz.c2, bz.p2, t);
                const d = Vec2.dist(bp, bzp);
                if (d > maxD) { maxD = d; maxT = t; }
            }
            const [b1, b2] = bezierSplit(bz.p1, bz.c1, bz.c2, bz.p2, maxT);
            curves.push({ ...b2, depth: depth + 1 });
            curves.push({ ...b1, depth: depth + 1 });
        } else {
            arcs.push(...biarc);
        }
    }

    return arcs;
}

// ============================================================================
// Points to arcs/lines fitting
// ============================================================================

/**
 * Fit circle through 3 points (circumcircle)
 * Delegates to ArcBuilder's canonical implementation
 */
export function circleFrom3Points(p1, p2, p3) {
    return ArcBuilder.circleFromThreePoints(p1, p2, p3);
}

/**
 * Fit arcs and lines to a sequence of points
 * 
 * @param {Vec2[]} points - Array of points
 * @param {Object} options - Options
 * @param {number} options.tolerance - Max deviation for fitting (default 0.3)
 * @param {number} options.minRadius - Min arc radius (default 1)
 * @param {number} options.maxRadius - Max arc radius (default 10000)
 * @returns {Array} Array of { type: 'arc'|'line', ... }
 */
export function fitArcsAndLines(points, options = {}) {
    const tolerance = options.tolerance ?? 1.0;  // Increased for smoother results
    const minRadius = options.minRadius ?? 0.5;
    const maxRadius = options.maxRadius ?? 50000;

    const result = [];
    let i = 0;

    while (i < points.length - 1) {
        // Try arc fitting (need at least 3 points)
        let bestArcEnd = -1;
        let bestCircle = null;


        if (i + 2 < points.length) {
            // Try to find the longest arc that fits within tolerance
            for (let j = i + 2; j < points.length && j < i + 80; j++) {
                const mid = Math.floor((i + j) / 2);
                const circle = circleFrom3Points(points[i], points[mid], points[j]);

                if (!circle || circle.r < minRadius || circle.r > maxRadius) continue;

                // Check all points fit and calculate max error
                let maxErr = 0;
                let fits = true;
                for (let k = i; k <= j; k++) {
                    const dist = Vec2.dist(points[k], { x: circle.cx, y: circle.cy });
                    const err = Math.abs(dist - circle.r);
                    maxErr = Math.max(maxErr, err);
                    if (err > tolerance) {
                        fits = false;
                        break;
                    }
                }

                if (fits) {
                    bestArcEnd = j;
                    bestCircle = circle;

                }
                // Keep searching for longer arcs even if this one fits
            }
        }

        if (bestArcEnd > i + 1 && bestCircle) {
            result.push({
                type: 'arc',
                x1: points[i].x,
                y1: points[i].y,
                x2: points[bestArcEnd].x,
                y2: points[bestArcEnd].y,
                cx: bestCircle.cx,
                cy: bestCircle.cy,
                r: bestCircle.r
            });
            i = bestArcEnd;
        } else {
            // Try line fitting
            let lineEnd = i + 1;
            for (let j = i + 2; j < points.length && j < i + 50; j++) {
                let fits = true;
                const start = points[i];
                const end = points[j];

                for (let k = i + 1; k < j; k++) {
                    const dist = pointToLineDistance(points[k], start, end);
                    if (dist > tolerance) {
                        fits = false;
                        break;
                    }
                }

                if (fits) lineEnd = j;
                else break;
            }

            result.push({
                type: 'line',
                x1: points[i].x,
                y1: points[i].y,
                x2: points[lineEnd].x,
                y2: points[lineEnd].y
            });
            i = lineEnd;
        }
    }

    return result;
}

/**
 * Distance from point to line segment
 * Delegates to core.js canonical implementation
 */
function pointToLineDistance(pt, start, end) {
    return pointToSegmentDistance(pt.x, pt.y, start.x, start.y, end.x, end.y);
}

// ============================================================================
// Export all utilities
// ============================================================================

export default {
    Vec2,
    createBiarc,
    biarcPointAt,
    arcPointAt,
    arcLength,
    bezierPointAt,
    bezierTangentAt,
    bezierSplit,
    bezierToBiarcs,
    circleFrom3Points,
    fitArcsAndLines
};
