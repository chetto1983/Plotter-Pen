/* global importScripts, DxfParser */
/**
 * DXF Worker - Processes DXF files in a background thread
 * This worker handles parsing and entity conversion off the main thread
 */

// Import dxf-parser library (path relative to HTML file that loads the worker)
importScripts('/node_modules/dxf-parser/dist/dxf-parser.js');

// Tolerance constant
const TOLERANCE = 1e-6;

// Scale factor for unit conversion
let scaleFactor = 1.0;

// Convert DXF coordinates to model coordinates
function toModelPoint(x, y) {
    return {
        x: x * scaleFactor,
        y: -y * scaleFactor  // Flip Y for screen coordinates
    };
}

// Calculate distance between two points
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}





// Calculate midpoint of arc for throughPoint
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

// Convert LINE entity
function convertLine(entity) {
    const v = entity.vertices;
    const start = toModelPoint(v[0].x, v[0].y);
    const end = toModelPoint(v[1].x, v[1].y);
    return {
        type: 'line',
        x1: start.x, y1: start.y,
        x2: end.x, y2: end.y
    };
}

// Convert CIRCLE entity
function convertCircle(entity) {
    const center = toModelPoint(entity.center.x, entity.center.y);
    const radius = entity.radius * scaleFactor;
    return {
        type: 'circle',
        cx: center.x, cy: center.y,
        radius: radius
    };
}

// Convert ARC entity
function convertArc(entity) {
    const center = toModelPoint(entity.center.x, entity.center.y);
    const radius = entity.radius * scaleFactor;

    // DXF angles are in degrees, counter-clockwise from positive X
    // We flip Y, so start/end swap roles
    const startAngle = -entity.endAngle * Math.PI / 180;
    const endAngle = -entity.startAngle * Math.PI / 180;

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
        throughPoint: throughPoint
    };
}

// Convert POLYLINE/LWPOLYLINE entity
function convertPolyline(entity) {
    const closed = entity.shape || false;
    const vertices = entity.vertices || [];
    if (vertices.length < 2) return null;

    const points = vertices.map(v => toModelPoint(v.x, v.y));
    const primitives = [];

    for (let i = 0; i < vertices.length - 1; i++) {
        const v1 = vertices[i];

        const p1 = points[i];
        const p2 = points[i + 1];
        const bulge = v1.bulge || 0;

        if (Math.abs(bulge) < TOLERANCE) {
            // Straight line segment
            primitives.push({
                type: 'line',
                x1: p1.x, y1: p1.y,
                x2: p2.x, y2: p2.y
            });
        } else {
            // Arc segment from bulge
            const arc = createArcFromBulge(p1, p2, -bulge); // Negate bulge for Y-flip
            if (arc) primitives.push(arc);
        }
    }

    // Close the polyline if needed
    if (closed && vertices.length > 2) {
        const lastV = vertices[vertices.length - 1];
        const lastBulge = lastV.bulge || 0;
        const p1 = points[points.length - 1];
        const p2 = points[0];

        if (Math.abs(lastBulge) < TOLERANCE) {
            primitives.push({
                type: 'line',
                x1: p1.x, y1: p1.y,
                x2: p2.x, y2: p2.y
            });
        } else {
            const arc = createArcFromBulge(p1, p2, -lastBulge);
            if (arc) primitives.push(arc);
        }
    }

    return primitives;
}

// Create arc from bulge value
function createArcFromBulge(start, end, bulge) {
    const chord = distance(start.x, start.y, end.x, end.y);
    if (chord < TOLERANCE) return null;

    const sagitta = Math.abs(bulge) * chord / 2;
    const radius = (sagitta / 2) + (chord * chord) / (8 * sagitta);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    const midToCenter = radius - sagitta;
    const sign = bulge > 0 ? -1 : 1;
    const cx = midX + midToCenter * perpX * sign;
    const cy = midY + midToCenter * perpY * sign;

    // Calculate through point at arc peak
    const throughPoint = {
        x: midX - sign * perpX * sagitta,
        y: midY - sign * perpY * sagitta
    };

    return {
        type: 'arc',
        x1: start.x, y1: start.y,
        x2: end.x, y2: end.y,
        cx: cx, cy: cy,
        throughPoint: throughPoint
    };
}

