/**
 * Canvas Renderer - CAD-style rendering engine
 * Handles all drawing operations with professional visuals
 */

import { TWO_PI } from '../geometry/core.js';
import { COLORS } from './renderer/colors.js';
import { drawGrid } from './renderer/grid.js';
import { PrimitiveRenderer } from './renderer/primitives.js';
import { SimulationManager } from './renderer/simulation.js';

export { COLORS };

/**
 * Canvas Renderer Class
 */
export class CanvasRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Configuration
    this.dpr = window.devicePixelRatio || 1;
    this.dpi = options.dpi || 96;

    // View state
    this.view = {
      zoom: 1,
      panX: 0,
      panY: 0,
      scaleFactor: 1
    };

    // Workspace
    this.workspace = {
      width: options.width || 600,
      height: options.height || 600
    };

    // Grid
    this.grid = {
      show: true,
      spacing: 10,
      majorEvery: 5,
      snapToGrid: false
    };

    // Drawing state
    this.primitives = [];
    this.preview = null;
    this.selection = null;
    this.hovered = null;

    // Styling
    this.lineWidth = 1;

    // Rendering helpers
    this.primitiveRenderer = new PrimitiveRenderer(this);
    this.simulationManager = new SimulationManager(this);

    this.initialize();
  }

  initialize() {
    // Wait for layout to be calculated
    requestAnimationFrame(() => {
      this.resizeCanvas();
    });
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    let width = rect.width || this.canvas.clientWidth;
    let height = rect.height || this.canvas.clientHeight;

    // Fallback if container has no size yet
    if (width < 10) width = 800;
    if (height < 10) height = 600;

    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);

    // Calculate scale to fit workspace
    const scaleX = width / this.workspace.width;
    const scaleY = height / this.workspace.height;
    this.view.scaleFactor = Math.min(scaleX, scaleY) * 0.9;

    // Center the workspace
    this.view.panX = (width - this.workspace.width * this.view.scaleFactor) / 2;
    this.view.panY = (height - this.workspace.height * this.view.scaleFactor) / 2;

    this.render();
  }

  /**
   * Get effective scale
   */
  getEffectiveScale() {
    return this.view.scaleFactor * this.dpr * this.view.zoom;
  }

  /**
   * Transform model coordinates to screen coordinates
   */
  modelToScreen(point) {
    const scale = this.view.scaleFactor * this.view.zoom;
    return {
      x: point.x * scale + this.view.panX,
      y: point.y * scale + this.view.panY
    };
  }

  /**
   * Transform screen coordinates to model coordinates
   */
  screenToModel(point) {
    const scale = this.view.scaleFactor * this.view.zoom;
    return {
      x: (point.x - this.view.panX) / scale,
      y: (point.y - this.view.panY) / scale
    };
  }

  /**
   * Apply view transformation to context
   */
  applyViewTransform() {
    const scale = this.getEffectiveScale();
    this.ctx.setTransform(
      scale, 0, 0, scale,
      this.view.panX * this.dpr,
      this.view.panY * this.dpr
    );
    return scale;
  }

  /**
   * Execute drawing function with view transform
   */
  withViewContext(drawFn) {
    this.ctx.save();
    const scale = this.applyViewTransform();
    try {
      drawFn(this.ctx, scale);
    } finally {
      this.ctx.restore();
    }
  }

  /**
   * Main render function
   */
  render() {
    this.clear();
    this.drawBackground();
    this.drawWorkspace();
  }

  /**
   * Clear canvas
   */
  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = COLORS.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  /**
   * Draw workspace background and grid
   */
  drawBackground() {
    this.withViewContext((ctx, scale) => {
      // Workspace background
      ctx.fillStyle = COLORS.workspaceBackground;
      ctx.fillRect(0, 0, this.workspace.width, this.workspace.height);

      // Grid
      if (this.grid.show) {
        drawGrid(ctx, scale, this.workspace, this.grid);
      }

      // Workspace border
      ctx.strokeStyle = 'rgba(100, 150, 255, 0.4)';
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(0, 0, this.workspace.width, this.workspace.height);
    });
  }

  /**
   * Draw workspace with primitives
   */
  drawWorkspace() {
    this.withViewContext((ctx, scale) => {
      // Clip to workspace
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.workspace.width, this.workspace.height);
      ctx.clip();

      // Draw primitives
      this.primitiveRenderer.drawPrimitives(ctx, scale);

      // Draw preview
      if (this.preview) {
        this.primitiveRenderer.drawPreview(ctx, scale);
      }

      // Draw selection
      if (this.selection) {
        this.primitiveRenderer.drawSelection(ctx, scale);
      }

      // Draw hovered
      if (this.hovered && this.hovered !== this.selection) {
        this.primitiveRenderer.drawHovered(ctx, scale);
      }

      // Draw simulation overlay
      if (this.simulation && this.simulation.running) {
        this.simulationManager.draw(ctx, scale);
      }

      ctx.restore();
    });
  }

  /**
   * Draw highlighted primitive from PLC command selection
   */
  drawHighlightedPrimitive(primitive) {
    this.primitiveRenderer.drawHighlightedPrimitive(primitive);
  }

  /**
   * Draw snap indicator with CAD-style icons
   */
  drawSnapIndicator(point, type = 'default') {
    this.withViewContext((ctx, scale) => {
      const size = 8 / scale;
      const halfSize = size / 2;

      // Bright yellow/green color for visibility
      ctx.strokeStyle = '#00ff00';
      ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.lineWidth = 2 / scale;

      ctx.beginPath();

      switch (type) {
        case 'endpoint':
          // Square marker for endpoint
          ctx.rect(point.x - halfSize, point.y - halfSize, size, size);
          ctx.fill();
          ctx.stroke();
          break;

        case 'midpoint':
          // Triangle marker for midpoint
          ctx.moveTo(point.x, point.y - size);
          ctx.lineTo(point.x + size * 0.866, point.y + halfSize);
          ctx.lineTo(point.x - size * 0.866, point.y + halfSize);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;

        case 'center':
          // Circle with crosshair for center
          ctx.arc(point.x, point.y, size, 0, TWO_PI);
          ctx.stroke();
          // Draw crosshair
          ctx.beginPath();
          ctx.moveTo(point.x - size * 1.5, point.y);
          ctx.lineTo(point.x + size * 1.5, point.y);
          ctx.moveTo(point.x, point.y - size * 1.5);
          ctx.lineTo(point.x, point.y + size * 1.5);
          ctx.stroke();
          break;

        case 'intersection':
          // X marker for intersection
          ctx.moveTo(point.x - size, point.y - size);
          ctx.lineTo(point.x + size, point.y + size);
          ctx.moveTo(point.x + size, point.y - size);
          ctx.lineTo(point.x - size, point.y + size);
          ctx.stroke();
          break;

        case 'quadrant':
          // Diamond for quadrant
          ctx.moveTo(point.x, point.y - size);
          ctx.lineTo(point.x + size, point.y);
          ctx.lineTo(point.x, point.y + size);
          ctx.lineTo(point.x - size, point.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;

        case 'nearest':
          // Hourglass shape for nearest
          ctx.moveTo(point.x - halfSize, point.y - size);
          ctx.lineTo(point.x + halfSize, point.y - size);
          ctx.lineTo(point.x - halfSize, point.y + size);
          ctx.lineTo(point.x + halfSize, point.y + size);
          ctx.closePath();
          ctx.stroke();
          break;

        case 'grid':
          // Plus sign for grid snap
          ctx.moveTo(point.x - size, point.y);
          ctx.lineTo(point.x + size, point.y);
          ctx.moveTo(point.x, point.y - size);
          ctx.lineTo(point.x, point.y + size);
          ctx.stroke();
          // Small circle at center
          ctx.beginPath();
          ctx.arc(point.x, point.y, size / 3, 0, TWO_PI);
          ctx.fill();
          break;

        case 'node':
        case 'vertex':
          // Circle for node/vertex
          ctx.arc(point.x, point.y, halfSize, 0, TWO_PI);
          ctx.fill();
          ctx.stroke();
          break;

        default:
          // Default: small filled circle
          ctx.arc(point.x, point.y, halfSize, 0, TWO_PI);
          ctx.fill();
          ctx.stroke();
      }
    });
  }

  /**
   * Draw crosshair cursor
   */
  drawCrosshair(point) {
    this.withViewContext((ctx, scale) => {
      const size = 15 / scale;

      ctx.strokeStyle = COLORS.crosshair;
      ctx.lineWidth = 1 / scale;

      ctx.beginPath();
      ctx.moveTo(point.x - size, point.y);
      ctx.lineTo(point.x + size, point.y);
      ctx.moveTo(point.x, point.y - size);
      ctx.lineTo(point.x, point.y + size);
      ctx.stroke();
    });
  }

  // View manipulation methods
  setZoom(zoom, centerX, centerY) {
    const oldZoom = this.view.zoom;
    this.view.zoom = Math.max(0.1, Math.min(10, zoom));

    // Adjust pan to zoom towards center point
    if (centerX !== undefined && centerY !== undefined) {
      const scale = this.view.zoom / oldZoom;
      this.view.panX = centerX - (centerX - this.view.panX) * scale;
      this.view.panY = centerY - (centerY - this.view.panY) * scale;
    }

    this.render();
  }

  pan(dx, dy) {
    this.view.panX += dx;
    this.view.panY += dy;
    this.render();
  }

  resetView() {
    this.view.zoom = 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.view.panX = (width - this.workspace.width * this.view.scaleFactor) / 2;
    this.view.panY = (height - this.workspace.height * this.view.scaleFactor) / 2;
    this.render();
  }

  // Data methods
  setPrimitives(primitives) {
    this.primitives = primitives;
    this.render();
  }

  setPreview(preview) {
    this.preview = preview;
    this.render();
  }

  setSelection(primitive) {
    this.selection = primitive;
    this.render();
  }

  setHovered(primitive) {
    this.hovered = primitive;
    this.render();
  }

  setWorkspaceSize(width, height) {
    this.workspace.width = width;
    this.workspace.height = height;
    this.resizeCanvas();
  }

  setGridOptions(options) {
    Object.assign(this.grid, options);
    this.render();
  }

  // ===== PATH SIMULATION =====

  startSimulation(commands, options = {}) {
    this.simulationManager.start(commands, options);
  }

  stopSimulation() {
    this.simulationManager.stop();
  }

  togglePauseSimulation() {
    this.simulationManager.togglePause();
  }

  setSimulationSpeed(speed) {
    this.simulationManager.setSpeed(speed);
  }
}

export default CanvasRenderer;
