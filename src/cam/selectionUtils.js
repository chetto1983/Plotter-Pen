/**
 * Selection Utilities - Primitive to Polygon Conversion
 * Uses spatial indexing (grid) for O(n log n) segment connection
 */

const TOLERANCE = 0.5; // mm - endpoint connection tolerance
const GRID_CELL_SIZE = 5; // mm - spatial grid cell size

/**
 * Simple spatial grid for fast endpoint lookup - O(1) per query
 */
class SpatialGrid {
    constructor(cellSize = GRID_CELL_SIZE) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _key(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    add(point, data) {
        const key = this._key(point.x, point.y);
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push({ point, data });
    }

    // Query nearby points (checks 3x3 grid cells around point)
    queryNear(point, tolerance = TOLERANCE) {
        const results = [];
        const cx = Math.floor(point.x / this.cellSize);
        const cy = Math.floor(point.y / this.cellSize);
        const tolSq = tolerance * tolerance;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const key = `${cx + dx},${cy + dy}`;
                const cell = this.cells.get(key);
                if (!cell) continue;
                for (const entry of cell) {
                    const d = (entry.point.x - point.x) ** 2 + (entry.point.y - point.y) ** 2;
                    if (d <= tolSq) results.push({ ...entry, dist: Math.sqrt(d) });
                }
            }
        }
        return results.sort((a, b) => a.dist - b.dist);
    }
}

/**
 * Convert arc to points (limited to prevent memory issues)
 */
const arcToPoints = (arc) => {
    const cx = arc.cx ?? arc.center?.x;
    const cy = arc.cy ?? arc.center?.y;
    const r = arc.radius ?? arc._radius;
    const startAngle = arc.startAngle;
    const sweep = arc.sweep;

    if (cx == null || cy == null || r == null || startAngle == null || sweep == null) {
        return null;
    }

    // Validate numeric values
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) ||
        !Number.isFinite(startAngle) || !Number.isFinite(sweep)) {
        return null;
    }

    // Limit steps to prevent memory explosion (max 64 points per arc)
    const steps = Math.min(64, Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 18))));
    const points = [];

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + sweep * t;
        points.push({
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle)
        });
    }
    return points;
};

/**
 * Get segment from primitive (start, end, points)
 */
const primitiveToSegment = (prim) => {
    if (!prim || !prim.type) return null;

    switch (prim.type) {
        case 'line':
            if (prim.x1 == null || prim.y1 == null || prim.x2 == null || prim.y2 == null) return null;
            return {
                start: { x: prim.x1, y: prim.y1 },
                end: { x: prim.x2, y: prim.y2 },
                points: [{ x: prim.x1, y: prim.y1 }, { x: prim.x2, y: prim.y2 }]
            };

        case 'arc': {
            const arcPts = arcToPoints(prim);
            if (!arcPts || arcPts.length < 2) return null;
            return {
                start: arcPts[0],
                end: arcPts[arcPts.length - 1],
                points: arcPts
            };
        }

        case 'polyline':
            if (!prim.points || prim.points.length < 2) return null;
            return {
                start: { x: prim.points[0].x, y: prim.points[0].y },
                end: { x: prim.points[prim.points.length - 1].x, y: prim.points[prim.points.length - 1].y },
                points: prim.points.map(p => ({ x: p.x, y: p.y }))
            };

        default:
            return null;
    }
};

/**
 * Connect segments using spatial grid - O(n log n) instead of O(n²)
 */
const connectSegmentsOptimized = (segments) => {
    if (segments.length === 0) return [];

    const loops = [];
    const used = new Array(segments.length).fill(false);

    // Build spatial grid for fast endpoint lookup
    const startGrid = new SpatialGrid();
    const endGrid = new SpatialGrid();

    segments.forEach((seg, idx) => {
        startGrid.add(seg.start, { index: idx, reverse: false });
        endGrid.add(seg.end, { index: idx, reverse: true });
    });

    // Find next segment that connects to current endpoint
    const findNext = (currentEnd, excludeIdx) => {
        // Query both grids for segments starting/ending near currentEnd
        const fromStart = startGrid.queryNear(currentEnd);
        const fromEnd = endGrid.queryNear(currentEnd);

        // Merge and find best unused match
        for (const match of fromStart) {
            if (!used[match.data.index] && match.data.index !== excludeIdx) {
                return { index: match.data.index, reverse: false };
            }
        }
        for (const match of fromEnd) {
            if (!used[match.data.index] && match.data.index !== excludeIdx) {
                return { index: match.data.index, reverse: true };
            }
        }
        return null;
    };

    const pointsClose = (a, b) => {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy <= TOLERANCE * TOLERANCE;
    };

    // Build loops
    let loopCount = 0;
    for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;

        used[i] = true;
        const base = segments[i];
        let pathPoints = base.points.slice();
        let start = pathPoints[0];
        let end = pathPoints[pathPoints.length - 1];
        let iterations = 0;
        const maxIterations = segments.length * 2; // Safety limit

        while (iterations++ < maxIterations) {
            // Check if closed (minimum 3 points for valid polygon)
            if (pointsClose(end, start) && pathPoints.length >= 3) {
                loops.push(pathPoints);
                loopCount++;
                break;
            }

            const next = findNext(end, i);
            if (!next) break;

            used[next.index] = true;
            const seg = segments[next.index];
            const segPts = next.reverse ? seg.points.slice().reverse() : seg.points.slice();

            pathPoints = pathPoints.concat(segPts.slice(1));
            end = pathPoints[pathPoints.length - 1];
        }
    }

    return loops;
};

