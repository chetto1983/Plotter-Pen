/**
 * Dimension Renderer
 * Handles rendering of all dimension types
 */
export class DimensionRenderer {
    constructor(renderer) {
        this.renderer = renderer;
    }

    /**
   * Draw radius dimension
   */
    drawRadiusDimension(ctx, dim, scale, settings = {}) {
        if (!dim) return;

        const cx = dim.cx;
        const cy = dim.cy;
        const rx = dim.rx;
        const ry = dim.ry;
        const tx = dim.tx ?? rx;
        const ty = dim.ty ?? ry;

        const angle = Math.atan2(ry - cy, rx - cx);

        ctx.beginPath();
        // Line from center to radius point (radius line)
        ctx.moveTo(cx, cy);
        ctx.lineTo(rx, ry);

        // Leader line to text (if different)
        if (tx !== rx || ty !== ry) {
            ctx.lineTo(tx, ty);
        }
        ctx.stroke();

        // Arrow at radius point (pointing outwards)
        this.drawArrow(ctx, rx, ry, angle, scale);

        // Text
        const text = dim.text || 'R' + dim.radius.toFixed(1);

        // Text Style
        const nominalFontSize = dim.fontSize || settings.fontSize || 12;
        const fontSize = nominalFontSize / scale;
        const _textGap = (dim.textOffset ?? settings.textOffset ?? 5) / scale;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(1, -1); // Unflip Y

        // Simplified text
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center'; // Centered on point
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ctx.strokeStyle;

        ctx.fillText(text, 0, 0);
        ctx.restore();
    }

    /**
     * Draw dimension
     */
    drawDimension(ctx, dim, scale, settings = {}) {
        if (!dim) return;

        // Calculate geometry in World Space (copied from primitives.js)
        const dx = dim.x2 - dim.x1;
        const dy = dim.y2 - dim.y1;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular vector for offset
        const px = -Math.sin(angle) * dim.offset;
        const py = Math.cos(angle) * dim.offset;

        // Points for dimension line
        const d1x = dim.x1 + px;
        const d1y = dim.y1 + py;
        const d2x = dim.x2 + px;
        const d2y = dim.y2 + py;

        const extensionOverride = 5 / scale; // Extend 5px past dim line

        ctx.beginPath();
        // Extension lines
        // Calculate normalized perp vector
        const normLen = Math.sqrt(px * px + py * py);
        let uPx = 0, uPy = 0;
        if (normLen > 0) {
            uPx = px / normLen;
            uPy = py / normLen;
        }

        // Draw extension 1
        ctx.moveTo(dim.x1, dim.y1);
        ctx.lineTo(d1x + uPx * extensionOverride, d1y + uPy * extensionOverride);

        // Draw extension 2
        ctx.moveTo(dim.x2, dim.y2);
        ctx.lineTo(d2x + uPx * extensionOverride, d2y + uPy * extensionOverride);

        // Dimension line
        ctx.moveTo(d1x, d1y);
        ctx.lineTo(d2x, d2y);
        ctx.stroke();

        // Arrows
        this.drawArrow(ctx, d1x, d1y, angle + Math.PI, scale);
        this.drawArrow(ctx, d2x, d2y, angle, scale);

        // Text configuration
        const nominalFontSize = dim.fontSize || settings.fontSize || 12;
        const fontSize = nominalFontSize / scale;
        const textGap = (dim.textOffset ?? settings.textOffset ?? 5) / scale;

        // Text value
        const text = dim.text || length.toFixed(2);
        const midX = (d1x + d2x) / 2;
        const midY = (d1y + d2y) / 2;

        const tx = midX;
        const ty = midY;

        ctx.save();
        ctx.translate(tx, ty);
        ctx.scale(1, -1);

        let screenAngle = -angle;

        // Normalize angle to [-PI, PI]
        while (screenAngle <= -Math.PI) screenAngle += Math.PI * 2;
        while (screenAngle > Math.PI) screenAngle -= Math.PI * 2;

        if (screenAngle > Math.PI / 2) {
            screenAngle -= Math.PI;
        } else if (screenAngle <= -Math.PI / 2) {
            screenAngle += Math.PI;
        }

        ctx.rotate(screenAngle);

        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = ctx.strokeStyle;

        ctx.fillText(text, 0, -textGap);
        ctx.restore();
    }

