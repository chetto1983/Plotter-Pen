
import { Tool } from './baseTool.js';
import { TOOLS } from './constants.js';
import { RadiusDimension } from '../geometry/primitives/radiusDimension.js';
import { parseVector } from './commandParser.js';

export class RadiusDimensionTool extends Tool {
    constructor(manager) {
        super(TOOLS.RADIUS_DIMENSION, manager);
        this.reset();
    }

    reset() {
        super.reset();
        this.step = 'START'; // START (select primitive) -> OFFSET (place text)
        this.center = null;
        this.radius = 0;
        this.radiusPoint = null;
        this.preview = null;
        this.selectedPrimitive = null;
    }

    getHint() {
        switch (this.step) {
            case 'START': return 'Strumento Raggio: Seleziona un cerchio o un arco';
            case 'OFFSET': return 'Strumento Raggio: Clicca per posizionare il testo della quota';
            default: return '';
        }
    }

    findPrimitiveAt(point) {
        // Find closest circle or arc
        // Logic similar to SnapManager but simpler
        // We iterate manager.app.primitives
        const primitives = this.manager.app.primitives;
        const scale = this.manager.app.renderer ? this.manager.app.renderer.getEffectiveScale() : 1;
        let bestDist = 10 / scale;
        let bestPrim = null;

        for (const prim of primitives) {
            if (prim.type !== 'circle' && prim.type !== 'arc') continue;

            // Simple distance check to circumference
            // For circle/arc, dist is abs(dist(center, point) - radius)
            let cx, cy, r;
            if (prim.type === 'circle') {
                cx = prim.center?.x ?? prim.cx;
                cy = prim.center?.y ?? prim.cy;
                r = prim.radius ?? prim.r;
            } else { // arc
                // Assuming standard arc properties
                // Sometimes arc stores center/radius directly or x/y/i/j
                // Let's use getRenderData approach if available, or fallback
                if (prim.cx !== undefined) {
                    cx = prim.cx;
                    cy = prim.cy;
                    r = prim.radius;
                } else {
                    // Primitive specific logic if needed
                    continue;
                }
            }

            if (cx === undefined || r === undefined) continue;

            const dx = point.x - cx;
            const dy = point.y - cy;
            const distToCenter = Math.sqrt(dx * dx + dy * dy);
            const distToCurve = Math.abs(distToCenter - r);

            if (distToCurve < bestDist) {
                bestDist = distToCurve;
                bestPrim = prim;
            }
        }
        return bestPrim;
    }

    onMouseDown(point, _event) {
        if (this.step === 'START') {
            const prim = this.findPrimitiveAt(point);
            if (prim) {
                this.selectedPrimitive = prim;
                this.center = {
                    x: prim.cx ?? prim.center?.x,
                    y: prim.cy ?? prim.center?.y
                };
                this.radius = prim.radius ?? prim.r;

                // Calculate initial radius point (projection of mouse on circle)
                const dx = point.x - this.center.x;
                const dy = point.y - this.center.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.0001) {
                    this.radiusPoint = {
                        x: this.center.x + (dx / len) * this.radius,
                        y: this.center.y + (dy / len) * this.radius
                    };
                } else {
                    this.radiusPoint = { x: this.center.x + this.radius, y: this.center.y };
                }

                this.step = 'OFFSET';
                this.manager.setReferencePoint(point);
                this.manager.notifyHintChanged();
            }
        } else if (this.step === 'OFFSET') {
            this.finalize(point);
        }
    }

    onMouseMove(point, _event) {
        if (this.step === 'START') {
            // Highlight potential selection?
            // Could add highlight logic here if ToolManager supports it
            const prim = this.findPrimitiveAt(point);
            if (prim) {
                // We could set a temp highlight in app
                if (this.manager.app.setHoveredPrimitive) {
                    this.manager.app.setHoveredPrimitive(prim);
                }
            } else {
                if (this.manager.app.setHoveredPrimitive) {
                    this.manager.app.setHoveredPrimitive(null);
                }
            }

        } else if (this.step === 'OFFSET') {
            this.updatePreview(point);
        }
    }

    updatePreview(cursorPoint) {
        if (!this.center) return;

        // Radius point is fixed on the circle (closest point to where we clicked? 
        // OR does radius line follow the cursor angle?
        // Standard CAD radius dim: Line goes from center to arc. 
        // If text is placed outside, leader line extends.

        // Let's make the radius line follow the cursor angle for better placement
        const dx = cursorPoint.x - this.center.x;
        const dy = cursorPoint.y - this.center.y;
        const angle = Math.atan2(dy, dx);

        this.radiusPoint = {
            x: this.center.x + this.radius * Math.cos(angle),
            y: this.center.y + this.radius * Math.sin(angle)
        };

        if (!this.preview) {
            this.preview = new RadiusDimension(
                'preview',
                this.center.x,
                this.center.y,
                this.radiusPoint.x,
                this.radiusPoint.y
            );
            this.preview.tx = cursorPoint.x;
            this.preview.ty = cursorPoint.y;
            this.preview.color = '#ff9800'; // Preview color
        } else {
            this.preview.cx = this.center.x;
            this.preview.cy = this.center.y;
            this.preview.rx = this.radiusPoint.x;
            this.preview.ry = this.radiusPoint.y;
            this.preview.tx = cursorPoint.x;
            this.preview.ty = cursorPoint.y;
            this.preview.radius = this.radius; // Ensure radius is kept
        }
    }

    finalize(point) {
        if (!this.preview) return;

        const id = `radDim_${Date.now()}`;
        const dim = new RadiusDimension(
            id,
            this.center.x,
            this.center.y,
            this.radiusPoint.x, // Use the last calculated radius point
            this.radiusPoint.y
        );

        // Set text position
        dim.tx = point.x;
        dim.ty = point.y;

        // Set text content
        dim.text = 'R' + this.radius.toFixed(2);

        // Apply layer properties
        const activeLayer = this.manager.app.layerManager.getActiveLayer();
        if (activeLayer) {
            dim.layerId = activeLayer.id;
            dim.color = activeLayer.color;
            dim.fontSize = activeLayer.fontSize;
            dim.textOffset = activeLayer.textOffset;
        }

        this.manager.addPrimitive(dim);

        // Reset but stay in tool? Or reset completely?
        // Standard: Reset to allow next dimension
        this.reset();
        this.manager.notifyHintChanged();
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.reset();
            this.manager.notifyHintChanged();
            this.manager.notifyPreviewChanged();
        }
    }

    processCommand(command) {
        // CMD support
        return null;
    }
}
