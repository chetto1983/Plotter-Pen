import { Tool } from './baseTool.js';
import { TOOLS } from './constants.js';
import { AngularDimension } from '../geometry/primitives/angularDimension.js';
import { parseVector } from './commandParser.js';

export class AngularDimensionTool extends Tool {
    constructor(manager) {
        super(TOOLS.ANGULAR_DIMENSION, manager);
        this.reset();
    }

    reset() {
        super.reset();
        this.step = 0;
        this.vertex = null;
        this.startPoint = null;
        this.endPoint = null;
        this.preview = null;
    }

    getHint() {
        switch (this.step) {
            case 0: return 'Seleziona il vertice (centro)';
            case 1: return 'Seleziona il primo punto (angolo inizio)';
            case 2: return 'Seleziona il secondo punto (angolo fine)';
            case 3: return 'Imposta il raggio (clicca per confermare)';
            default: return '';
        }
    }

    onMouseMove(point, _event) {
        if (this.step === 0) {
            // Nothing to preview yet
        } else if (this.step === 1) {
            // Preview line from vertex to mouse
            this.preview = {
                type: 'line',
                x1: this.vertex.x,
                y1: this.vertex.y,
                x2: point.x,
                y2: point.y
            };
        } else if (this.step === 2) {
            // Preview two lines
            // Or preview angular dimension with default radius?
            // Better to preview the second leg
            this.preview = {
                type: 'polyline',
                points: [this.startPoint, this.vertex, point],
                closed: false
            };
        } else if (this.step === 3) {
            // Preview Angular Dimension
            const dx = point.x - this.vertex.x;
            const dy = point.y - this.vertex.y;
            const radius = Math.sqrt(dx * dx + dy * dy);

            // Calc angles
            let startAngle = Math.atan2(this.startPoint.y - this.vertex.y, this.startPoint.x - this.vertex.x);
            let endAngle = Math.atan2(this.endPoint.y - this.vertex.y, this.endPoint.x - this.vertex.x);

            // Normalize to shortest arc
            let diff = endAngle - startAngle;
            while (diff < 0) diff += Math.PI * 2;

            if (diff > Math.PI) {
                const temp = startAngle;
                startAngle = endAngle;
                endAngle = temp;
            }

            this.preview = {
                type: 'angularDimension',
                cx: this.vertex.x,
                cy: this.vertex.y,
                startAngle,
                endAngle,
                radius,
                getDegrees: () => {
                    let d = endAngle - startAngle;
                    while (d < 0) d += Math.PI * 2;
                    return d * 180 / Math.PI;
                }
            };
        }
    }

    onMouseUp(point, _event) {
        if (this.step === 0) {
            this.vertex = point;
            this.step = 1;
            this.manager.setReferencePoint(point);
        } else if (this.step === 1) {
            this.startPoint = point;
            this.step = 2;
            this.manager.setReferencePoint(point);
        } else if (this.step === 2) {
            this.endPoint = point;
            this.step = 3;
            // Don't change reference, keep at end point
        } else if (this.step === 3) {
            // Finalize
            const dx = point.x - this.vertex.x;
            const dy = point.y - this.vertex.y;
            const radius = Math.sqrt(dx * dx + dy * dy) || 50;

            let startAngle = Math.atan2(this.startPoint.y - this.vertex.y, this.startPoint.x - this.vertex.x);
            let endAngle = Math.atan2(this.endPoint.y - this.vertex.y, this.endPoint.x - this.vertex.x);

            // Normalize to shortest arc
            let diff = endAngle - startAngle;
            while (diff < 0) diff += Math.PI * 2;

            if (diff > Math.PI) {
                const temp = startAngle;
                startAngle = endAngle;
                endAngle = temp;
            }

            const dim = new AngularDimension(
                `angDim_${Date.now()}`,
                this.vertex.x,
                this.vertex.y,
                startAngle,
                endAngle,
                radius
            );

            // Check current layer properties
            const activeLayer = this.manager.app.layerManager.getActiveLayer();
            if (activeLayer) {
                dim.layerId = activeLayer.id;
                dim.color = activeLayer.color;
                dim.fontSize = activeLayer.fontSize;
                dim.textOffset = activeLayer.textOffset;
            }

            this.manager.addPrimitive(dim);
            this.reset();
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            if (this.step > 0) {
                // Back one step? Or full cancel?
                // Standard: Cancel tool operation
                this.reset();
                this.manager.notifyHintChanged();
                this.manager.notifyPreviewChanged();
            }
        }
    }

    processCommand(command) {
        const result = parseVector(this.manager.referencePoint, command);
        if (result.error) return result.error;
        this.onMouseUp(result);
        return null;
    }
}
