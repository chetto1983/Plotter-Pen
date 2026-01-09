/**
 * Interactive Arc Tool State Machine
 */

import { TWO_PI, TOLERANCE } from './core.js';
import { ArcBuilder, ARC_MODES } from './arcBuilder.js';

export { ARC_MODES };

/**
 * Interactive Arc Tool State Machine
 */
export class ArcToolState {
    constructor() {
        this.reset();
    }

    reset() {
        this.mode = ARC_MODES.THREE_POINT;
        this.phase = 'idle';
        this.points = [];
        this.preview = null;
        this.tempArc = null;
    }

    getHint() {
        const hints = {
            [ARC_MODES.THREE_POINT]: {
                idle: 'Clicca per il punto iniziale dell\'arco',
                point1: 'Clicca per il punto intermedio (sulla curva)',
                point2: 'Clicca per il punto finale'
            },
            [ARC_MODES.CENTER_START_END]: {
                idle: 'Clicca per il centro dell\'arco',
                point1: 'Clicca per il punto iniziale (definisce il raggio)',
                point2: 'Clicca per il punto finale'
            },
            [ARC_MODES.CENTER_START_ANGLE]: {
                idle: 'Clicca per il centro dell\'arco',
                point1: 'Clicca per il punto iniziale',
                point2: 'Muovi per l\'angolo, clicca per confermare'
            },
            [ARC_MODES.START_END_BULGE]: {
                idle: 'Clicca per il punto iniziale',
                point1: 'Clicca per il punto finale',
                point2: 'Muovi per la curvatura, clicca per confermare'
            }
        };

        const modeHints = hints[this.mode] || hints[ARC_MODES.THREE_POINT];
        return modeHints[this.phase] || modeHints.idle;
    }

    addPoint(point) {
        this.points.push({ x: point.x, y: point.y });

        switch (this.phase) {
            case 'idle':
                this.phase = 'point1';
                break;
            case 'point1':
                this.phase = 'point2';
                break;
            case 'point2':
                return this.buildArc();
        }

        return null;
    }

    updatePreview(mousePoint) {
        if (this.points.length === 0) {
            this.preview = null;
            this.tempArc = null;
            return;
        }

        this.preview = { x: mousePoint.x, y: mousePoint.y };

        switch (this.mode) {
            case ARC_MODES.THREE_POINT:
                this.buildThreePointPreview(mousePoint);
                break;
            case ARC_MODES.CENTER_START_END:
                this.buildCenterStartEndPreview(mousePoint);
                break;
            case ARC_MODES.CENTER_START_ANGLE:
                this.buildCenterStartAnglePreview(mousePoint);
                break;
            case ARC_MODES.START_END_BULGE:
                this.buildStartEndBulgePreview(mousePoint);
                break;
            default:
                this.buildThreePointPreview(mousePoint);
        }
    }

    buildThreePointPreview(mousePoint) {
        if (this.points.length === 1) {
            this.tempArc = null;
        } else if (this.points.length === 2) {
            this.tempArc = ArcBuilder.fromThreePoints(
                this.points[0],
                this.points[1],
                mousePoint
            );
        }
    }

    buildCenterStartEndPreview(mousePoint) {
        if (this.points.length === 1) {
            this.tempArc = null;
        } else if (this.points.length === 2) {
            this.tempArc = ArcBuilder.fromCenterStartEnd(
                this.points[0],
                this.points[1],
                mousePoint
            );
        }
    }

    buildCenterStartAnglePreview(mousePoint) {
        if (this.points.length === 1) {
            this.tempArc = null;
        } else if (this.points.length === 2) {
            const center = this.points[0];
            const start = this.points[1];
            const endAngle = Math.atan2(mousePoint.y - center.y, mousePoint.x - center.x);
            const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
            let sweep = endAngle - startAngle;

            if (sweep > Math.PI) sweep -= TWO_PI;
            if (sweep < -Math.PI) sweep += TWO_PI;

            this.tempArc = ArcBuilder.fromCenterStartAngle(center, start, sweep);
        }
    }

    buildStartEndBulgePreview(mousePoint) {
        if (this.points.length === 1) {
            this.tempArc = null;
        } else if (this.points.length === 2) {
            const start = this.points[0];
            const end = this.points[1];
            const bulge = ArcBuilder.calculateBulge(start, end, mousePoint);

            if (Math.abs(bulge) > TOLERANCE) {
                this.tempArc = ArcBuilder.fromStartEndBulge(start, end, bulge);
            } else {
                this.tempArc = null;
            }
        }
    }

    buildArc() {
        if (this.points.length < 2) return null;

        let arc = null;

        switch (this.mode) {
            case ARC_MODES.THREE_POINT:
                if (this.points.length >= 3) {
                    arc = ArcBuilder.fromThreePoints(
                        this.points[0],
                        this.points[1],
                        this.points[2]
                    );
                }
                break;

            case ARC_MODES.CENTER_START_END:
                if (this.points.length >= 3) {
                    arc = ArcBuilder.fromCenterStartEnd(
                        this.points[0],
                        this.points[1],
                        this.points[2]
                    );
                }
                break;

            case ARC_MODES.CENTER_START_ANGLE:
                if (this.points.length >= 3) {
                    const center = this.points[0];
                    const start = this.points[1];
                    const anglePoint = this.points[2];
                    const endAngle = Math.atan2(anglePoint.y - center.y, anglePoint.x - center.x);
                    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
                    let sweep = endAngle - startAngle;
                    if (sweep > Math.PI) sweep -= TWO_PI;
                    if (sweep < -Math.PI) sweep += TWO_PI;
                    arc = ArcBuilder.fromCenterStartAngle(center, start, sweep);
                }
                break;

            case ARC_MODES.START_END_BULGE:
                if (this.points.length >= 3) {
                    const start = this.points[0];
                    const end = this.points[1];
                    const through = this.points[2];
                    const bulge = ArcBuilder.calculateBulge(start, end, through);
                    arc = ArcBuilder.fromStartEndBulge(start, end, bulge);
                    if (arc) {
                        const mp = arc.midpoint;
                        arc._throughPoint = { x: mp.x, y: mp.y };
                    }
                }
                break;

            default:
                if (this.points.length >= 3) {
                    arc = ArcBuilder.fromThreePoints(
                        this.points[0],
                        this.points[1],
                        this.points[2]
                    );
                }
        }

        return arc;
    }

    setMode(mode) {
        if (Object.values(ARC_MODES).includes(mode)) {
            this.mode = mode;
            this.reset();
            this.mode = mode;
        }
    }
}

export default ArcToolState;
