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
  drawPrimitives(ctx, scale, primitives, selectedPrimitives = new Set()) {
    const lineWidth = this.renderer.lineWidth / scale;
    const selectedLineWidth = lineWidth * 1.5;

    if (!primitives || primitives.length === 0) return;
    // Debug large datasets
    if (primitives.length > 500) {
      // console.log(`Drawing ${primitives.length} primitives`);
    }

    // Batch all non-selected lines together
    ctx.save();
    ctx.strokeStyle = COLORS.primitive;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const deferredSelected = [];
    const deferredArcs = [];
    const deferredCircles = [];
    const deferredPolygons = [];

    for (const prim of primitives) {
      if (!prim) continue; // Skip nulls

      // Check visibility if property exists (default to true)
      if (prim.visible === false) continue;

      if (selectedPrimitives.has(prim)) {
        deferredSelected.push(prim);
        continue;
      }

      // Batch lines directly into path
      if (prim.type === 'line') {
        ctx.moveTo(prim.x1, prim.y1);
        ctx.lineTo(prim.x2, prim.y2);
      } else if (prim.type === 'arc') {
        deferredArcs.push(prim);
      } else if (prim.type === 'circle') {
        deferredCircles.push(prim);
      } else if (prim.type === 'polygon' || prim.type === 'polyline') {
        deferredPolygons.push(prim);
      }
    }

    // Stroke all batched lines at once
    ctx.stroke();

    // Batch Arcs
    if (deferredArcs.length > 0) {
      ctx.beginPath();
      for (const arc of deferredArcs) {
        const render = typeof arc.getRenderData === 'function' ? arc.getRenderData() : null;
        if (!render || !render.r) continue;

        // Calculate start point to move to (prevents connecting lines)
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

        // Move to start of circle (angle 0)
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

    ctx.restore();

    // Draw selected primitives with different style
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
      }

      ctx.restore();
    });
  }
}

export default PrimitiveRenderer;
