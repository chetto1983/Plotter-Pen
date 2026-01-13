/**
 * Primitive Extractor - Extract primitives from stroke data
 */

import { Line, Arc } from '../geometry/primitives.js';
import { ArcBuilder } from '../geometry/arcBuilder.js';

/**
 * Extraction configuration
 */
export const EXTRACTION_CONFIG = {
    minPrimitiveLength: 0.8,
    epsLine: 0.35,
    epsArc: 0.9,
    arcFitWindow: 5,
    simplifyTolerance: 0.1,
    minArcSweep: 0,
    minArcSagittaRatio: 0.0001,
    maxArcFitPoints: 2000
};

/**
 * Primitive types for PLC output
 */
export const PLC_TYPES = {
    LINE: 1,
    ARC_CW: 2,
    ARC_CCW: 3
};

/**
 * Extract primitives from stroke data
 */
export class PrimitiveExtractor {
    constructor(config = {}) {
        this.config = { ...EXTRACTION_CONFIG, ...config };
    }

    extractFromStrokes(strokes) {
        const primitives = [];
        let idCounter = 0;

        for (const stroke of strokes) {
            if (!stroke || stroke.length < 2) continue;

            if (stroke.arcInfo) {
                const arc = this.createArcFromInfo(stroke.arcInfo, idCounter++);
                if (arc) primitives.push(arc);
                continue;
            }

            if (stroke.tool) {
                const extracted = this.extractFromToolStroke(stroke, idCounter);
                idCounter += extracted.length;
                primitives.push(...extracted);
                continue;
            }

            const detected = this.detectPrimitives(stroke, idCounter);
            idCounter += detected.length;
            primitives.push(...detected);
        }

        return primitives;
    }

    createArcFromInfo(info, id) {
        if (!info.start || !info.end || !info.center || !info.radius) {
            return null;
        }

        const arc = new Arc(
            info.start.x, info.start.y,
            info.end.x, info.end.y,
            info.center.x, info.center.y,
            info.throughPoint || null,
            `arc_${id}`
        );

        arc.plcData = {
            type: arc.sweep < 0 ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW,
            x1: info.start.x,
            y1: info.start.y,
            x2: info.end.x,
            y2: info.end.y,
            cx: info.center.x,
            cy: info.center.y
        };

        return arc;
    }

    extractFromToolStroke(stroke, startId) {
        const primitives = [];

        switch (stroke.tool) {
            case 'line':
                if (stroke.length >= 2) {
                    const line = new Line(
                        stroke[0].x, stroke[0].y,
                        stroke[stroke.length - 1].x, stroke[stroke.length - 1].y,
                        `line_${startId}`
                    );
                    line.plcData = {
                        type: PLC_TYPES.LINE,
                        x1: line.x1,
                        y1: line.y1,
                        x2: line.x2,
                        y2: line.y2
                    };
                    primitives.push(line);
                }
                break;

            case 'arc':
                if (stroke.arcInfo) {
                    const arc = this.createArcFromInfo(stroke.arcInfo, startId);
                    if (arc) primitives.push(arc);
                }
                break;

            case 'rectangle':
            case 'polygon':
            default:
                for (let i = 0; i < stroke.length - 1; i++) {
                    const line = new Line(
                        stroke[i].x, stroke[i].y,
                        stroke[i + 1].x, stroke[i + 1].y,
                        `line_${startId + i}`
                    );
                    if (line.length >= this.config.minPrimitiveLength) {
                        line.plcData = {
                            type: PLC_TYPES.LINE,
                            x1: line.x1,
                            y1: line.y1,
                            x2: line.x2,
                            y2: line.y2
                        };
                        primitives.push(line);
                    }
                }
        }

        return primitives;
    }

    detectPrimitives(points, startId) {
        if (points.length < 2) return [];

        const primitives = [];
        let id = startId;
        let i = 0;
        const allowArcFit = points.length <= this.config.maxArcFitPoints;

        while (i < points.length - 1) {
            if (allowArcFit && i + this.config.arcFitWindow <= points.length) {
                const arcResult = this.tryFitArc(points, i);

                if (arcResult && arcResult.rms < this.config.epsArc) {
                    primitives.push(arcResult.primitive);
                    arcResult.primitive.id = `arc_${id++}`;
                    i = arcResult.endIndex;
                    continue;
                }
            }

            const lineResult = this.tryFitLine(points, i);

            if (lineResult && lineResult.rms < this.config.epsLine) {
                primitives.push(lineResult.primitive);
                lineResult.primitive.id = `line_${id++}`;
                i = lineResult.endIndex;
                continue;
            }

            const line = new Line(
                points[i].x, points[i].y,
                points[i + 1].x, points[i + 1].y,
                `line_${id++}`
            );

            if (line.length >= this.config.minPrimitiveLength) {
                line.plcData = {
                    type: PLC_TYPES.LINE,
                    x1: line.x1,
                    y1: line.y1,
                    x2: line.x2,
                    y2: line.y2
                };
                primitives.push(line);
            }

            i++;
        }

        return primitives;
    }

