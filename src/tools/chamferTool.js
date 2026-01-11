import { Tool } from './baseTool.js';
import { Line } from '../geometry/primitives.js';
import { computeChamferGeometry } from '../geometry/chamfer.js';
import { Vector2, distance } from '../geometry/core.js';

export class ChamferTool extends Tool {
    constructor(manager) {
        super('chamfer', manager);
        this.distance = 10; // Default chamfer distance
        this.step = 'SELECT_1'; // SELECT_1 -> SELECT_2
        this.line1 = null;
        this.line2 = null;
    }

    reset() {
        super.reset();
        this.step = 'SELECT_1';
        this.line1 = null;
        this.line2 = null;
    }

    getHint() {
        switch (this.step) {
            case 'SELECT_1': return `Cimatura (D=${this.distance}): Seleziona prima linea`;
            case 'SELECT_2': return `Cimatura (D=${this.distance}): Seleziona seconda linea`;
            default: return '';
        }
    }

    onMouseDown(point, _event) {
        const app = this.manager.app;
        const prim = this.findPrimitiveAt(point);

        if (!prim || prim.type !== 'line') {
            app.ui.updateStatus('Per favore seleziona una LINEA');
            return;
        }

        if (this.step === 'SELECT_1') {
            this.line1 = { prim: prim, pick: point };
            this.step = 'SELECT_2';
            app.ui.updateStatus(this.getHint());
        } else if (this.step === 'SELECT_2') {
            if (prim === this.line1.prim) return; // Same line

            this.line2 = { prim: prim, pick: point };
            this.createChamfer();
        }
    }

    findPrimitiveAt(point) {
        const primitives = this.manager.app.primitives;
        let bestDist = 10 / this.manager.app.renderer.getEffectiveScale();
        let bestPrim = null;

        for (const p of primitives) {
            if (p.type !== 'line') continue;
            const d = p.distanceToPoint(point);
            if (d < bestDist) {
                bestDist = d;
                bestPrim = p;
            }
        }
        return bestPrim;
    }

    createChamfer() {
        const l1 = this.line1.prim;
        const l2 = this.line2.prim;

        // Intersection logic (same as FilletTool)
        const x1 = l1.x1, y1 = l1.y1, x2 = l1.x2, y2 = l1.y2;
        const x3 = l2.x1, y3 = l2.y1, x4 = l2.x2, y4 = l2.y2;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-6) return; // Parallel

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const px = x1 + t * (x2 - x1);
        const py = y1 + t * (y2 - y1);
        const I = new Vector2(px, py);

        // Determine vectors from Intersection towards the PICK points
        const v1 = new Vector2(this.line1.pick.x, this.line1.pick.y).sub(I).normalize();
        const v2 = new Vector2(this.line2.pick.x, this.line2.pick.y).sub(I).normalize();

        const result = computeChamferGeometry(I, v1, v2, this.distance);

        if (result) {
            // Create chamfer line segment
            const chamferLine = new Line(result.p1.x, result.p1.y, result.p2.x, result.p2.y);

            // Trim original lines
            this.trimLine(l1, result.p1, I);
            this.trimLine(l2, result.p2, I);

            this.manager.addPrimitive(chamferLine);
            this.reset();
        }
    }

    trimLine(line, tPoint, intersection) {
        // Keep segment that contains the Pick Point, clipped at tPoint
        const d1 = distance(line.x1, line.y1, intersection.x, intersection.y);
        const d2 = distance(line.x2, line.y2, intersection.x, intersection.y);

        if (d1 < d2) {
            line.x1 = tPoint.x;
            line.y1 = tPoint.y;
        } else {
            line.x2 = tPoint.x;
            line.y2 = tPoint.y;
        }

        if (line.getRenderData) line.getRenderData(true);
        this.manager.app.renderer.invalidateCache();
    }

    processCommand(command) {
        // Allow changing distance: "D 20"
        if (command.toUpperCase().startsWith('D')) {
            const val = parseFloat(command.substring(1));
            if (!isNaN(val)) {
                this.distance = val;
                this.manager.app.ui.updateStatus(`Distanza cimatura impostata a ${this.distance}`);
                return true;
            }
        }
        return false;
    }
}
