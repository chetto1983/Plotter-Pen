import { Tool } from './baseTool.js';
import { Dimension } from '../geometry/primitives.js';

export class DimensionTool extends Tool {
    constructor(manager) {
        super('dimension', manager); // Assuming TOOLS.DIMENSION doesn't exist yet, using string 'dimension'
        this.startPoint = null;
        this.endPoint = null;
        this.step = 'START'; // START -> END -> OFFSET
    }

    reset() {
        super.reset();
        this.startPoint = null;
        this.endPoint = null;
        this.step = 'START';
        // this.preview is handled by super
    }

    getHint() {
        switch (this.step) {
            case 'START': return 'Strumento Quota: Seleziona primo punto';
            case 'END': return 'Strumento Quota: Seleziona secondo punto';
            case 'OFFSET': return 'Strumento Quota: Posiziona quota';
            default: return '';
        }
    }

    onMouseDown(point, _event) {
        if (this.step === 'START') {
            this.startPoint = { x: point.x, y: point.y };
            this.step = 'END';
            this.manager.setReferencePoint(point);
        } else if (this.step === 'END') {
            this.endPoint = { x: point.x, y: point.y };
            this.step = 'OFFSET';
            this.manager.setReferencePoint(point);
            this.updatePreview(point);
        } else if (this.step === 'OFFSET') {
            this.finalize(point);
        }
    }

    onMouseMove(point, _event) {
        if (this.step === 'END' && this.startPoint) {
            // Preview line from start to current
            // We can just show a temp line, or nothing.
            // Let's show nothing until second point is picked, or a rubberband line.
            // But Dimension primitive needs 2 points + offset.
        } else if (this.step === 'OFFSET') {
            this.updatePreview(point);
        }
    }

    updatePreview(cursorPoint) {
        if (!this.startPoint || !this.endPoint) return;

        const dx = this.endPoint.x - this.startPoint.x;
        const dy = this.endPoint.y - this.startPoint.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len < 0.001) return;

        // Calculate offset
        // Normal vector (-dy, dx) normalized
        const nx = -dy / len;
        const ny = dx / len;

        // Vector from Start to Cursor
        const vx = cursorPoint.x - this.startPoint.x;
        const vy = cursorPoint.y - this.startPoint.y;

        // Projection on normal = offset distance
        const offset = vx * nx + vy * ny;

        if (!this.preview) {
            this.preview = new Dimension('preview', this.startPoint.x, this.startPoint.y, this.endPoint.x, this.endPoint.y, offset);
            this.preview.color = '#ff9800';
        } else {
            this.preview.x1 = this.startPoint.x;
            this.preview.y1 = this.startPoint.y;
            this.preview.x2 = this.endPoint.x;
            this.preview.y2 = this.endPoint.y;
            this.preview.offset = offset;
        }
    }

    finalize(_point) {
        if (!this.preview) return;

        const newDim = new Dimension(
            `dim_${Date.now()}`,
            this.preview.x1,
            this.preview.y1,
            this.preview.x2,
            this.preview.y2,
            this.preview.offset
        );

        this.manager.addPrimitive(newDim);
        this.reset();
    }
}
