import { Tool } from './baseTool.js';
import { findLineIntersection, isPointOnSegment } from '../geometry/intersection.js';
import { distance } from '../geometry/core.js';

export class TrimTool extends Tool {
    constructor(manager) {
        super('trim', manager);
        this.step = 'SELECT_CUTTING_EDGE'; // SELECT_CUTTING_EDGE -> SELECT_OBJECT
        this.boundary = null;
        this.mode = 'TRIM'; // TRIM or EXTEND (toggled by Shift)
    }

    reset() {
        super.reset();
        this.step = 'SELECT_CUTTING_EDGE';
        this.boundary = null;
        this.mode = 'TRIM';
    }

    getHint() {
        if (this.step === 'SELECT_CUTTING_EDGE') {
            return 'Taglia/Estendi: Seleziona bordo di taglio (o raggio)';
        } else {
            return this.mode === 'TRIM'
                ? 'Taglia: Clicca sulla parte da RIMUOVERE (Shift per Estendi)'
                : 'Estendi: Clicca sulla parte da ESTENDERE (Shift per Taglia)';
        }
    }

    onMouseMove(point, event) {
        // Toggle mode with Shift
        if (this.step === 'SELECT_OBJECT') {
            const newMode = event.shiftKey ? 'EXTEND' : 'TRIM';
            if (this.mode !== newMode) {
                this.mode = newMode;
                this.manager.app.ui.updateStatus(this.getHint());
            }
        }
        super.onMouseMove(point, event);
    }

    onKeyDown(event) {
        if (event.key === 'Shift') {
            if (this.step === 'SELECT_OBJECT') {
                this.mode = 'EXTEND';
                this.manager.app.ui.updateStatus(this.getHint());
            }
        }
    }

    onKeyUp(event) {
        if (event.key === 'Shift') {
            if (this.step === 'SELECT_OBJECT') {
                this.mode = 'TRIM';
                this.manager.app.ui.updateStatus(this.getHint());
            }
        }
    }

    onMouseDown(point, _event) {
        // Debug Log
        console.log('TrimTool.onMouseDown', { point, step: this.step, mode: this.mode });

        const app = this.manager.app;
        const prim = this.findPrimitiveAt(point);
        console.log('Found primitive:', prim ? prim.id : 'none');

        if (!prim) return;

        if (this.step === 'SELECT_CUTTING_EDGE') {
            if (prim.type !== 'line') {
                console.log('Not a line:', prim.type);
                app.ui.updateStatus('Al momento supportato solo taglio con LINEA');
                return;
            }

            this.boundary = prim;
            this.step = 'SELECT_OBJECT';
            console.log('Boundary selected:', this.boundary.id);
            app.ui.updateStatus(this.getHint());
        } else if (this.step === 'SELECT_OBJECT') {
            if (prim === this.boundary) {
                console.log('Clicked boundary, ignore');
                return;
            }
            if (prim.type !== 'line') {
                app.ui.updateStatus('Al momento supportato solo taglio di LINEE');
                return;
            }

            console.log('Target selected:', prim.id, 'Mode:', this.mode);

            if (this.mode === 'TRIM') {
                this.trimObject(prim, point);
            } else {
                this.extendObject(prim, point);
            }
        }
    }

    findPrimitiveAt(point) {
        const primitives = this.manager.app.primitives;
        const scale = this.manager.app.renderer.getEffectiveScale();
        let bestDist = 10 / scale;
        let bestPrim = null;

        console.log('findPrimitiveAt', { point, primitiveCount: primitives.length, scale, threshold: bestDist });

        for (const p of primitives) {
            // Removed restricted type check to see what we find
            // if (p.type !== 'line') continue; 

            const d = p.distanceToPoint(point);
            // console.log(`Check ${p.id} (${p.type}): dist=${d}`); // Verbose but useful if stuck

            if (d < bestDist) {
                bestDist = d;
                bestPrim = p;
            }
        }
        return bestPrim;
    }

    trimObject(target, pickPoint) {
        console.log('Trimming object', target.id);
        const intersection = findLineIntersection(this.boundary, target);
        console.log('Intersection result:', intersection);

        if (!intersection) {
            this.manager.app.ui.updateStatus('Righe parallele - nessuna intersezione');
            return;
        }

        if (!isPointOnSegment(intersection, target)) {
            console.log('Intersection not on segment');
            this.manager.app.ui.updateStatus('Intersezione fuori dal segmento');
            return;
        }

        // 2. Identify which side of the intersection the pick point is

        // We want to remove the side where the pick point is.
        // So we KEEP the OTHER side.

        // Let's check which endpoint is on the SAME side of intersection as pick point.
        // Vector I->Pick. Vector I->End1. Dot product > 0 means same side.

        const dxPick = pickPoint.x - intersection.x;
        const dyPick = pickPoint.y - intersection.y;

        const dx1 = target.x1 - intersection.x;
        const dy1 = target.y1 - intersection.y;

        const dot1 = dxPick * dx1 + dyPick * dy1;
        console.log('Dot product:', dot1);

        if (dot1 > 0) {
            target.x1 = intersection.x;
            target.y1 = intersection.y;
        } else {
            target.x2 = intersection.x;
            target.y2 = intersection.y;
        }

        this.manager.app.stateManager.pushState();
        if (target.getRenderData) target.getRenderData(true);
        this.manager.app.renderer.invalidateCache();
        this.manager.app.render();
        this.manager.app.ui.updateStatus('Elemento tagliato');
    }

    extendObject(target, _pickPoint) {
        console.log('Extending object', target.id);
        const intersection = findLineIntersection(this.boundary, target);
        console.log('Intersection result:', intersection);

        if (!intersection) {
            this.manager.app.ui.updateStatus('Righe parallele - nessuna intersezione');
            return;
        }

        // Logic: Extend the endpoint closer to the pick point (and closer to intersection)

        const d1 = distance(target.x1, target.y1, intersection.x, intersection.y);
        const d2 = distance(target.x2, target.y2, intersection.x, intersection.y);
        console.log('Distances:', d1, d2);

        // Pick the end that is closer to the intersection (that's the one we extend)
        // Usually extend works by clicking near the end you want to extend.

        if (d1 < d2) {
            // Extend x1,y1
            target.x1 = intersection.x;
            target.y1 = intersection.y;
        } else {
            // Extend x2,y2
            target.x2 = intersection.x;
            target.y2 = intersection.y;
        }

        if (target.getRenderData) target.getRenderData(true);
        this.manager.app.renderer.invalidateCache();
        this.manager.app.render();
        this.manager.app.ui.updateStatus('Elemento esteso');
    }
}
