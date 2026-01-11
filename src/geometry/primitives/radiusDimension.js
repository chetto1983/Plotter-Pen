import { Primitive } from './base.js';

/**
 * Radius Dimension Primitive
 * Represents a radius measurement for a circle or arc
 */
export class RadiusDimension extends Primitive {
    /**
     * @param {string} id - Unique identifier
     * @param {number} cx - Center X
     * @param {number} cy - Center Y
     * @param {number} rx - Point on Arc X
     * @param {number} ry - Point on Arc Y
     */
    constructor(id, cx, cy, rx, ry) {
        super('radiusDimension', id);
        this.cx = cx;
        this.cy = cy;
        this.rx = rx; // Point on radius
        this.ry = ry;

        // Calculated/Cached
        this.radius = Math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2);

        // Optional Label Position (if different from radius extension)
        // For simple impl, we might just assume text is at (rx, ry) or extended outward
        this.tx = rx;
        this.ty = ry;

        this.text = '';
        this.fontSize = null;
        this.textOffset = null;
    }

    clone() {
        const copy = new RadiusDimension(
            undefined,
            this.cx,
            this.cy,
            this.rx,
            this.ry
        );
        this.copyProperties(copy);
        copy.text = this.text;
        copy.fontSize = this.fontSize;
        copy.textOffset = this.textOffset;
        copy.tx = this.tx;
        copy.ty = this.ty;
        return copy;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            cx: this.cx,
            cy: this.cy,
            rx: this.rx,
            ry: this.ry,
            tx: this.tx,
            ty: this.ty,
            text: this.text,
            fontSize: this.fontSize,
            textOffset: this.textOffset
        };
    }

    static fromJSON(data) {
        const dim = new RadiusDimension(
            data.id,
            data.cx,
            data.cy,
            data.rx,
            data.ry
        );
        dim.layerId = data.layerId;
        dim.style = data.style;
        dim.text = data.text;
        dim.fontSize = data.fontSize;
        dim.textOffset = data.textOffset;
        if (data.tx !== undefined) {
            dim.tx = data.tx;
            dim.ty = data.ty;
        }
        return dim;
    }
}
