/**
 * DXF Parsing API Route
 * Handles DXF file parsing in the backend to avoid browser freeze
 */

import DxfParser from "dxf-parser";

const TOLERANCE = 1e-6;

/**
 * Convert DXF coordinates to model coordinates
 */
function toModel(x, y, scaleFactor) {
    return { x: x * scaleFactor, y: y * scaleFactor };
}

/**
 * Calculate distance between two points
 */
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate through point for arc (midpoint on arc curve)
 */
function calcThroughPoint(startAngle, endAngle, center, radius) {
    let sweep = endAngle - startAngle;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;
    const midAngle = startAngle + sweep / 2;
    return {
        x: center.x + radius * Math.cos(midAngle),
        y: center.y + radius * Math.sin(midAngle)
    };
}

/**
 * Convert LINE entity
 */
function convertLine(entity, scaleFactor) {
    const start = toModel(entity.vertices[0].x, entity.vertices[0].y, scaleFactor);
    const end = toModel(entity.vertices[1].x, entity.vertices[1].y, scaleFactor);
    return { type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

/**
 * Convert CIRCLE entity
 */
function convertCircle(entity, scaleFactor) {
    const center = toModel(entity.center.x, entity.center.y, scaleFactor);
    return {
        type: 'circle',
        cx: center.x,
        cy: center.y,
        radius: entity.radius * scaleFactor
    };
}

/**
 * Convert ARC entity
 */
function convertArc(entity, scaleFactor) {
    const center = toModel(entity.center.x, entity.center.y, scaleFactor);
    const radius = entity.radius * scaleFactor;
    // DXF angles are in degrees, counter-clockwise from positive X
    const startAngle = entity.startAngle * Math.PI / 180;
    const endAngle = entity.endAngle * Math.PI / 180;
    const start = {
        x: center.x + radius * Math.cos(startAngle),
        y: center.y + radius * Math.sin(startAngle)
    };
    const end = {
        x: center.x + radius * Math.cos(endAngle),
        y: center.y + radius * Math.sin(endAngle)
    };
    const throughPoint = calcThroughPoint(startAngle, endAngle, center, radius);
    return {
        type: 'arc',
        x1: start.x, y1: start.y,
        x2: end.x, y2: end.y,
        cx: center.x, cy: center.y,
        throughPoint
    };
}

/**
 * Convert arc from bulge value (for polylines)
 */
function arcFromBulge(p1, p2, bulge) {
    const chord = distance(p1.x, p1.y, p2.x, p2.y);
    if (chord < TOLERANCE) return null;

    const sagitta = Math.abs(bulge) * chord / 2;
    const radius = (sagitta / 2) + (chord * chord) / (8 * sagitta);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const perpX = -dy / chord, perpY = dx / chord;
    const midToCenter = radius - sagitta;
    const sign = bulge > 0 ? -1 : 1;
    const cx = midX + midToCenter * perpX * sign;
    const cy = midY + midToCenter * perpY * sign;
    const throughPoint = {
        x: midX - sign * perpX * sagitta,
        y: midY - sign * perpY * sagitta
    };
    return {
        type: 'arc',
        x1: p1.x, y1: p1.y,
        x2: p2.x, y2: p2.y,
        cx, cy,
        throughPoint
    };
}

/**
 * Convert POLYLINE/LWPOLYLINE entity
 */
function convertPolyline(entity, scaleFactor) {
    const closed = entity.shape || false;
    const vertices = entity.vertices || [];
    if (vertices.length < 2) return null;

    const primitives = [];
    for (let i = 0; i < vertices.length - 1; i++) {
        const p1 = toModel(vertices[i].x, vertices[i].y, scaleFactor);
        const p2 = toModel(vertices[i + 1].x, vertices[i + 1].y, scaleFactor);
        const bulge = vertices[i].bulge || 0;

        if (Math.abs(bulge) < TOLERANCE) {
            primitives.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        } else {
            const arc = arcFromBulge(p1, p2, bulge);
            if (arc) primitives.push(arc);
        }
    }

    // Close polyline if needed
    if (closed && vertices.length > 2) {
        const last = vertices[vertices.length - 1];
        const p1 = toModel(last.x, last.y, scaleFactor);
        const p2 = toModel(vertices[0].x, vertices[0].y, scaleFactor);
        const bulge = last.bulge || 0;

        if (Math.abs(bulge) < TOLERANCE) {
            primitives.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        } else {
            const arc = arcFromBulge(p1, p2, bulge);
            if (arc) primitives.push(arc);
        }
    }

    return primitives;
}

/**
 * B-spline interpolation (ported from b-spline.js)
 */
function bSplineInterpolate(t, degree, points, knots, weights) {
    const n = points.length;
    const d = points[0].length;

    if (degree < 1 || degree > (n - 1)) return null;

    if (!weights) {
        weights = [];
        for (let i = 0; i < n; i++) weights[i] = 1;
    }

    if (!knots) {
        knots = [];
        for (let i = 0; i < n + degree + 1; i++) knots[i] = i;
    }

    const domain = [degree, knots.length - 1 - degree];
    const low = knots[domain[0]];
    const high = knots[domain[1]];
    t = t * (high - low) + low;

    if (t < low) t = low;
    if (t > high) t = high;

    let s;
    for (s = domain[0]; s < domain[1]; s++) {
        if (t >= knots[s] && t <= knots[s + 1]) break;
    }

    const v = [];
    for (let i = 0; i < n; i++) {
        v[i] = [];
        for (let j = 0; j < d; j++) v[i][j] = points[i][j] * weights[i];
        v[i][d] = weights[i];
    }

    for (let l = 1; l <= degree + 1; l++) {
        for (let i = s; i > s - degree - 1 + l; i--) {
            const denom = knots[i + degree + 1 - l] - knots[i];
            const alpha = denom === 0 ? 0 : (t - knots[i]) / denom;
            for (let j = 0; j < d + 1; j++) {
                v[i][j] = (1 - alpha) * v[i - 1][j] + alpha * v[i][j];
            }
        }
    }

    const result = [];
    for (let i = 0; i < d; i++) {
        result[i] = v[s][d] !== 0 ? v[s][i] / v[s][d] : v[s][i];
    }
    return result;
}

/**
 * Convert SPLINE using b-spline interpolation
 */
function convertSpline(entity, scaleFactor) {
    const degree = entity.degreeOfSplineCurve || 3;
    const knots = entity.knotValues;
    const controlPoints = entity.controlPoints;

    if (!controlPoints || controlPoints.length < degree + 1) {
        // Fallback to fit points
        if (entity.fitPoints?.length >= 2) {
            const primitives = [];
            for (let i = 0; i < entity.fitPoints.length - 1; i++) {
                const p1 = toModel(entity.fitPoints[i].x, entity.fitPoints[i].y, scaleFactor);
                const p2 = toModel(entity.fitPoints[i + 1].x, entity.fitPoints[i + 1].y, scaleFactor);
                primitives.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
            }
            return primitives;
        }
        return null;
    }

    try {
        const pts = controlPoints.map(p => [p.x * scaleFactor, p.y * scaleFactor]);
        const samples = Math.max(50, controlPoints.length * 10);
        const sampledPoints = [];

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const pt = bSplineInterpolate(t, degree, pts, knots);
            if (pt) sampledPoints.push({ x: pt[0], y: -pt[1] });
        }

        if (sampledPoints.length < 2) return null;

        const primitives = [];
        for (let i = 0; i < sampledPoints.length - 1; i++) {
            primitives.push({
                type: 'line',
                x1: sampledPoints[i].x, y1: sampledPoints[i].y,
                x2: sampledPoints[i + 1].x, y2: sampledPoints[i + 1].y
            });
        }

        if (entity.closed && sampledPoints.length > 2) {
            primitives.push({
                type: 'line',
                x1: sampledPoints[sampledPoints.length - 1].x, y1: sampledPoints[sampledPoints.length - 1].y,
                x2: sampledPoints[0].x, y2: sampledPoints[0].y
            });
        }

        return primitives;
    } catch (err) {
        console.warn('Spline interpolation failed:', err.message);
        const primitives = [];
        for (let i = 0; i < controlPoints.length - 1; i++) {
            const p1 = toModel(controlPoints[i].x, controlPoints[i].y, scaleFactor);
            const p2 = toModel(controlPoints[i + 1].x, controlPoints[i + 1].y, scaleFactor);
            primitives.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        }
        return primitives;
    }
}

/**
 * Convert a DXF entity to primitive(s)
 */
function convertEntity(entity, scaleFactor) {
    switch (entity.type) {
        case 'LINE': return convertLine(entity, scaleFactor);
        case 'CIRCLE': return convertCircle(entity, scaleFactor);
        case 'ARC': return convertArc(entity, scaleFactor);
        case 'LWPOLYLINE':
        case 'POLYLINE': return convertPolyline(entity, scaleFactor);
        case 'SPLINE': return convertSpline(entity, scaleFactor);
        default: return null;
    }
}

/**
 * Calculate bounds from primitives
 */
function calculateBounds(primitives) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of primitives) {
        if (p.type === 'line') {
            minX = Math.min(minX, p.x1, p.x2);
            minY = Math.min(minY, p.y1, p.y2);
            maxX = Math.max(maxX, p.x1, p.x2);
            maxY = Math.max(maxY, p.y1, p.y2);
        } else if (p.type === 'arc' || p.type === 'circle') {
            const r = p.radius || Math.abs(p.cx - p.x1);
            minX = Math.min(minX, p.cx - r);
            minY = Math.min(minY, p.cy - r);
            maxX = Math.max(maxX, p.cx + r);
            maxY = Math.max(maxY, p.cy + r);
        }
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Get scale factor from DXF units
 */
function getScaleFactor(dxf) {
    if (!dxf.header || dxf.header['$INSUNITS'] === undefined) {
        return 1.0;
    }
    switch (dxf.header['$INSUNITS']) {
        case 1: return 25.4;    // Inches
        case 2: return 304.8;   // Feet
        case 4: return 1.0;     // Millimeters
        case 5: return 10.0;    // Centimeters
        case 6: return 1000.0;  // Meters
        default: return 1.0;
    }
}

/**
 * Parse DXF content and return primitives
 */
export function parseDXF(dxfContent) {
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfContent);

    if (!dxf || !dxf.entities) {
        throw new Error('Invalid DXF file');
    }

    const scaleFactor = getScaleFactor(dxf);
    const primitives = [];

    for (const entity of dxf.entities) {
        const prim = convertEntity(entity, scaleFactor);
        if (prim) {
            if (Array.isArray(prim)) primitives.push(...prim);
            else primitives.push(prim);
        }
    }

    const bounds = calculateBounds(primitives);

    console.log(`DXF parsed: ${primitives.length} primitives from ${dxf.entities.length} entities`);

    return { primitives, bounds, count: primitives.length };
}

/**
 * Express route handler for DXF parsing
 */
export function dxfParseHandler(req, res) {
    try {
        const dxfContent = req.body;
        if (!dxfContent || typeof dxfContent !== 'string') {
            return res.status(400).json({ status: 'error', message: 'DXF content required' });
        }

        const result = parseDXF(dxfContent);
        res.json({ status: 'ok', ...result });
    } catch (error) {
        console.error('DXF parsing error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
}
