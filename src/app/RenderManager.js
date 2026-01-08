/**
 * Render Manager - Handles renderer state and render adapters
 */

export class RenderManager {
  constructor(app) {
    this.app = app;
  }

  /**
   * Render the canvas
   */
  render() {
    // Update renderer state
    this.app.renderer.grid.show = this.app.showGrid;
    this.app.renderer.grid.spacing = this.app.gridSpacing;

    // Update floating toolbar visibility based on selection
    if (this.app.ui) {
      this.app.ui.updateFloatingToolbar();
    }

    // Convert primitives to renderer format
    this.app.renderer.primitives = this.app.primitives.map(p => this.toRenderFormat(p));

    // Set preview
    if (this.app.currentTool && this.app.currentTool.getPreview) {
      const preview = this.app.currentTool.getPreview();
      this.app.renderer.preview = preview ? this.previewToRenderFormat(preview) : null;
    } else {
      this.app.renderer.preview = null;
    }

    // Render
    this.app.renderer.render();

    // Draw highlighted primitive from PLC command (if not already in main primitives)
    if (this.app.highlightedPrimitive) {
      this.app.renderer.drawHighlightedPrimitive(this.app.highlightedPrimitive);
    }

    // Draw snap indicator with CAD-style icon
    const snapResult = this.app.snapManager.lastSnapResult;
    if (snapResult && snapResult.isValid && snapResult.point) {
      this.app.renderer.drawSnapIndicator(
        { x: snapResult.point.x, y: snapResult.point.y },
        snapResult.type
      );
    }
  }

  /**
   * Highlight a primitive from PLC command
   */
  highlightPrimitive(primitive) {
    this.app.highlightedPrimitive = primitive;
    this.render();
  }

  /**
   * Clear primitive highlight
   */
  clearHighlight() {
    this.app.highlightedPrimitive = null;
    // Also clear selection in output grid
    const grid = document.getElementById('outputGrid');
    if (grid) {
      grid.querySelectorAll('.cad-output-item.selected').forEach(el => el.classList.remove('selected'));
    }
    this.render();
  }

  /**
   * Convert primitive to renderer format
   */
  toRenderFormat(p) {
    const isHighlighted = this.app.highlightedPrimitive === p ||
      (this.app.highlightedPrimitive &&
        this.app.highlightedPrimitive.x1 === p.x1 &&
        this.app.highlightedPrimitive.y1 === p.y1 &&
        this.app.highlightedPrimitive.x2 === p.x2 &&
        this.app.highlightedPrimitive.y2 === p.y2);
    const base = { visible: true, type: p.type, selected: this.app.selectedPrimitives.has(p), highlighted: isHighlighted };

    switch (p.type) {
      case 'line':
        // Line class uses a and b for endpoints, with x1/y1/x2/y2 getters
        return { ...base, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
      case 'arc':
        // Arc class uses c for center, a for start, b for end
        return {
          ...base,
          cx: p.cx, cy: p.cy, r: p.radius,
          x1: p.x1, y1: p.y1,
          x2: p.x2, y2: p.y2,
          startAngle: p.startAngle, endAngle: p.endAngle,
          isClockwise: p.isClockwise,
          midpoint: p.midpoint,
          _throughPoint: p._throughPoint,
          getRenderData: () => p.getRenderData()  // Delegate to Arc class (single source of truth)
        };
      case 'circle':
        return { ...base, cx: p.center.x, cy: p.center.y, radius: p.radius };
      case 'rectangle':
        // Rectangle class has x, y, width, height directly
        return { ...base, x: p.x, y: p.y, width: p.width, height: p.height };
      case 'polygon':
        // Polygon class uses points, not vertices
        return { ...base, points: p.points, closed: p.closed };
      default:
        return base;
    }
  }

  /**
   * Convert preview to renderer format
   * Preview comes from tools and uses different format than primitives
   */
  previewToRenderFormat(preview) {
    if (!preview) return null;

    switch (preview.type) {
      case 'line':
        // LineTool provides: { type: 'line', x1, y1, x2, y2 }
        return { type: 'line', x1: preview.x1, y1: preview.y1, x2: preview.x2, y2: preview.y2 };
      case 'arc':
        if (preview.arc) {
          // Arc from ArcTool - use Arc class properties
          const arc = preview.arc;
          return {
            type: 'arc',
            arc: {
              cx: arc.cx, cy: arc.cy, r: arc.radius,
              x1: arc.x1, y1: arc.y1,
              x2: arc.x2, y2: arc.y2,
              startAngle: arc.startAngle, endAngle: arc.endAngle,
              isClockwise: arc.isClockwise,
              getRenderData: () => ({
                cx: arc.cx, cy: arc.cy, r: arc.radius,
                startAngle: arc.startAngle, endAngle: arc.endAngle,
                anticlockwise: !arc.isClockwise
              })
            }
          };
        }
        return preview;
      case 'circle':
        // CircleTool provides: { type: 'circle', cx, cy, r }
        return { type: 'circle', cx: preview.cx, cy: preview.cy, r: preview.r };
      case 'rectangle':
        // RectangleTool provides: { type: 'rectangle', x, y, width, height }
        return { type: 'rectangle', x: preview.x, y: preview.y, width: preview.width, height: preview.height };
      case 'polygon':
        // PolygonTool provides: { type: 'polygon', points, closed }
        return { type: 'polygon', points: preview.points };
      default:
        return preview;
    }
  }
}

export default RenderManager;