    tryFitLine(points, startIndex) {
        let bestEnd = startIndex + 1;
        let bestRms = Infinity;
        let bestLine = null;

        for (let end = startIndex + 2; end < points.length; end++) {
            const line = new Line(
                points[startIndex].x, points[startIndex].y,
                points[end].x, points[end].y
            );

            const rms = this.calculateLineRMS(line, points, startIndex, end);

            if (rms < this.config.epsLine && rms <= bestRms) {
                bestRms = rms;
                bestEnd = end;
                bestLine = line;
            } else if (rms > this.config.epsLine * 2) {
                break;
            }
        }

        if (bestLine && bestLine.length >= this.config.minPrimitiveLength) {
            bestLine.plcData = {
                type: PLC_TYPES.LINE,
                x1: bestLine.x1,
                y1: bestLine.y1,
                x2: bestLine.x2,
                y2: bestLine.y2
            };
            return { primitive: bestLine, endIndex: bestEnd, rms: bestRms };
        }

        return null;
    }

    tryFitArc(points, startIndex) {
        const windowSize = this.config.arcFitWindow;

        if (startIndex + windowSize > points.length) return null;

        const start = points[startIndex];
        const mid = points[startIndex + Math.floor(windowSize / 2)];
        const end = points[startIndex + windowSize - 1];

        const arc = ArcBuilder.fromThreePoints(start, mid, end);

        if (!arc) return null;

        const chord = Math.hypot(end.x - start.x, end.y - start.y);
        if (!Number.isFinite(chord) || chord < this.config.minPrimitiveLength) {
            return null;
        }

        if (Math.abs(arc.sweep) < this.config.minArcSweep) {
            return null;
        }

        const sagitta = Math.abs(ArcBuilder.signedDistanceToChord(start, end, arc.midpoint));
        const sagittaRatio = chord > 0 ? sagitta / chord : 0;
        if (sagittaRatio < this.config.minArcSagittaRatio) {
            return null;
        }

        const rms = this.calculateArcRMS(arc, points, startIndex, startIndex + windowSize);

        if (rms < this.config.epsArc) {
            let bestEnd = startIndex + windowSize;

            for (let end = startIndex + windowSize; end < points.length; end++) {
                const extendedArc = ArcBuilder.fromThreePoints(
                    start,
                    points[Math.floor((startIndex + end) / 2)],
                    points[end]
                );

                if (!extendedArc) break;

                const extRms = this.calculateArcRMS(extendedArc, points, startIndex, end + 1);

                if (extRms < this.config.epsArc) {
                    bestEnd = end + 1;
                    arc.b.x = points[end].x;
                    arc.b.y = points[end].y;
                    arc.syncGeometry();
                } else {
                    break;
                }
            }

            arc.plcData = {
                type: arc.sweep < 0 ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW,
                x1: arc.x1,
                y1: arc.y1,
                x2: arc.x2,
                y2: arc.y2,
                cx: arc.cx,
                cy: arc.cy
            };

            return { primitive: arc, endIndex: bestEnd, rms };
        }

        return null;
    }

    calculateLineRMS(line, points, start, end) {
        let sumSq = 0;
        let count = 0;

        for (let i = start; i <= end && i < points.length; i++) {
            const dist = line.distanceToPoint(points[i]);
            sumSq += dist * dist;
            count++;
        }

        return count > 0 ? Math.sqrt(sumSq / count) : Infinity;
    }

    calculateArcRMS(arc, points, start, end) {
        let sumSq = 0;
        let count = 0;

        for (let i = start; i < end && i < points.length; i++) {
            const dist = arc.distanceToPoint(points[i]);
            sumSq += dist * dist;
            count++;
        }

        return count > 0 ? Math.sqrt(sumSq / count) : Infinity;
    }
}

export default PrimitiveExtractor;