// Convert SPLINE entity to line segments
function convertSpline(entity) {
    // Simplified spline to polyline conversion
    const controlPoints = entity.controlPoints || [];
    if (controlPoints.length < 2) return null;

    //const _degree = entity.degreeOfSplineCurve || 3;
    const fits = entity.fitPoints || [];

    // If we have fit points, use those
    if (fits.length >= 2) {
        const primitives = [];
        for (let i = 0; i < fits.length - 1; i++) {
            const p1 = toModelPoint(fits[i].x, fits[i].y);
            const p2 = toModelPoint(fits[i + 1].x, fits[i + 1].y);
            primitives.push({
                type: 'line',
                x1: p1.x, y1: p1.y,
                x2: p2.x, y2: p2.y
            });
        }
        return primitives;
    }

    // Otherwise create line segments from control points
    const primitives = [];
    for (let i = 0; i < controlPoints.length - 1; i++) {
        const p1 = toModelPoint(controlPoints[i].x, controlPoints[i].y);
        const p2 = toModelPoint(controlPoints[i + 1].x, controlPoints[i + 1].y);
        primitives.push({
            type: 'line',
            x1: p1.x, y1: p1.y,
            x2: p2.x, y2: p2.y
        });
    }
    return primitives;
}

// Convert a single entity
function convertEntity(entity) {
    switch (entity.type) {
        case 'LINE': return convertLine(entity);
        case 'CIRCLE': return convertCircle(entity);
        case 'ARC': return convertArc(entity);
        case 'LWPOLYLINE':
        case 'POLYLINE': return convertPolyline(entity);
        case 'SPLINE': return convertSpline(entity);
        default: return null;
    }
}

// Calculate bounds from primitives data
function calculateBounds(primitives) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of primitives) {
        if (p.type === 'line') {
            minX = Math.min(minX, p.x1, p.x2);
            minY = Math.min(minY, p.y1, p.y2);
            maxX = Math.max(maxX, p.x1, p.x2);
            maxY = Math.max(maxY, p.y1, p.y2);
        } else if (p.type === 'arc') {
            minX = Math.min(minX, p.x1, p.x2, p.cx - Math.abs(p.cx - p.x1));
            minY = Math.min(minY, p.y1, p.y2, p.cy - Math.abs(p.cy - p.y1));
            maxX = Math.max(maxX, p.x1, p.x2, p.cx + Math.abs(p.cx - p.x1));
            maxY = Math.max(maxY, p.y1, p.y2, p.cy + Math.abs(p.cy - p.y1));
        } else if (p.type === 'circle') {
            minX = Math.min(minX, p.cx - p.radius);
            minY = Math.min(minY, p.cy - p.radius);
            maxX = Math.max(maxX, p.cx + p.radius);
            maxY = Math.max(maxY, p.cy + p.radius);
        }
    }

    return { minX, minY, maxX, maxY };
}

// Handle messages from main thread
self.onmessage = function (e) {
    const { type, content } = e.data;

    if (type === 'parse') {
        try {
            const parser = new DxfParser();

            self.postMessage({ type: 'progress', progress: 0.05, message: 'Parsing DXF...' });

            const dxf = parser.parseSync(content);

            if (!dxf || !dxf.entities) {
                self.postMessage({ type: 'error', error: 'File DXF vuoto o non valido' });
                return;
            }

            // Handle unit scaling
            scaleFactor = 1.0;
            if (dxf.header && dxf.header['$INSUNITS'] !== undefined) {
                const units = dxf.header['$INSUNITS'];
                switch (units) {
                    case 1: scaleFactor = 25.4; break;   // Inches
                    case 2: scaleFactor = 304.8; break;  // Feet
                    case 4: scaleFactor = 1.0; break;    // Millimeters
                    case 5: scaleFactor = 10.0; break;   // Centimeters
                    case 6: scaleFactor = 1000.0; break; // Meters
                }
            }

            self.postMessage({ type: 'progress', progress: 0.1, message: 'Converting entities...' });

            const entities = dxf.entities;
            const totalEntities = entities.length;
            const primitiveData = [];
            const CHUNK_SIZE = 50;

            for (let i = 0; i < totalEntities; i += CHUNK_SIZE) {
                const chunkEnd = Math.min(i + CHUNK_SIZE, totalEntities);

                for (let j = i; j < chunkEnd; j++) {
                    const prim = convertEntity(entities[j]);
                    if (prim) {
                        if (Array.isArray(prim)) primitiveData.push(...prim);
                        else primitiveData.push(prim);
                    }
                }

                const progress = 0.1 + 0.85 * (chunkEnd / totalEntities);
                self.postMessage({
                    type: 'progress',
                    progress,
                    message: `Elaborazione ${chunkEnd}/${totalEntities} entità...`
                });
            }

            const bounds = calculateBounds(primitiveData);

            self.postMessage({
                type: 'complete',
                primitives: primitiveData,
                bounds: bounds,
                count: primitiveData.length
            });

        } catch (err) {
            self.postMessage({ type: 'error', error: err.message });
        }
    }
};