/**
 * Convert any closed primitive to polygon points
 */
export const primitiveToPolygon = (prim, segments = 64) => {
    if (!prim || !prim.type) return null;

    switch (prim.type) {
        case 'circle': {
            const cx = prim.center?.x ?? prim.cx;
            const cy = prim.center?.y ?? prim.cy;
            const r = prim.radius ?? prim._radius;
            if (cx == null || cy == null || r == null) return null;
            const points = [];
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                points.push({
                    x: cx + Math.cos(angle) * r,
                    y: cy + Math.sin(angle) * r
                });
            }
            return points;
        }

        case 'rectangle': {
            if (prim.x == null || prim.y == null || prim.width == null || prim.height == null) return null;
            return [
                { x: prim.x, y: prim.y },
                { x: prim.x + prim.width, y: prim.y },
                { x: prim.x + prim.width, y: prim.y + prim.height },
                { x: prim.x, y: prim.y + prim.height }
            ];
        }

        case 'polygon': {
            if (!prim.points || prim.points.length < 3) return null;
            return prim.points.map(p => ({ x: p.x, y: p.y }));
        }

        case 'polyline': {
            if (!prim.closed || !prim.points || prim.points.length < 3) return null;
            return prim.points.map(p => ({ x: p.x, y: p.y }));
        }

        default:
            return null;
    }
};

/**
 * Build closed loops from primitives - O(n log n) with spatial indexing
 * Processes closed shapes directly AND connects open segments
 */
export const buildClosedLoops = (primitives) => {
    const directLoops = [];
    const segments = [];

    for (const prim of primitives) {
        if (!prim || !prim.type) continue;

        // Direct closed shapes - O(1) per shape
        const polygon = primitiveToPolygon(prim);
        if (polygon) {
            directLoops.push(polygon);
            continue;
        }

        // Segments to connect - collect for batch processing
        const seg = primitiveToSegment(prim);
        if (seg) {
            segments.push(seg);
        }
    }

    // Connect segments using spatial grid - O(n log n)
    const connectedLoops = connectSegmentsOptimized(segments);

    return [...directLoops, ...connectedLoops];
};

/**
 * Build selection paths from primitives
 * Returns both closed loops and open paths
 */
export const buildSelectionPaths = (primitives) => {
    const loops = [];
    const openPaths = [];
    const segments = [];

    for (const prim of primitives) {
        if (!prim || !prim.type) continue;

        // Direct closed shapes
        const polygon = primitiveToPolygon(prim);
        if (polygon) {
            loops.push({ points: polygon, circleData: prim.type === 'circle' ? prim : null });
            continue;
        }

        // Segments to connect
        const seg = primitiveToSegment(prim);
        if (seg) {
            segments.push({ ...seg, original: prim });
        }
    }

    // Connect segments using spatial grid - O(n log n)
    if (segments.length > 0) {
        const connectedLoops = connectSegmentsOptimized(segments);
        for (const loopPoints of connectedLoops) {
            loops.push({ points: loopPoints, circleData: null });
        }
    }

    return { loops, openPaths };
};

/**
 * Calculate polygon area (signed, positive = CCW)
 */
const polygonArea = (points) => {
    if (!points || points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
};

/**
 * Check if point is inside polygon (ray casting)
 */
const pointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
};

/**
 * Group loops by containment (outer boundaries with holes)
 */
export const groupLoopsByContainment = (loops) => {
    if (!loops || loops.length === 0) return [];

    // Sort by area (largest first = outer boundaries)
    const sorted = loops.map((loop, idx) => ({
        index: idx,
        points: loop.points || loop,
        circleData: loop.circleData || null,
        area: Math.abs(polygonArea(loop.points || loop))
    })).sort((a, b) => b.area - a.area);

    const groups = [];
    const assigned = new Set();

    for (const outer of sorted) {
        if (assigned.has(outer.index)) continue;

        const group = {
            outer: outer.points,
            circleData: outer.circleData,
            holes: []
        };

        // Find holes inside this outer
        for (const inner of sorted) {
            if (inner.index === outer.index || assigned.has(inner.index)) continue;
            if (inner.area >= outer.area) continue;

            // Check if inner's first point is inside outer
            const testPoint = (inner.points || inner)[0];
            if (testPoint && pointInPolygon(testPoint, outer.points)) {
                group.holes.push({ points: inner.points, circleData: inner.circleData });
                assigned.add(inner.index);
            }
        }

        assigned.add(outer.index);
        groups.push(group);
    }

    return groups;
};
