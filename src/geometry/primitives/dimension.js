import { Primitive } from './base.js';

/**
 * Dimension Primitive
 * Represents a linear dimension annotation
 */
export class Dimension extends Primitive {
    /**
     * @param {string} id - Unique identifier
     * @param {number} x1 - Start Point X (Measure Start)
     * @param {number} y1 - Start Point Y (Measure Start)
     * @param {number} x2 - End Point X (Measure End)
     * @param {number} y2 - End Point Y (Measure End)
     * @param {number} offset - Offset distance from measure line (perpendicular)
     */
    constructor(id, x1, y1, x2, y2, offset = 20) {
        super(id, 'dimension');
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.offset = offset;
        this.text = ''; // Auto-calculated if empty
    }

    /**
     * Render the dimension
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} view - View transform
     */
    render(ctx, view) {
        // Calculate geometry
        const dx = this.x2 - this.x1;
        const dy = this.y2 - this.y1;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular vector for offset
        const px = -Math.sin(angle) * this.offset;
        const py = Math.cos(angle) * this.offset;

        // Points for dimension line
        const d1x = this.x1 + px;
        const d1y = this.y1 + py;
        const d2x = this.x2 + px;
        const d2y = this.y2 + py;

        // Transform for rendering
        const t1 = view.worldToScreen(this.x1, this.y1);
        const t2 = view.worldToScreen(this.x2, this.y2);
        const td1 = view.worldToScreen(d1x, d1y);
        const td2 = view.worldToScreen(d2x, d2y);

        ctx.beginPath();
        // Extension lines
        ctx.moveTo(t1.x, t1.y);
        ctx.lineTo(td1.x + (px * 0.2 * view.zoom), td1.y + (py * 0.2 * view.zoom)); // Extend slightly past dim line

        ctx.moveTo(t2.x, t2.y);
        ctx.lineTo(td2.x + (px * 0.2 * view.zoom), td2.y + (py * 0.2 * view.zoom));

        // Dimension line
        ctx.moveTo(td1.x, td1.y);
        ctx.lineTo(td2.x, td2.y);

        ctx.strokeStyle = this.selected ? '#ff9800' : (this.color || '#ffffff');
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arrows
        this.drawArrow(ctx, td1.x, td1.y, angle + Math.PI);
        this.drawArrow(ctx, td2.x, td2.y, angle);

        // Text
        const text = this.text || length.toFixed(2);
        const midX = (td1.x + td2.x) / 2;
        const midY = (td1.y + td2.y) / 2;

        ctx.save();
        ctx.translate(midX, midY);
        // Ensure text is readable (not upside down)
        let textAngle = angle;
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
            textAngle += Math.PI;
        }
        ctx.rotate(textAngle);

        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = this.selected ? '#ff9800' : (this.color || '#ffffff');
        ctx.fillText(text, 0, -2); // Slightly above line
        ctx.restore();
    }

    /**
     * Draw an arrow head
     */
    drawArrow(ctx, x, y, angle) {
        const size = 10;
        const arrowAngle = Math.PI / 6; // 30 degrees

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
            x - size * Math.cos(angle - arrowAngle),
            y - size * Math.sin(angle - arrowAngle)
        );
        ctx.moveTo(x, y);
        ctx.lineTo(
            x - size * Math.cos(angle + arrowAngle),
            y - size * Math.sin(angle + arrowAngle)
        );
        ctx.stroke();
    }

    /**
     * Check if point is near the dimension
     */
    distanceToPoint(point) {
        // Simplified: check distance to dimension line
        // Accurate would check extension lines too
        const dx = this.x2 - this.x1;
        const dy = this.y2 - this.y1;
        const angle = Math.atan2(dy, dx);

        const px = -Math.sin(angle) * this.offset;
        const py = Math.cos(angle) * this.offset;

        const d1x = this.x1 + px;
        const d1y = this.y1 + py;
        const d2x = this.x2 + px;
        const d2y = this.y2 + py;

        // Distance to the dimension line segment (d1-d2)
        const A = point.x - d1x;
        const B = point.y - d1y;
        const C = d2x - d1x;
        const D = d2y - d1y;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = d1x;
            yy = d1y;
        } else if (param > 1) {
            xx = d2x;
            yy = d2y;
        } else {
            xx = d1x + param * C;
            yy = d1y + param * D;
        }

        const dx_p = point.x - xx;
        const dy_p = point.y - yy;
        return Math.sqrt(dx_p * dx_p + dy_p * dy_p);
    }

    /**
     * Move the dimension
     */
    translate(dx, dy) {
        this.x1 += dx;
        this.y1 += dy;
        this.x2 += dx;
        this.y2 += dy;
    }

    /**
     * Scale
     */
    scale(ox, oy, factor) {
        this.x1 = ox + (this.x1 - ox) * factor;
        this.y1 = oy + (this.y1 - oy) * factor;
        this.x2 = ox + (this.x2 - ox) * factor;
        this.y2 = oy + (this.y2 - oy) * factor;
        this.offset *= factor;
    }

    /**
    * Rotate
    */
    rotate(ox, oy, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const r1x = this.x1 - ox;
        const r1y = this.y1 - oy;
        this.x1 = ox + r1x * cos - r1y * sin;
        this.y1 = oy + r1x * sin + r1y * cos;

        const r2x = this.x2 - ox;
        const r2y = this.y2 - oy;
        this.x2 = ox + r2x * cos - r2y * sin;
        this.y2 = oy + r2x * sin + r2y * cos;
    }

    /**
    * Mirror
    */
    mirror(ox, oy, axis) {
        if (axis === 'x') {
            this.y1 = oy - (this.y1 - oy);
            this.y2 = oy - (this.y2 - oy);
        } else {
            this.x1 = ox - (this.x1 - ox);
            this.x2 = ox - (this.x2 - ox);
        }
        // Offset might need inversion if we want to keep it on "same side" visually?
        // For now keep as is.
    }

    get boundingBox() {
        const minX = Math.min(this.x1, this.x2);
        const minY = Math.min(this.y1, this.y2);
        const maxX = Math.max(this.x1, this.x2);
        const maxY = Math.max(this.y1, this.y2);
        // Include offset margin
        return {
            minX: minX - Math.abs(this.offset),
            minY: minY - Math.abs(this.offset),
            maxX: maxX + Math.abs(this.offset),
            maxY: maxY + Math.abs(this.offset)
        };
        // Note: this is rough.
    }

    getBoundingBox() {
        return this.boundingBox;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            x1: this.x1,
            y1: this.y1,
            x2: this.x2,
            y2: this.y2,
            offset: this.offset,
            text: this.text
        };
    }

    static fromJSON(data) {
        const dim = new Dimension(data.id, data.x1, data.y1, data.x2, data.y2, data.offset);
        dim.text = data.text;
        dim.layerId = data.layerId;
        dim.color = data.color;
        return dim;
    }
}
