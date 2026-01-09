/**
 * Path Optimizer - Optimize drawing order for efficient plotting
 */

import { distance } from '../geometry/core.js';
import { PLC_TYPES } from './PrimitiveExtractor.js';

/**
 * Optimize path order using nearest neighbor heuristic
 */
export class PathOptimizer {
    static optimizeOrder(primitives, startPoint = { x: 0, y: 0 }) {
        if (primitives.length <= 1) return primitives;

        const remaining = [...primitives];
        const optimized = [];
        let currentPoint = { ...startPoint };

        while (remaining.length > 0) {
            let nearestIndex = 0;
            let nearestDist = Infinity;
            let reverseNearest = false;

            for (let i = 0; i < remaining.length; i++) {
                const prim = remaining[i];
                let startPt, endPt;

                if (prim.type === 'circle') {
                    const cx = prim.cx ?? prim.center?.x;
                    const cy = prim.cy ?? prim.center?.y;
                    const r = prim.radius ?? prim._radius;
                    startPt = { x: cx + r, y: cy };
                    endPt = startPt;
                } else if (prim.type === 'rectangle') {
                    startPt = { x: prim.x, y: prim.y };
                    endPt = { x: prim.x, y: prim.y };
                } else if (prim.type === 'polygon' || prim.type === 'polyline') {
                    if (prim.points && prim.points.length > 0) {
                        startPt = prim.points[0];
                        if (prim.closed || prim.type === 'polygon') {
                            endPt = prim.points[0];
                        } else {
                            endPt = prim.points[prim.points.length - 1];
                        }
                    } else {
                        continue;
                    }
                } else {
                    startPt = { x: prim.x1, y: prim.y1 };
                    endPt = { x: prim.x2, y: prim.y2 };
                }

                if (!startPt || !endPt) continue;

                const distToStart = distance(currentPoint.x, currentPoint.y, startPt.x, startPt.y);
                const distToEnd = distance(currentPoint.x, currentPoint.y, endPt.x, endPt.y);

                if (distToStart < nearestDist) {
                    nearestDist = distToStart;
                    nearestIndex = i;
                    reverseNearest = false;
                }

                const isClosed = prim.type === 'circle' || prim.type === 'rectangle' || prim.closed || prim.type === 'polygon';

                if (!isClosed && distToEnd < nearestDist) {
                    nearestDist = distToEnd;
                    nearestIndex = i;
                    reverseNearest = true;
                }
            }

            const selected = remaining.splice(nearestIndex, 1)[0];

            if (reverseNearest) {
                if (selected.type === 'line') {
                    const temp = { x: selected.x1, y: selected.y1 };
                    selected.a.x = selected.x2;
                    selected.a.y = selected.y2;
                    selected.b.x = temp.x;
                    selected.b.y = temp.y;

                    if (selected.plcData) {
                        selected.plcData.x1 = selected.x1;
                        selected.plcData.y1 = selected.y1;
                        selected.plcData.x2 = selected.x2;
                        selected.plcData.y2 = selected.y2;
                    }
                } else if (selected.type === 'arc') {
                    const tempA = { x: selected.a.x, y: selected.a.y };
                    selected.a.x = selected.b.x;
                    selected.a.y = selected.b.y;
                    selected.b.x = tempA.x;
                    selected.b.y = tempA.y;

                    selected.syncGeometry();

                    if (selected.plcData) {
                        selected.plcData.x1 = selected.x1;
                        selected.plcData.y1 = selected.y1;
                        selected.plcData.x2 = selected.x2;
                        selected.plcData.y2 = selected.y2;
                        selected.plcData.type = selected.sweep < 0 ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW;
                    }
                } else if (selected.type === 'polyline') {
                    if (selected.points) {
                        selected.points.reverse();
                    }
                }
            }

            optimized.push(selected);

            if (selected.type === 'circle') {
                const cx = selected.cx ?? selected.center?.x;
                const cy = selected.cy ?? selected.center?.y;
                const r = selected.radius ?? selected._radius;
                currentPoint = { x: cx + r, y: cy };
            } else if (selected.type === 'rectangle') {
                currentPoint = { x: selected.x, y: selected.y };
            } else if (selected.type === 'polygon' || selected.type === 'polyline') {
                if (selected.points && selected.points.length > 0) {
                    if (selected.closed || selected.type === 'polygon') {
                        currentPoint = { x: selected.points[0].x, y: selected.points[0].y };
                    } else {
                        currentPoint = { x: selected.points[selected.points.length - 1].x, y: selected.points[selected.points.length - 1].y };
                    }
                }
            } else {
                currentPoint = { x: selected.x2, y: selected.y2 };
            }
        }

        return optimized;
    }

    static calculateTravelDistance(primitives, startPoint = { x: 0, y: 0 }) {
        let total = 0;
        let current = { ...startPoint };

        for (const prim of primitives) {
            const startPt = { x: prim.x1, y: prim.y1 };
            total += distance(current.x, current.y, startPt.x, startPt.y);

            if (prim.length) {
                total += prim.length;
            }

            current = { x: prim.x2, y: prim.y2 };
        }

        return total;
    }
}

export default PathOptimizer;