    /**
     * Draw angular dimension
     */
    drawAngularDimension(ctx, dim, scale, settings = {}) {
        if (!dim) return;

        const cx = dim.cx;
        const cy = dim.cy;
        const r = dim.radius;
        const start = dim.startAngle;
        const end = dim.endAngle;

        // Draw Arc
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, end);
        ctx.stroke();

        // Arrows
        this.drawArrow(ctx, cx + r * Math.cos(start), cy + r * Math.sin(start), start - Math.PI / 2, scale);
        this.drawArrow(ctx, cx + r * Math.cos(end), cy + r * Math.sin(end), end + Math.PI / 2, scale);

        const extLen = 5 / scale;
        const innerLen = 10 / scale;

        ctx.beginPath();
        // Start extension
        ctx.moveTo(cx + (r - innerLen) * Math.cos(start), cy + (r - innerLen) * Math.sin(start));
        ctx.lineTo(cx + (r + extLen) * Math.cos(start), cy + (r + extLen) * Math.sin(start));

        // End extension
        ctx.moveTo(cx + (r - innerLen) * Math.cos(end), cy + (r - innerLen) * Math.sin(end));
        ctx.lineTo(cx + (r + extLen) * Math.cos(end), cy + (r + extLen) * Math.sin(end));
        ctx.stroke();

        // Text
        let degrees = dim.getDegrees ? dim.getDegrees() : 0;
        // ensure function exists, fallback manual calc if primitive mock
        if (!dim.getDegrees) {
            let d = end - start;
            while (d < 0) d += Math.PI * 2;
            degrees = d * 180 / Math.PI;
        }

        const text = dim.text || degrees.toFixed(1) + '°';

        // Mid Angle
        // For shortest arc, if we assume start/end are correct from Tool:
        // If end < start (crossing 0), typical mid calc needs care.
        // BUT we normalized in Tool. So end > start?
        // Tool ensures shortest path by swapping if needed, or keeping it < PI difference.
        // But if (end - start) is negative, we add 2PI.
        // Let's assume (end - start + 2PI) % 2PI is the sweep.
        // Mid = start + sweep/2.

        let diff = end - start;
        while (diff < 0) diff += Math.PI * 2;
        // If diff > PI, then we are drawing the long way?
        // Tool logic now enforces diff <= PI (by swapping).
        // So diff is the sweep.

        let mid = start + diff / 2;

        const midX = cx + r * Math.cos(mid);
        const midY = cy + r * Math.sin(mid);

        const nominalFontSize = dim.fontSize || settings.fontSize || 12;
        const fontSize = nominalFontSize / scale;
        const textGap = (dim.textOffset ?? settings.textOffset ?? 5) / scale;

        ctx.save();
        ctx.translate(midX, midY);
        ctx.scale(1, -1);

        let screenAngle = -(mid + Math.PI / 2);

        while (screenAngle <= -Math.PI) screenAngle += Math.PI * 2;
        while (screenAngle > Math.PI) screenAngle -= Math.PI * 2;

        if (screenAngle > Math.PI / 2) {
            screenAngle -= Math.PI;
        } else if (screenAngle <= -Math.PI / 2) {
            screenAngle += Math.PI;
        }

        ctx.rotate(screenAngle);
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(text, 0, -textGap);
        ctx.restore();
    }

    drawArrow(ctx, x, y, angle, scale) {
        const size = 10 / scale;
        const arrowAngle = Math.PI / 6;

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
}
