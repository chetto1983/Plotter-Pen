import { Tool } from './baseTool.js';
import { ArcBuilder } from '../geometry/arcBuilder.js';
import { computeFilletGeometry } from '../geometry/fillet.js';
import { Vector2, distance } from '../geometry/core.js';

export class FilletTool extends Tool {
    constructor(manager) {
        super('fillet', manager);
        this.radius = 10; // Default radius
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
            case 'SELECT_1': return `Raccordo (R=${this.radius}): Seleziona prima linea`;
            case 'SELECT_2': return `Raccordo (R=${this.radius}): Seleziona seconda linea`;
            default: return '';
        }
    }

    onMouseDown(point, _event) {
        // Find primitives at point
        // Using snapManager to find nearest object? Or selectionManager?
        // We typically raycast or use distance.
        // Let's use manager.app.findPrimitiveAt(point) or similar logic.
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
            // Highlight line1?
        } else if (this.step === 'SELECT_2') {
            if (prim === this.line1.prim) return; // Same line

            this.line2 = { prim: prim, pick: point };
            this.createFillet();
        }
    }

    findPrimitiveAt(point) {
        const primitives = this.manager.app.primitives;
        let bestDist = 10 / this.manager.app.renderer.getEffectiveScale(); // Tolerance in screen pixels converted to world
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

    createFillet() {
        const l1 = this.line1.prim;
        const l2 = this.line2.prim;

        // Intersection logic in tool to handle segments
        const x1 = l1.x1, y1 = l1.y1, x2 = l1.x2, y2 = l1.y2;
        const x3 = l2.x1, y3 = l2.y1, x4 = l2.x2, y4 = l2.y2;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-6) return; // Parallel

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const px = x1 + t * (x2 - x1);
        const py = y1 + t * (y2 - y1);
        const I = new Vector2(px, py);

        // Determine vectors from Intersection towards the PICK points
        // Pick points tell us which side of the intersection we care about.
        const v1 = new Vector2(this.line1.pick.x, this.line1.pick.y).sub(I).normalize();
        const v2 = new Vector2(this.line2.pick.x, this.line2.pick.y).sub(I).normalize();

        const result = computeFilletGeometry(I, v1, v2, this.radius);

        if (!result) return;

        // The fillet is the short arc from T1 to T2, the one that faces the corner. The Arc takes
        // its start, end and centre; the builder adds the point that sets the side it bulges to.
        const arc = ArcBuilder.fromCenterStartEnd(result.center, result.t1, result.t2);
        if (!arc) return;

        // Each line keeps the part with the pick point and now ends at its tangent point
        this.trimLine(l1, result.t1, I);
        this.trimLine(l2, result.t2, I);

        this.manager.addPrimitive(arc);
        this.reset();
    }

    trimLine(line, tPoint, intersection) {
        // We want to keep the segment that contains the Pick Point, but bounded by TPoint.
        // Wait, TPoint IS the new boundary near Intersection.
        // So one endpoint should become TPoint.
        // Which one? The one closer to Intersection is replaced by TPoint? 
        // YES.

        const d1 = distance(line.x1, line.y1, intersection.x, intersection.y);
        const d2 = distance(line.x2, line.y2, intersection.x, intersection.y);

        if (d1 < d2) {
            line.x1 = tPoint.x;
            line.y1 = tPoint.y;
        } else {
            line.x2 = tPoint.x;
            line.y2 = tPoint.y;
        }
        // Force update render cache
        if (line.getRenderData) line.getRenderData(true); // invalidates cache
        this.manager.app.renderer.invalidateCache();
    }

    processCommand(command) {
        // Allow changing radius: "R 20"
        if (command.toUpperCase().startsWith('R')) {
            const val = parseFloat(command.substring(1));
            if (!isNaN(val)) {
                this.radius = val;
                this.manager.app.ui.updateStatus(`Raggio raccordo impostato a ${this.radius}`);
                return true;
            }
        }
        return false;
    }
}
