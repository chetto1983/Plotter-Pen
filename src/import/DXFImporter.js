/* global DxfParser */
/**
 * DXF Importer - Parses DXF files and converts to Primitives
 * Uses dxf-parser library (loaded via script tag)
 */

import bSpline from '../geometry/b-spline.js';
import { Line, Arc, Circle, Polygon, Polyline } from '../geometry/primitives.js';
import { ArcBuilder } from '../geometry/arcBuilder.js';
import { pointToSegmentDistance } from '../geometry/core.js';

// Polyfill DxfParser for Node environment if not present
if (typeof DxfParser === 'undefined') {
    // We expect the caller (Node) to provide it globally or we could dynamically import
    // But since this is a shared file, we leave it to dependency injection or global scope
}

export class DXFImporter {
    constructor(dxfParserClass) {
        if (dxfParserClass) {
            this.parser = new dxfParserClass();
        } else {
            // Fallback for browser environment where DxfParser is global
            this.parser = new DxfParser();
        }
        this.scaleFactor = 1.0;
    }


    toModelPoint(x, y) {
        // Note: No Y-flip here - the renderer handles the CAD coordinate system
        // with Y pointing up via its view transform
        return {
            x: x * this.scaleFactor,
            y: y * this.scaleFactor
        };
    }

    /**
     * Parse DXF content and convert to primitives.
     * Processes entities in chunks to keep UI responsive.
     * @param {string} dxfContent - Raw DXF file content
     * @param {function} onProgress - Optional callback (progress: 0-1, message: string)
     * @returns {Promise<{primitives: Array, bounds: Object}>}
     */
    async parse(dxfContent, onProgress = null) {
        let dxf;
        try {
            dxf = this.parser.parseSync(dxfContent);
        } catch (e) {
            console.error('DXF Parser Error:', e);
            throw new Error('Errore nel parsing del file DXF. Formato non valido.');
        }

        if (!dxf || !dxf.entities) {
            throw new Error('File DXF vuoto o non valido');
        }

        this.scaleFactor = 1.0;
        if (dxf.header && dxf.header['$INSUNITS'] !== undefined) {
            const units = dxf.header['$INSUNITS'];
            switch (units) {
                case 1: this.scaleFactor = 25.4; break;
                case 2: this.scaleFactor = 304.8; break;
                case 4: this.scaleFactor = 1.0; break;
                case 5: this.scaleFactor = 10.0; break;
                case 6: this.scaleFactor = 1000.0; break;
                default: this.scaleFactor = 1.0; break;
            }
            console.log(`DXF Units: ${units}, Scale Factor: ${this.scaleFactor}`);
        }

        // Process entities in chunks to keep UI responsive
        const entities = dxf.entities;
        const totalEntities = entities.length;
        const CHUNK_SIZE = 100; // Process 100 entities per frame
        const primitives = [];

        for (let i = 0; i < totalEntities; i += CHUNK_SIZE) {
            const chunkEnd = Math.min(i + CHUNK_SIZE, totalEntities);

            // Process this chunk
            for (let j = i; j < chunkEnd; j++) {
                const prim = this.convertEntity(entities[j]);
                if (prim) {
                    if (Array.isArray(prim)) primitives.push(...prim);
                    else primitives.push(prim);
                }
            }

            // Report progress and yield to UI
            if (onProgress) {
                const progress = chunkEnd / totalEntities;
                onProgress(progress, `Elaborazione entità ${chunkEnd}/${totalEntities}...`);
            }

            // Yield to browser to keep UI responsive
            if (i + CHUNK_SIZE < totalEntities) {
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }

        const bounds = this.calculateBounds(primitives);
        return { primitives, bounds };
    }

    convertEntity(entity) {
        switch (entity.type) {
            case 'LINE': return this.convertLine(entity);
            case 'CIRCLE': return this.convertCircle(entity);
            case 'ARC': return this.convertArc(entity);
            case 'LWPOLYLINE':
            case 'POLYLINE': return this.convertPolyline(entity);
            case 'SPLINE': return this.convertSpline(entity);
            default: return null;
        }
    }

    convertLine(entity) {
        const v = entity.vertices;
        const start = this.toModelPoint(v[0].x, v[0].y);
        const end = this.toModelPoint(v[1].x, v[1].y);
        return new Line(start.x, start.y, end.x, end.y);
    }

    convertCircle(entity) {
        const center = this.toModelPoint(entity.center.x, entity.center.y);
        return new Circle(center.x, center.y, entity.radius * this.scaleFactor);
    }

    convertArc(entity) {
        const cx = entity.center.x;
        const cy = entity.center.y;
        const r = entity.radius;
        const startRad = entity.startAngle * (Math.PI / 180);
        const endRad = entity.endAngle * (Math.PI / 180);

        let sweep = endRad - startRad;
        if (sweep < 0) sweep += Math.PI * 2;
        const midRad = startRad + sweep / 2;

        const start = this.toModelPoint(cx + r * Math.cos(startRad), cy + r * Math.sin(startRad));
        const mid = this.toModelPoint(cx + r * Math.cos(midRad), cy + r * Math.sin(midRad));
        const end = this.toModelPoint(cx + r * Math.cos(endRad), cy + r * Math.sin(endRad));

        const arc = ArcBuilder.fromThreePoints(start, mid, end);
        if (arc) return arc;

        const center = this.toModelPoint(cx, cy);
        return new Arc(start.x, start.y, end.x, end.y, center.x, center.y);
    }

    convertPolyline(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        const points = entity.vertices.map(v => this.toModelPoint(v.x, v.y));
        const isClosed = entity.shape || entity.closed === true;
        return isClosed ? new Polygon(points) : new Polyline(points);
    }

    /**
     * Convert spline - detect circles, arcs, or use polygon
     */
    convertSpline(entity) {
        const degree = entity.degreeOfSplineCurve || 3;
        const knots = entity.knotValues;
        const s = this.scaleFactor;
        const controlPoints = entity.controlPoints.map(p => [p.x * s, p.y * s]);

        if (!controlPoints || controlPoints.length < degree + 1) return null;

        try {
            let minT = 0, maxT = 1;
            if (knots && knots.length > 0) {
                minT = knots[degree];
                maxT = knots[knots.length - 1 - degree];
            }

            // Sample spline at high resolution
            const points = [];
            const samples = 100;
            for (let i = 0; i <= samples; i++) {
                const t = minT + (i / samples) * (maxT - minT);
                const pt = bSpline(t, degree, controlPoints, knots);
                points.push(this.toModelPoint(pt[0] / s, pt[1] / s));
            }

            const isClosed = entity.closed || entity.closedSpline;

            // Check if this closed spline is a circle
            if (isClosed) {
                const circle = this.detectCircle(points);
                if (circle) {
                    return new Circle(circle.cx, circle.cy, circle.r);
                }

                // Not a full circle - try to fit arcs and lines
                const fitted = this.fitArcsToPoints(points);
                if (fitted.length > 0 && fitted.length < points.length / 2) {
                    // Close the shape if needed
                    const first = fitted[0];
                    const last = fitted[fitted.length - 1];
                    const startPt = { x: first.x1, y: first.y1 };
                    const endPt = { x: last.x2, y: last.y2 };
                    const gap = Math.sqrt((startPt.x - endPt.x) ** 2 + (startPt.y - endPt.y) ** 2);
                    if (gap > 0.5) {
                        fitted.push(new Line(endPt.x, endPt.y, startPt.x, startPt.y));
                    }
                    return fitted;
                }

                // Fallback to polygon
                return new Polygon(this.simplifyPoints(points, 0.5));
            }

            // Open spline - return as polyline simplified
            return new Polyline(this.simplifyPoints(points, 0.5));

        } catch (err) {
            console.warn('Spline conversion failed:', err);
            const fallback = entity.controlPoints.map(p => this.toModelPoint(p.x, p.y));
            return new Polyline(fallback);
        }
    }

    /**
     * Fit arcs and lines to points (simplified version)
     */
    fitArcsToPoints(points) {
        const tolerance = 0.5;
        const result = [];
        let i = 0;

        while (i < points.length - 1) {
            // Try arc fitting
            let bestArcEnd = -1;
            let bestCircle = null;

            if (i + 2 < points.length) {
                for (let j = i + 2; j < points.length && j < i + 60; j++) {
                    const mid = Math.floor((i + j) / 2);
                    // Use ArcBuilder common logic
                    const circle = ArcBuilder.circleFromThreePoints(points[i], points[mid], points[j]);
                    if (!circle || circle.r < 0.5 || circle.r > 50000) continue;

                    let fits = true;
                    for (let k = i; k <= j; k++) {
                        const dist = Math.sqrt((points[k].x - circle.cx) ** 2 + (points[k].y - circle.cy) ** 2);
                        if (Math.abs(dist - circle.r) > tolerance) {
                            fits = false;
                            break;
                        }
                    }
                    if (fits) {
                        bestArcEnd = j;
                        bestCircle = circle;
                    }
                }
            }

            if (bestArcEnd > i + 1 && bestCircle) {
                // Determine arc direction from the three points
                const midIdx = Math.floor((i + bestArcEnd) / 2);
                const tempArc = ArcBuilder.fromThreePoints(points[i], points[midIdx], points[bestArcEnd]);

                // Use the through point from tempArc (determines arc direction)
                const throughPoint = tempArc ? tempArc._throughPoint : { x: points[midIdx].x, y: points[midIdx].y };

                result.push(new Arc(
                    points[i].x, points[i].y,
                    points[bestArcEnd].x, points[bestArcEnd].y,
                    bestCircle.cx, bestCircle.cy, throughPoint
                ));
                i = bestArcEnd;
            } else {
                // Line segment
                let lineEnd = i + 1;
                for (let j = i + 2; j < points.length && j < i + 30; j++) {
                    let fits = true;
                    for (let k = i + 1; k < j; k++) {
                        const dist = this.perpDist(points[k], points[i], points[j]);
                        if (dist > tolerance) { fits = false; break; }
                    }
                    if (fits) lineEnd = j;
                    else break;
                }
                result.push(new Line(points[i].x, points[i].y, points[lineEnd].x, points[lineEnd].y));
                i = lineEnd;
            }
        }
        return result;
    }

    // DELETED: fitCircle3Points (replaced by ArcBuilder.circleFromThreePoints)

    /**
     * Detect if points form a circle
     */
    detectCircle(points) {
        if (points.length < 10) return null;

        // Use 3 points to define a candidate circle
        const p1 = points[0];
        const p2 = points[Math.floor(points.length / 3)];
        const p3 = points[Math.floor(points.length * 2 / 3)];

        // Use ArcBuilder common logic for circle detection
        const circle = ArcBuilder.circleFromThreePoints(p1, p2, p3);

        if (!circle) return null;
        if (circle.r < 0.1 || circle.r > 10000) return null;

        const ux = circle.cx;
        const uy = circle.cy;
        const r = circle.r;

        // Check if all points are on this circle (tolerance based on radius)
        const tolerance = r * 0.02; // 2% of radius
        for (const p of points) {
            const dist = Math.sqrt((p.x - ux) ** 2 + (p.y - uy) ** 2);
            if (Math.abs(dist - r) > tolerance) {
                return null;
            }
        }

        return { cx: ux, cy: uy, r };
    }

    /**
     * Simplify points using Douglas-Peucker algorithm
     */
    simplifyPoints(points, epsilon) {
        if (points.length <= 2) return points;

        let dmax = 0, index = 0;
        const end = points.length - 1;

        for (let i = 1; i < end; i++) {
            const d = this.perpDist(points[i], points[0], points[end]);
            if (d > dmax) { index = i; dmax = d; }
        }

        if (dmax > epsilon) {
            const left = this.simplifyPoints(points.slice(0, index + 1), epsilon);
            const right = this.simplifyPoints(points.slice(index), epsilon);
            return [...left.slice(0, -1), ...right];
        }
        return [points[0], points[end]];
    }

    /**
     * Perpendicular distance from point to line segment
     * Delegates to core.js canonical implementation
     */
    perpDist(pt, lineStart, lineEnd) {
        return pointToSegmentDistance(pt.x, pt.y, lineStart.x, lineStart.y, lineEnd.x, lineEnd.y);
    }

    calculateBounds(primitives) {
        if (primitives.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of primitives) {
            const bb = p.getBoundingBox();
            minX = Math.min(minX, bb.minX);
            minY = Math.min(minY, bb.minY);
            maxX = Math.max(maxX, bb.maxX);
            maxY = Math.max(maxY, bb.maxY);
        }
        return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
    }
}
