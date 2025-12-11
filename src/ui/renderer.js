/**
 * Canvas Renderer - CAD-style rendering engine
 * Handles all drawing operations with professional visuals
 */

import { TWO_PI } from '../geometry/core.js';

/**
 * CAD Color Scheme
 */
export const COLORS = {
  // Background
  background: '#0a0d14',
  workspaceBackground: 'rgba(15, 20, 30, 0.95)',

  // Grid - increased visibility
  gridMinor: 'rgba(60, 80, 120, 0.3)',
  gridMajor: 'rgba(80, 120, 180, 0.5)',
  gridOrigin: 'rgba(120, 150, 200, 0.6)',

  // Primitives - bright white/cyan for contrast against blue grid
  primitive: '#ffffff',
  primitiveSelected: '#00ffff',
  primitiveHovered: '#ffff00',
  primitivePreview: 'rgba(255, 255, 255, 0.6)',

  // Snap
  snapPoint: '#4caf50',
  snapHighlight: '#8bc34a',

  // UI
  crosshair: 'rgba(255, 255, 255, 0.6)',
  cursor: '#ffffff',

  // Status
  error: '#ef5350',
  warning: '#ffb74d',
  success: '#66bb6a',

  // Markers
  markerStart: '#4caf50',
  markerEnd: '#f44336',
  markerCenter: '#2196f3',
  markerMidpoint: '#ff9800'
};

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
        this.drawGrid(ctx, scale);
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
      this.drawPrimitives(ctx, scale);

      // Draw preview
      if (this.preview) {
        this.drawPreview(ctx, scale);
      }

      // Draw selection
      if (this.selection) {
        this.drawSelection(ctx, scale);
      }

      // Draw hovered
      if (this.hovered && this.hovered !== this.selection) {
        this.drawHovered(ctx, scale);
      }

      // Draw simulation overlay
      if (this.simulation && this.simulation.running) {
        this.drawSimulation(ctx, scale);
      }

      ctx.restore();
    });
  }

  /**
   * Draw grid
   */
  drawGrid(ctx, scale) {
    const spacing = this.grid.spacing;
    const majorSpacing = spacing * this.grid.majorEvery;
    const lineWidth = 1 / scale;

    // Minor grid lines
    ctx.strokeStyle = COLORS.gridMinor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    for (let x = 0; x <= this.workspace.width; x += spacing) {
      if (x % majorSpacing !== 0) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.workspace.height);
      }
    }
    for (let y = 0; y <= this.workspace.height; y += spacing) {
      if (y % majorSpacing !== 0) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.workspace.width, y);
      }
    }
    ctx.stroke();

    // Major grid lines
    ctx.strokeStyle = COLORS.gridMajor;
    ctx.lineWidth = lineWidth * 1.5;
    ctx.beginPath();

    for (let x = 0; x <= this.workspace.width; x += majorSpacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.workspace.height);
    }
    for (let y = 0; y <= this.workspace.height; y += majorSpacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.workspace.width, y);
    }
    ctx.stroke();

    // Origin crosshair
    ctx.strokeStyle = COLORS.gridOrigin;
    ctx.lineWidth = lineWidth * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.min(50, this.workspace.width), 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, Math.min(50, this.workspace.height));
    ctx.stroke();
  }

  /**
   * Draw all primitives
   */
  drawPrimitives(ctx, scale) {
    const lineWidth = this.lineWidth / scale;

    for (const prim of this.primitives) {
      if (!prim.visible) continue;

      ctx.save();
      // Use selected color for selected primitives
      ctx.strokeStyle = prim.selected ? COLORS.primitiveSelected : COLORS.primitive;
      ctx.lineWidth = prim.selected ? lineWidth * 1.5 : lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      this.drawPrimitive(ctx, prim, scale);
      ctx.restore();
    }
  }

  /**
   * Draw a single primitive
   */
  drawPrimitive(ctx, prim, scale) {
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
    const render = arc.getRenderData ? arc.getRenderData() : {
      cx: arc.cx,
      cy: arc.cy,
      r: arc.radius || arc.r,
      startAngle: arc.startAngle,
      endAngle: arc.endAngle,
      anticlockwise: !arc.isClockwise  // Canvas anticlockwise = true when NOT clockwise
    };

    ctx.beginPath();
    ctx.arc(render.cx, render.cy, render.r, render.startAngle, render.endAngle, render.anticlockwise);
    ctx.stroke();

    // Draw arc markers
    this.drawArcMarkers(ctx, arc, scale);
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
    ctx.arc(circle.cx, circle.cy, circle.radius, 0, TWO_PI);
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
  drawPreview(ctx, scale) {
    ctx.save();
    ctx.strokeStyle = COLORS.primitivePreview;
    ctx.lineWidth = this.lineWidth / scale;
    ctx.setLineDash([5 / scale, 3 / scale]);

    const preview = this.preview;

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
   * Draw selection highlight
   */
  drawSelection(ctx, scale) {
    ctx.save();
    ctx.strokeStyle = COLORS.primitiveSelected;
    ctx.lineWidth = (this.lineWidth + 2) / scale;
    ctx.setLineDash([]);

    this.drawPrimitive(ctx, this.selection, scale);
    ctx.restore();
  }

  /**
   * Draw hover highlight
   */
  drawHovered(ctx, scale) {
    ctx.save();
    ctx.strokeStyle = COLORS.primitiveHovered;
    ctx.lineWidth = (this.lineWidth + 2) / scale;  // Thicker line when hovered
    ctx.setLineDash([]);

    this.drawPrimitive(ctx, this.hovered, scale);
    ctx.restore();
  }

  /**
   * Draw highlighted primitive from PLC command selection
   */
  drawHighlightedPrimitive(primitive) {
    if (!primitive) return;

    this.withViewContext((ctx, scale) => {
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
        // Build render data with proper fallback like drawArc does
        const render = primitive.getRenderData ? primitive.getRenderData() : {
          cx: primitive.cx,
          cy: primitive.cy,
          r: primitive.radius || primitive.r,
          startAngle: primitive.startAngle,
          endAngle: primitive.endAngle,
          anticlockwise: !primitive.isClockwise
        };

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

  /**
   * Initialize simulation state
   */
  initSimulation() {
    this.simulation = {
      running: false,
      paused: false,
      commands: [],
      currentIndex: 0,
      progress: 0,  // 0-1 progress within current command
      toolPosition: { x: 0, y: 0 },
      toolDown: false,
      speed: 200,  // pixels per second
      trail: [],   // path already drawn
      animationId: null,
      lastTime: 0,
      onComplete: null,
      onUpdate: null
    };
  }

  /**
   * Start path simulation
   * @param {Array} commands - PLC commands from PLCOutputGenerator
   * @param {Object} options - speed, onComplete callback, etc.
   */
  startSimulation(commands, options = {}) {
    if (!this.simulation) this.initSimulation();

    // Stop any running simulation
    this.stopSimulation();

    this.simulation.commands = commands;
    this.simulation.currentIndex = 0;
    this.simulation.progress = 0;
    this.simulation.toolPosition = { x: 0, y: 0 };
    this.simulation.toolDown = false;
    this.simulation.trail = [];
    this.simulation.running = true;
    this.simulation.paused = false;
    this.simulation.speed = options.speed || 200;
    this.simulation.onComplete = options.onComplete;
    this.simulation.onUpdate = options.onUpdate;
    this.simulation.lastTime = performance.now();

    this.simulationLoop();
  }

  /**
   * Main simulation loop
   */
  simulationLoop() {
    if (!this.simulation.running) return;

    const now = performance.now();
    const deltaTime = (now - this.simulation.lastTime) / 1000;
    this.simulation.lastTime = now;

    if (!this.simulation.paused) {
      this.updateSimulation(deltaTime);
    }

    this.render();
    this.simulation.animationId = requestAnimationFrame(() => this.simulationLoop());
  }

  /**
   * Update simulation state
   */
  updateSimulation(deltaTime) {
    const sim = this.simulation;
    if (sim.currentIndex >= sim.commands.length) {
      this.stopSimulation();
      if (sim.onComplete) sim.onComplete();
      return;
    }

    const cmd = sim.commands[sim.currentIndex];
    const moveDistance = sim.speed * deltaTime;

    // Handle different command types
    if (cmd.type === 'Z_up') {
      sim.toolDown = false;
      sim.currentIndex++;
      sim.progress = 0;
    } else if (cmd.type === 'Z_down') {
      sim.toolDown = true;
      sim.currentIndex++;
      sim.progress = 0;
    } else if (cmd.type === 'waypoint' || cmd.type === 'line' || cmd.type === 'arc') {
      // Parse target position from command
      const target = this.parseCommandTarget(cmd);
      if (!target) {
        sim.currentIndex++;
        sim.progress = 0;
        return;
      }

      // Calculate path
      if (cmd.type === 'arc' && target.auxX !== undefined) {
        // Arc movement - interpolate along arc
        this.updateArcMovement(sim, target, moveDistance);
      } else {
        // Linear movement
        this.updateLinearMovement(sim, target, moveDistance);
      }
    } else {
      // Unknown command, skip
      sim.currentIndex++;
      sim.progress = 0;
    }

    if (sim.onUpdate) {
      sim.onUpdate({
        index: sim.currentIndex,
        total: sim.commands.length,
        position: { ...sim.toolPosition },
        toolDown: sim.toolDown
      });
    }
  }

  /**
   * Update linear movement
   */
  updateLinearMovement(sim, target, moveDistance) {
    // Store start position on first frame of this movement
    if (!sim.lineStart) {
      sim.lineStart = { x: sim.toolPosition.x, y: sim.toolPosition.y };
      sim.lineLength = null;
    }

    const startX = sim.lineStart.x;
    const startY = sim.lineStart.y;
    const dx = target.x - startX;
    const dy = target.y - startY;

    // Calculate total distance once and cache it
    if (!sim.lineLength) {
      sim.lineLength = Math.sqrt(dx * dx + dy * dy);
    }

    const totalDist = sim.lineLength;

    if (totalDist < 0.1) {
      // Arrived at target
      sim.toolPosition.x = target.x;
      sim.toolPosition.y = target.y;
      sim.currentIndex++;
      sim.progress = 0;
      sim.lineStart = null;
      sim.lineLength = null;
      return;
    }

    const step = Math.min(moveDistance / totalDist, 1 - sim.progress);
    const oldPos = { ...sim.toolPosition };

    sim.progress += step;

    // Interpolate from stored start position
    sim.toolPosition.x = startX + dx * sim.progress;
    sim.toolPosition.y = startY + dy * sim.progress;

    // Add to trail if tool is down
    if (sim.toolDown) {
      sim.trail.push({
        type: 'line',
        x1: oldPos.x,
        y1: oldPos.y,
        x2: sim.toolPosition.x,
        y2: sim.toolPosition.y
      });
    }

    if (sim.progress >= 1) {
      sim.toolPosition.x = target.x;
      sim.toolPosition.y = target.y;
      sim.currentIndex++;
      sim.progress = 0;
      sim.lineStart = null;
      sim.lineLength = null;
    }
  }

  /**
   * Update arc movement
   */
  updateArcMovement(sim, target, moveDistance) {
    // For arc, we need start, end, and aux point
    // Use arcStart stored when arc command begins, not current position
    if (!sim.arcStart) {
      // First frame of this arc - store the starting position
      sim.arcStart = { x: sim.toolPosition.x, y: sim.toolPosition.y };
      sim.arcData = null;  // Will be calculated below
    }

    const startX = sim.arcStart.x;
    const startY = sim.arcStart.y;
    const endX = target.x;
    const endY = target.y;
    const auxX = target.auxX;
    const auxY = target.auxY;

    // Calculate arc data once and cache it
    if (!sim.arcData) {
      const circle = this.circleFromThreePoints(
        { x: startX, y: startY },
        { x: auxX, y: auxY },
        { x: endX, y: endY }
      );

      if (!circle) {
        // Fallback to linear
        sim.arcStart = null;
        this.updateLinearMovement(sim, target, moveDistance);
        return;
      }

      const startAngle = Math.atan2(startY - circle.cy, startX - circle.cx);
      const auxAngle = Math.atan2(auxY - circle.cy, auxX - circle.cx);
      const endAngle = Math.atan2(endY - circle.cy, endX - circle.cx);
      const sweepAngle = this.calculateSweepThroughPoint(startAngle, auxAngle, endAngle);

      sim.arcData = {
        circle,
        startAngle,
        sweepAngle,
        arcLength: Math.abs(sweepAngle) * circle.r
      };
    }

    const { circle, startAngle, sweepAngle, arcLength } = sim.arcData;

    if (arcLength < 0.1) {
      sim.toolPosition.x = endX;
      sim.toolPosition.y = endY;
      sim.currentIndex++;
      sim.progress = 0;
      sim.arcStart = null;
      sim.arcData = null;
      return;
    }

    const step = Math.min(moveDistance / arcLength, 1 - sim.progress);
    const oldPos = { ...sim.toolPosition };

    sim.progress += step;
    const currentAngle = startAngle + sweepAngle * sim.progress;
    sim.toolPosition.x = circle.cx + circle.r * Math.cos(currentAngle);
    sim.toolPosition.y = circle.cy + circle.r * Math.sin(currentAngle);

    // Add to trail if tool is down
    if (sim.toolDown) {
      sim.trail.push({
        type: 'line',
        x1: oldPos.x,
        y1: oldPos.y,
        x2: sim.toolPosition.x,
        y2: sim.toolPosition.y
      });
    }

    if (sim.progress >= 1) {
      sim.toolPosition.x = endX;
      sim.toolPosition.y = endY;
      sim.currentIndex++;
      sim.progress = 0;
      sim.arcStart = null;
      sim.arcData = null;
    }
  }

  /**
   * Calculate sweep angle that passes through aux point
   */
  calculateSweepThroughPoint(startAngle, auxAngle, endAngle) {
    // Normalize angles relative to start
    let auxRel = auxAngle - startAngle;
    let endRel = endAngle - startAngle;

    while (auxRel < 0) auxRel += Math.PI * 2;
    while (auxRel >= Math.PI * 2) auxRel -= Math.PI * 2;
    while (endRel < 0) endRel += Math.PI * 2;
    while (endRel >= Math.PI * 2) endRel -= Math.PI * 2;

    // If aux comes before end in CCW direction, go CCW
    if (auxRel < endRel) {
      return endRel;
    } else {
      // Go CW (negative direction)
      return endRel - Math.PI * 2;
    }
  }

  /**
   * Calculate circle from 3 points
   */
  circleFromThreePoints(p1, p2, p3) {
    const ax = p1.x, ay = p1.y;
    const bx = p2.x, by = p2.y;
    const cx = p3.x, cy = p3.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 0.0001) return null;

    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);

    return { cx: ux, cy: uy, r };
  }

  /**
   * Parse command to get target position
   */
  parseCommandTarget(cmd) {
    const match = cmd.command.match(/X\s*([\d.-]+),?\s*Y\s*([\d.-]+)/);
    if (!match) return null;

    const result = {
      x: parseFloat(match[1]),
      y: parseFloat(match[2])
    };

    // Check for aux point (I, J) for arcs
    const auxMatch = cmd.command.match(/I\s*([\d.-]+),?\s*J\s*([\d.-]+)/);
    if (auxMatch) {
      result.auxX = parseFloat(auxMatch[1]);
      result.auxY = parseFloat(auxMatch[2]);
    }

    return result;
  }

  /**
   * Stop simulation
   */
  stopSimulation() {
    if (this.simulation) {
      this.simulation.running = false;
      if (this.simulation.animationId) {
        cancelAnimationFrame(this.simulation.animationId);
        this.simulation.animationId = null;
      }
    }
    this.render();
  }

  /**
   * Pause/resume simulation
   */
  togglePauseSimulation() {
    if (this.simulation) {
      this.simulation.paused = !this.simulation.paused;
      if (!this.simulation.paused) {
        this.simulation.lastTime = performance.now();
      }
    }
  }

  /**
   * Set simulation speed
   */
  setSimulationSpeed(speed) {
    if (this.simulation) {
      this.simulation.speed = speed;
    }
  }

  /**
   * Draw simulation overlay
   */
  drawSimulation(ctx, scale) {
    if (!this.simulation || !this.simulation.running) return;

    const sim = this.simulation;

    // Draw completed trail (green)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2 / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const segment of sim.trail) {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    }

    // Draw rapid moves (dashed yellow)
    // (Already visible through the trail when tool is up - we skip those)

    // Draw tool position
    const toolSize = 8 / scale;
    ctx.fillStyle = sim.toolDown ? '#ff0000' : '#ffff00';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / scale;

    ctx.beginPath();
    ctx.arc(sim.toolPosition.x, sim.toolPosition.y, toolSize, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    // Draw tool direction indicator
    if (sim.toolDown) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(sim.toolPosition.x, sim.toolPosition.y, toolSize / 2, 0, TWO_PI);
      ctx.fill();
    }
  }
}

export default CanvasRenderer;
