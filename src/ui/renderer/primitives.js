import { TWO_PI } from '../../geometry/core.js';
import { COLORS } from './colors.js';

export class PrimitiveRenderer {
  constructor(renderer) {
    this.renderer = renderer;
  }

  /**
   * Draw all primitives with batched rendering for performance
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} scale
   * @param {Array} primitives - Array of domain objects (Line, Arc, etc.)
   * @param {Set} selectedPrimitives - Set of selected primitive objects
   */
  drawPrimitives(ctx, scale, primitives, selectedPrimitives = new Set(), layerColors = {}) {
    const lineWidth = this.renderer.lineWidth / scale;
    const selectedLineWidth = lineWidth * 1.5;

    if (!primitives || primitives.length === 0) return;

    // Group by color (non-selected)
    const byColor = new Map();
    const deferredSelected = [];
    const defaultColor = COLORS.primitive;

    for (const prim of primitives) {
      if (!prim) continue;
      if (prim.visible === false) continue;

      if (selectedPrimitives.has(prim)) {
        deferredSelected.push(prim);
        continue;
      }

      // Determine color: Style > Layer > Default
      let color = prim.style?.strokeColor;
      if (!color && prim.layerId && layerColors[prim.layerId]) {
        color = layerColors[prim.layerId];
      }
      if (!color) color = defaultColor;

      if (!byColor.has(color)) byColor.set(color, []);
      byColor.get(color).push(prim);
    }

    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw batches by color
    for (const [color, group] of byColor) {
      ctx.save();
      ctx.strokeStyle = color;
      this.drawBatch(ctx, group);
      ctx.restore();
    }

    // Draw selected primitives
    if (deferredSelected.length > 0) {
      ctx.save();
      ctx.strokeStyle = COLORS.primitiveSelected;
      ctx.lineWidth = selectedLineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const prim of deferredSelected) {
        this.drawPrimitive(ctx, prim, scale);
      }

      ctx.restore();
    }
  }

  /**
   * internal batch drawer for a specific color group
   */
  drawBatch(ctx, primitives) {
    ctx.beginPath();

    const deferredArcs = [];
    const deferredCircles = [];
    const deferredPolygons = [];
    const deferredRectangles = [];

    for (const prim of primitives) {
      if (prim.type === 'line') {
        ctx.moveTo(prim.x1, prim.y1);
        ctx.lineTo(prim.x2, prim.y2);
      } else if (prim.type === 'arc') {
        deferredArcs.push(prim);
      } else if (prim.type === 'circle') {
        deferredCircles.push(prim);
      } else if (prim.type === 'polygon' || prim.type === 'polyline') {
        deferredPolygons.push(prim);
      } else if (prim.type === 'rectangle') {
        deferredRectangles.push(prim);
      }
    }

    // Stroke all batched lines
    ctx.stroke();

    // Batch Arcs
    if (deferredArcs.length > 0) {
      ctx.beginPath();
      for (const arc of deferredArcs) {
        const render = typeof arc.getRenderData === 'function' ? arc.getRenderData() : null;
        if (!render || !render.r) continue;

        const startX = render.cx + render.r * Math.cos(render.startAngle);
        const startY = render.cy + render.r * Math.sin(render.startAngle);

        ctx.moveTo(startX, startY);
        ctx.arc(render.cx, render.cy, render.r, render.startAngle, render.endAngle, render.anticlockwise);
      }
      ctx.stroke();
    }

    // Batch Circles
    if (deferredCircles.length > 0) {
      ctx.beginPath();
      for (const circle of deferredCircles) {
        const r = circle.radius ?? circle.r;
        const cx = circle.cx ?? circle.center?.x;
        const cy = circle.cy ?? circle.center?.y;

        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, TWO_PI);
      }
      ctx.stroke();
    }

    // Batch Polygons
    if (deferredPolygons.length > 0) {
      ctx.beginPath();
      for (const poly of deferredPolygons) {
        if (!poly.points || poly.points.length < 2) continue;

        ctx.moveTo(poly.points[0].x, poly.points[0].y);
        for (let i = 1; i < poly.points.length; i++) {
          ctx.lineTo(poly.points[i].x, poly.points[i].y);
        }
        if (poly.closed || poly.type === 'polygon') ctx.closePath();
      }
      ctx.stroke();
    }

    // Batch Rectangles
    if (deferredRectangles.length > 0) {
      ctx.beginPath();
      for (const rect of deferredRectangles) {
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
      }
      ctx.stroke();
    }
  }

  /**
   * Draw a single primitive
   */
  drawPrimitive(ctx, prim, scale) {
    if (!prim) return;

    switch (prim.type) {
      case 'line':
        this.drawLine(ctx, prim);
        break;
      case 'arc':
        this.drawArc(ctx, prim, scale);
        break;
      case 'circle':
        this.drawCircle(ctx, prim);
        break;
      case 'rectangle':
        this.drawRectangle(ctx, prim);
        break;
      case 'polygon':
      case 'polyline':
        this.drawPolygon(ctx, prim);
        break;
      case 'dimension':
        this.drawDimension(ctx, prim, scale);
        break;
    }
  }

  /**
   * Draw line
   */
  drawLine(ctx, line) {
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }

  /**
   * Draw arc
   */
  drawArc(ctx, arc, scale) {
    try {
      // SINGLE SOURCE OF TRUTH: Always use getRenderData()
      const render = arc.getRenderData();

      // Sanity checks to prevent freeze
      if (!render || isNaN(render.r) || render.r <= 0 || !isFinite(render.startAngle) || !isFinite(render.endAngle)) {
        return;
      }
      if (render.r > 1000000) return; // Skip massive arcs that might freeze canvas

      ctx.beginPath();
      ctx.arc(render.cx, render.cy, render.r, render.startAngle, render.endAngle, render.anticlockwise);
      ctx.stroke();

      // Draw arc markers
      this.drawArcMarkers(ctx, arc, scale);
    } catch (e) {
      console.warn('Error drawing arc:', e);
    }
  }

  /**
   * Draw arc markers (start, end, midpoint)
   */
  drawArcMarkers(ctx, arc, scale) {
    const markerRadius = 3 / scale;

    // Start point (green)
    ctx.fillStyle = COLORS.markerStart;
    ctx.beginPath();
    ctx.arc(arc.x1, arc.y1, markerRadius, 0, TWO_PI);
    ctx.fill();

    // End point (red)
    ctx.fillStyle = COLORS.markerEnd;
    ctx.beginPath();
    ctx.arc(arc.x2, arc.y2, markerRadius, 0, TWO_PI);
    ctx.fill();

    // Aux point (cyan - larger for visibility)
    // Use through point if available (from 3-point creation), otherwise use midpoint
    const auxPoint = arc._throughPoint || arc.midpoint;
    if (auxPoint) {
      // Draw a larger cyan marker for the aux point
      ctx.fillStyle = '#00ffff';  // Cyan
      ctx.beginPath();
      ctx.arc(auxPoint.x, auxPoint.y, markerRadius * 1.5, 0, TWO_PI);
      ctx.fill();
      // Add a cross for better visibility
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(auxPoint.x - markerRadius * 2, auxPoint.y);
      ctx.lineTo(auxPoint.x + markerRadius * 2, auxPoint.y);
      ctx.moveTo(auxPoint.x, auxPoint.y - markerRadius * 2);
      ctx.lineTo(auxPoint.x, auxPoint.y + markerRadius * 2);
      ctx.stroke();
    }
  }

  /**
   * Draw circle
   */
  drawCircle(ctx, circle) {
    ctx.beginPath();
    const r = circle.radius ?? circle.r;
    const cx = circle.cx ?? circle.center?.x;
    const cy = circle.cy ?? circle.center?.y;
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.stroke();
  }

  /**
   * Draw rectangle
   */
  drawRectangle(ctx, rect) {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.stroke();
  }

  /**
   * Draw polygon/polyline
   */
  drawPolygon(ctx, poly) {
    if (!poly.points || poly.points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);

    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x, poly.points[i].y);
    }

    if (poly.closed || poly.type === 'polygon') {
      ctx.closePath();
    }

    ctx.stroke();
  }

  /**
   * Draw preview shape
   */
  drawPreview(ctx, preview, scale) {
    if (!preview) return;

    ctx.save();
    ctx.strokeStyle = COLORS.primitivePreview;
    ctx.lineWidth = this.renderer.lineWidth / scale;
    ctx.setLineDash([5 / scale, 3 / scale]);

    if (preview.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(preview.x1, preview.y1);
      ctx.lineTo(preview.x2, preview.y2);
      ctx.stroke();
    } else if (preview.type === 'arc' && preview.arc) {
      this.drawArc(ctx, preview.arc, scale);
    } else if (preview.type === 'circle') {
      ctx.beginPath();
      ctx.arc(preview.cx, preview.cy, preview.r, 0, TWO_PI);
      ctx.stroke();
    } else if (preview.type === 'rectangle') {
      ctx.beginPath();
      ctx.rect(preview.x, preview.y, preview.width, preview.height);
      ctx.stroke();
    } else if (preview.type === 'polygon' && preview.points) {
      if (preview.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(preview.points[0].x, preview.points[0].y);
        for (let i = 1; i < preview.points.length; i++) {
          ctx.lineTo(preview.points[i].x, preview.points[i].y);
        }
        ctx.stroke();
      }
    } else if (preview.type === 'dimension') {
      this.drawDimension(ctx, preview, scale);
    }

    ctx.restore();
  }

  /**
   * Draw selection highlight for a specific primitive
   */
  drawSelection(ctx, primitive, scale) {
    if (!primitive) return;

    ctx.save();
    ctx.strokeStyle = COLORS.primitiveSelected;
    ctx.lineWidth = (this.renderer.lineWidth + 2) / scale;
    ctx.setLineDash([]);

    this.drawPrimitive(ctx, primitive, scale);
    ctx.restore();
  }

  /**
   * Draw hover highlight for a specific primitive
   */
  drawHovered(ctx, primitive, scale) {
    if (!primitive) return;

    ctx.save();
    ctx.strokeStyle = COLORS.primitiveHovered;
    ctx.lineWidth = (this.renderer.lineWidth + 2) / scale;  // Thicker line when hovered
    ctx.setLineDash([]);

    this.drawPrimitive(ctx, primitive, scale);
    ctx.restore();
  }

  /**
   * Draw highlighted primitive from PLC command selection
   */
  drawHighlightedPrimitive(primitive) {
    if (!primitive) return;

    this.renderer.withViewContext((ctx, scale) => {
      ctx.save();
      // Bright magenta/pink for PLC highlight
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3 / scale;
      ctx.setLineDash([]);

      if (primitive.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(primitive.x1, primitive.y1);
        ctx.lineTo(primitive.x2, primitive.y2);
        ctx.stroke();

        // Draw start/end markers
        const markerSize = 6 / scale;
        ctx.fillStyle = '#00ff00'; // Green for start
        ctx.beginPath();
        ctx.arc(primitive.x1, primitive.y1, markerSize, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ff0000'; // Red for end
        ctx.beginPath();
        ctx.arc(primitive.x2, primitive.y2, markerSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (primitive.type === 'arc') {
        // SINGLE SOURCE OF TRUTH: Always use getRenderData()
        const render = primitive.getRenderData();

        ctx.beginPath();
        ctx.arc(render.cx, render.cy, render.r, render.startAngle, render.endAngle, render.anticlockwise);
        ctx.stroke();

        // Draw start/end markers
        const markerSize = 6 / scale;
        if (primitive.x1 !== undefined) {
          ctx.fillStyle = '#00ff00';
          ctx.beginPath();
          ctx.arc(primitive.x1, primitive.y1, markerSize, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(primitive.x2, primitive.y2, markerSize, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (primitive.type === 'circle') {
        const cx = primitive.cx ?? primitive.center?.x;
        const cy = primitive.cy ?? primitive.center?.y;
        const r = primitive.r ?? primitive.radius;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Draw center marker
        const markerSize = 6 / scale;
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(cx, cy, markerSize, 0, Math.PI * 2);
        ctx.fill();
      } else if (primitive.type === 'rectangle') {
        ctx.beginPath();
        ctx.rect(primitive.x, primitive.y, primitive.width, primitive.height);
        ctx.stroke();

        // Draw corner markers
        const markerSize = 4 / scale;
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(primitive.x - markerSize, primitive.y - markerSize, markerSize * 2, markerSize * 2);
        ctx.fillRect(primitive.x + primitive.width - markerSize, primitive.y - markerSize, markerSize * 2, markerSize * 2);
        ctx.fillRect(primitive.x + primitive.width - markerSize, primitive.y + primitive.height - markerSize, markerSize * 2, markerSize * 2);
        ctx.fillRect(primitive.x - markerSize, primitive.y + primitive.height - markerSize, markerSize * 2, markerSize * 2);

      } else if (primitive.type === 'polygon' || primitive.type === 'polyline') {
        if (primitive.points && primitive.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(primitive.points[0].x, primitive.points[0].y);
          for (let i = 1; i < primitive.points.length; i++) {
            ctx.lineTo(primitive.points[i].x, primitive.points[i].y);
          }
          if (primitive.closed || primitive.type === 'polygon') {
            ctx.closePath();
          }
          ctx.stroke();

          // Draw vertex markers
          const markerSize = 4 / scale;
          ctx.fillStyle = '#00ff00';
          for (const pt of primitive.points) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, markerSize, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      ctx.restore();
    });
  }
  /**
   * Draw dimension
   */
  drawDimension(ctx, dim, scale) {
    if (!dim) return;

    // Calculate geometry in World Space
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
    ctx.moveTo(dim.x1, dim.y1);
    ctx.lineTo(d1x + (px > 0 ? px * 0.1 : px * 0.1), d1y + (py > 0 ? py * 0.1 : py * 0.1)); // Simplified extension

    // Better extension lines: from origin to offset point + small overshoot
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

    // Text
    const text = dim.text || length.toFixed(2);
    const midX = (d1x + d2x) / 2;
    const midY = (d1y + d2y) / 2;

    // Create text offset (slightly above line)
    const textGap = 5 / scale;
    const tx = midX + uPx * textGap;
    const ty = midY + uPy * textGap;

    ctx.save();
    ctx.translate(tx, ty);

    // Ensure text is readable
    let textAngle = angle;
    if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
      textAngle += Math.PI;
    }
    ctx.rotate(textAngle);

    // Inverse scale font size
    ctx.font = `${12 / scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = ctx.strokeStyle; // Use same color as line
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  drawArrow(ctx, x, y, angle, scale) {
    const size = 10 / scale; // 10px visual size
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

export default PrimitiveRenderer;
