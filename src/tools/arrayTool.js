import { Tool } from './baseTool.js';
import { getModalManager } from '../ui/ModalManager.js';

export class ArrayTool extends Tool {
    constructor(manager) {
        super('array', manager);
        this.step = 'SELECT_OBJECTS'; // SELECT_OBJECTS -> SELECT_CENTER (Polar only) -> DONE
        this.selection = new Set();
        this.params = null; // Store array parameters
    }

    reset() {
        super.reset();
        this.step = 'SELECT_OBJECTS';
        this.selection.clear();
        this.params = null;
        this.manager.app.highlightedPrimitive = null;
    }

    getHint() {
        if (this.step === 'SELECT_OBJECTS') {
            return `Serie (Array): Seleziona oggetti (Invio per confermare)`;
        } else if (this.step === 'SELECT_CENTER') {
            return `Serie Polare: Seleziona punto centrale`;
        }
        return '';
    }

    onMouseDown(point, _event) {
        if (this.step === 'SELECT_OBJECTS') {
            // Select logic similar to SelectionManager
            const prim = this.findPrimitiveAt(point);
            if (prim) {
                if (this.selection.has(prim)) {
                    this.selection.delete(prim);
                } else {
                    this.selection.add(prim);
                }
                // Visual feedback? Usually selection highlight
                // For now rely on manual highlight or just trust user
                this.manager.app.renderer.render(); // Force redraw if we had visual state
            }
        } else if (this.step === 'SELECT_CENTER') {
            // Polar array center
            this.generatePolarArray(point);
        }
    }

    onKeyDown(event) {
        if (event.key === 'Enter') {
            if (this.step === 'SELECT_OBJECTS') {
                if (this.selection.size === 0) {
                    // Try using current selection if tool started with selection
                    if (this.manager.app.selectionManager.selectedPrimitives.size > 0) {
                        this.selection = new Set(this.manager.app.selectionManager.selectedPrimitives);
                    } else {
                        this.manager.app.ui.updateStatus('Nessun oggetto selezionato');
                        return;
                    }
                }
                this.showConfigDialog();
            }
        }
    }

    findPrimitiveAt(point) {
        // Reuse similar logic from other tools
        const primitives = this.manager.app.primitives;
        let bestDist = 10 / this.manager.app.renderer.getEffectiveScale();
        let bestPrim = null;

        for (const p of primitives) {
            const d = p.distanceToPoint(point);
            if (d < bestDist) {
                bestDist = d;
                bestPrim = p;
            }
        }
        return bestPrim;
    }

    async showConfigDialog() {
        // Use ModalManager to get params
        const modal = getModalManager();
        const result = await modal.arrayDialog();

        if (result) {
            this.params = result;
            if (result.type === 'rectangular') {
                this.generateRectangularArray();
            } else {
                this.step = 'SELECT_CENTER';
                this.manager.app.ui.updateStatus(this.getHint());
            }
        } else {
            this.cancel();
        }
    }

    generateRectangularArray() {
        const { rows, cols, spacingX, spacingY } = this.params;
        const newPrimitives = [];

        this.selection.forEach(prim => {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (r === 0 && c === 0) continue; // Original

                    const clone = prim.clone(); // Assuming primitive.clone() exists! 
                    // Verify if clone exists, otherwise implement or work around
                    if (clone) {
                        const dx = c * spacingX;
                        const dy = r * spacingY;
                        clone.translate(dx, dy);
                        newPrimitives.push(clone);
                    }
                }
            }
        });

        newPrimitives.forEach(p => this.manager.addPrimitive(p));
        this.reset();
        this.manager.app.ui.updateStatus('Serie rettangolare creata');
    }

    generatePolarArray(center) {
        const { count, angle, rotateItems } = this.params;
        // If 360, it's / count. If partial, it might be different step.
        // Let's assume 'angle' is the total angle filled.
        // Step is angle / count if we include the last one at TotalAngle? 
        // Standard CAD: Angle to fill. 
        // Items are distributed evenly over Angle.
        // If 360, space is 360/count.
        // If 180, space is 180/(count-1) usually? Or 180/count?
        // Let's stick to 360/count logic for simple full circle.

        // Actually, if angle is 360, we want n items. 0, 360/n, ...
        // If angle is 90 and n=3: 0, 45, 90? Or 0, 30, 60?
        // Let's use fill mode: Angle covers the fill.
        // If 360, step = 360/count.
        // If <360, step = angle / (count - 1)?

        const isFullCircle = Math.abs(angle - 360) < 0.1;
        const stepRad = isFullCircle ? (2 * Math.PI) / count : (angle * Math.PI / 180) / (count - 1);

        const newPrimitives = [];

        this.selection.forEach(prim => {
            for (let i = 1; i < count; i++) {
                const theta = i * stepRad;

                const clone = prim.clone();
                if (clone) {
                    // Rotate around center
                    // Rotate
                    clone.rotate(center.x, center.y, theta);

                    if (!rotateItems) {
                        // If items should NOT rotate, we rotate them back around their own center?
                        // Complex. Standard Polar array rotates items.
                        // Non-rotated array requires: Position rotated, but Orientation retained.
                        // To do this: Rotate position (center of obj), but don't rotate geometry vectors?
                        // Easier: Rotate fully, then rotate back around its own center?
                        // clone.rotate(-theta, clone.center);
                        // Let's support only rotated items for Phase 1.
                    }

                    newPrimitives.push(clone);
                }
            }
        });

        newPrimitives.forEach(p => this.manager.addPrimitive(p));
        this.reset();
        this.manager.app.ui.updateStatus('Serie polare creata');
    }
}
