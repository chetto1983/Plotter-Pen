/**
 * Sacchi Plotter Pen - CAD Application
 * Main entry point
 */

console.log('=== main.js: starting imports ===');

import { Vector2 } from './geometry/core.js';
import { SnapManager } from './geometry/snap.js';
import { LineTool, ArcTool, CircleTool, RectangleTool, PolygonTool } from './tools/toolManager.js';
import { CanvasRenderer } from './ui/renderer.js';
import { PLCOutputGenerator } from './plc/extraction.js';
import { InputHandler } from './app/InputHandler.js';
import { UIController } from './app/UIController.js';
import { StateManager } from './app/StateManager.js';

console.log('=== main.js: all imports successful ===');

/**
 * Main CAD Application Class
 */
class CADApplication {
  constructor() {
    // Canvas and rendering
    this.canvas = null;
    this.renderer = null;

    // State
    this.primitives = [];
    this.selectedPrimitives = new Set();
    this.hoveredPrimitive = null;
    this.highlightedPrimitive = null;
    this.plcCommands = [];

    // Managers
    this.snapManager = null;
    this.input = null;
    this.ui = null;
    this.state = null;

    // Settings
    this.workspaceWidth = 600;
    this.workspaceHeight = 600;
    this.gridSpacing = 10;
    this.showGrid = true;
    this.snapToGrid = false;
    this.snapToObjects = true;

    // Tool state
    this.currentTool = null;
    this.selectMode = false;
    this.arcMode = '3point';
    this.lastReferencePoint = { x: 0, y: 0 };

    // PLC output
    this.plcOutput = [];

    // Initialize
    this.init();
  }

  /**
   * Initialize the application
   */
  init() {
    // Get canvas element
    this.canvas = document.getElementById('cadCanvas');
    if (!this.canvas) {
      console.error('Canvas element not found');
      return;
    }

    console.log('Canvas found:', this.canvas);
    console.log('Canvas size:', this.canvas.clientWidth, 'x', this.canvas.clientHeight);

    // Initialize renderer
    this.renderer = new CanvasRenderer(this.canvas);
    this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);

    console.log('Renderer initialized, workspace:', this.workspaceWidth, 'x', this.workspaceHeight);

    // Initialize snap manager
    this.snapManager = new SnapManager({
      gridSpacing: this.gridSpacing,
      snapDistance: 10,
      gridEnabled: this.snapToGrid,
      objectSnapEnabled: this.snapToObjects
    });

    // Initialize handlers
    this.input = new InputHandler(this);
    this.ui = new UIController(this);
    this.state = new StateManager(this);

    // Setup
    this.input.setup();
    this.ui.setup();

    // Initial render (wait for layout to be calculated)
    requestAnimationFrame(() => {
      this.render();
      this.ui.updateStatus('Pronto');
    });
  }

  /**
   * Get snapped position for a world coordinate
   */
  getSnappedPosition(worldPos) {
    this.snapManager.setPrimitives(this.primitives);
    // snap() expects a point object, not separate x,y
    const snapResult = this.snapManager.snap(worldPos);

    // Check if snap result has a valid point
    if (snapResult && snapResult.isValid && snapResult.point) {
      this.ui.updateSnapInfo(snapResult.type);
      return new Vector2(snapResult.point.x, snapResult.point.y);
    }

    this.ui.updateSnapInfo(null);
    return worldPos;
  }

  /**
   * Handle tool click (mouse down + up)
   * @param {Object} position - Click position
   * @param {boolean} shiftKey - Whether shift key was held
   */
  handleToolClick(position, shiftKey = false) {
    console.log('=== handleToolClick ===', position, 'tool:', this.currentTool, 'selectMode:', this.selectMode);

    // Clear PLC highlight on any canvas click
    if (this.highlightedPrimitive) {
      this.clearHighlight();
    }

    // Handle selection mode
    if (this.selectMode) {
      this.handleSelection(position, shiftKey);
      return;
    }

    if (!this.currentTool) {
      console.log('No current tool selected');
      return;
    }

    // Tools use onMouseDown/onMouseUp pattern
    console.log('Calling tool onMouseDown/onMouseUp');
    this.currentTool.onMouseDown(position, null);
    this.currentTool.onMouseUp(position, null);

    this.render();
  }

  /**
   * Handle selection at position
   * @param {Object} position - Click position
   * @param {boolean} addToSelection - If true, add to existing selection (Shift+Click)
   */
  handleSelection(position, addToSelection = false) {
    const hitDistance = 5 / this.renderer.view.zoom; // 5 pixels in world space
    let found = null;

    // Find primitive closest to click
    for (const prim of this.primitives) {
      const dist = prim.distanceToPoint ? prim.distanceToPoint(position) : Infinity;
      if (dist < hitDistance) {
        found = prim;
        break;
      }
    }

    if (found) {
      if (addToSelection) {
        // Shift+Click: toggle this primitive in selection
        if (this.selectedPrimitives.has(found)) {
          this.selectedPrimitives.delete(found);
          this.ui.updateStatus('Elemento deselezionato');
        } else {
          this.selectedPrimitives.add(found);
          this.ui.updateStatus(`Selezionati: ${this.selectedPrimitives.size} elementi`);
        }
      } else {
        // Normal click: replace selection
        if (this.selectedPrimitives.has(found) && this.selectedPrimitives.size === 1) {
          // Clicking on already selected single item - deselect
          this.selectedPrimitives.clear();
          this.ui.updateStatus('Elemento deselezionato');
        } else {
          // Select only this item
          this.selectedPrimitives.clear();
          this.selectedPrimitives.add(found);
          this.ui.updateStatus(`Selezionato: ${found.type}`);
        }
      }
    } else {
      // Click on empty space - clear selection and highlight
      this.selectedPrimitives.clear();
      this.clearHighlight();
      this.ui.updateStatus('Selezione cancellata');
    }

    this.render();
  }

  /**
   * Update hovered primitive based on mouse position
   */
  updateHover(position) {
    if (!this.selectMode) {
      if (this.hoveredPrimitive) {
        this.hoveredPrimitive = null;
        this.renderer.setHovered(null);
        this.canvas.style.cursor = 'crosshair';
      }
      return;
    }

    const hitDistance = 5 / this.renderer.view.zoom; // 5 pixels in world space
    let found = null;
    let minDist = Infinity;

    // Find closest primitive to cursor
    for (const prim of this.primitives) {
      const dist = prim.distanceToPoint ? prim.distanceToPoint(position) : Infinity;
      if (dist < hitDistance && dist < minDist) {
        found = prim;
        minDist = dist;
      }
    }

    if (found !== this.hoveredPrimitive) {
      this.hoveredPrimitive = found;
      // Convert to render format for the renderer
      this.renderer.setHovered(found ? this.toRenderFormat(found) : null);
      // Update cursor
      this.canvas.style.cursor = found ? 'pointer' : 'default';
    }
  }

  /**
   * Get tool manager interface (provides callbacks for tools)
   */
  getToolManager() {
    return {
      addPrimitive: (primitive) => this.addPrimitive(primitive),
      setReferencePoint: (point) => { this.lastReferencePoint = point; },
      referencePoint: this.lastReferencePoint || { x: 0, y: 0 }
    };
  }

  /**
   * Select a tool
   */
  selectTool(toolName) {
    console.log('=== selectTool ===', toolName);
    if (this.currentTool) {
      this.currentTool.cancel();
    }

    const manager = this.getToolManager();
    console.log('Tool manager:', manager);

    this.selectMode = false; // Reset select mode for all tools

    switch (toolName) {
      case 'line':
        this.currentTool = new LineTool(manager);
        break;
      case 'arc':
        this.currentTool = new ArcTool(manager);
        if (this.arcMode) this.currentTool.setMode(this.arcMode);
        break;
      case 'circle':
        this.currentTool = new CircleTool(manager);
        break;
      case 'rectangle':
        this.currentTool = new RectangleTool(manager);
        break;
      case 'polygon':
        this.currentTool = new PolygonTool(manager);
        break;
      case 'select':
        this.currentTool = null;
        this.selectMode = true;
        break;
      case 'delete':
        this.currentTool = null;
        this.selectMode = false;
        this.deleteSelected();
        break;
      default:
        this.currentTool = null;
        this.selectMode = false;
    }

    console.log('Current tool after selection:', this.currentTool);
    this.ui.updateToolUI(toolName);
    if (this.selectMode) {
      this.ui.updateStatus('Modalità selezione - clicca su una primitiva');
    } else {
      this.ui.updateStatus(this.currentTool ? `Strumento: ${toolName}` : 'Nessuno strumento');
    }
    this.render();
  }

  /**
   * Add a primitive
   */
  addPrimitive(primitive) {
    this.state.pushState();
    this.primitives.push(primitive);
    this.ui.updateStats();
    this.render();
    this.refreshPLCOutput();
  }

  /**
   * Delete selected primitives
   */
  deleteSelected() {
    if (this.selectedPrimitives.size === 0) {
      this.ui.updateStatus('Nessun elemento selezionato');
      return;
    }

    this.state.pushState();
    this.primitives = this.primitives.filter(p => !this.selectedPrimitives.has(p));
    this.selectedPrimitives.clear();
    this.highlightedPrimitive = null;
    this.ui.updateStats();
    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus('Elementi eliminati');
  }

  /**
   * Clear all primitives
   */
  clearAll() {
    if (this.primitives.length === 0) return;

    this.state.pushState();
    this.primitives = [];
    this.selectedPrimitives.clear();
    this.highlightedPrimitive = null;
    this.ui.updateStats();
    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus('Area di lavoro pulita');
  }

  /**
   * Refresh PLC output after changes
   */
  refreshPLCOutput() {
    if (this.primitives.length > 0) {
      this.extractPLC();
    } else {
      this.plcCommands = [];
      this.plcOutput = [];
      this.ui.displayPLCOutput([], this);
    }
  }

  /**
   * Cancel current operation
   */
  cancelCurrentOperation() {
    if (this.currentTool) {
      this.currentTool.cancel();
      this.render();
    }
    this.selectedPrimitives.clear();
    this.highlightedPrimitive = null;
    this.ui.updateStatus('Operazione annullata');
  }

  /**
   * Highlight a primitive from PLC command
   */
  highlightPrimitive(primitive) {
    this.highlightedPrimitive = primitive;
    this.render();
  }

  /**
   * Clear primitive highlight
   */
  clearHighlight() {
    this.highlightedPrimitive = null;
    // Also clear selection in output grid
    const grid = document.getElementById('outputGrid');
    if (grid) {
      grid.querySelectorAll('.cad-output-item.selected').forEach(el => el.classList.remove('selected'));
    }
    this.render();
  }

  /**
   * Zoom controls
   */
  zoomIn() {
    const newZoom = Math.min(10, this.renderer.view.zoom * 1.2);
    this.renderer.setZoom(newZoom);
    this.ui.updateZoomDisplay();
  }

  zoomOut() {
    const newZoom = Math.max(0.1, this.renderer.view.zoom / 1.2);
    this.renderer.setZoom(newZoom);
    this.ui.updateZoomDisplay();
  }

  zoomFit() {
    this.renderer.resetView();
    this.ui.updateZoomDisplay();
  }

  /**
   * Toggle grid display
   */
  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.renderer.grid.show = this.showGrid;

    const checkbox = document.getElementById('showGrid');
    if (checkbox) checkbox.checked = this.showGrid;

    this.render();
  }

  /**
   * Extract PLC commands
   */
  extractPLC() {
    if (this.primitives.length === 0) {
      this.ui.updateStatus('Nessuna primitiva da estrarre');
      return;
    }

    // Add PLC data to primitives if not present
    const primitivesWithData = this.primitives.map(p => {
      if (!p.plcData) {
        if (p.type === 'line') {
          p.plcData = { type: 1, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
        } else if (p.type === 'arc') {
          p.plcData = {
            type: p.isClockwise ? 2 : 3,
            x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
            cx: p.cx, cy: p.cy, r: p.radius
          };
        } else if (p.type === 'circle') {
          // Circle is an arc from 0 to 360 degrees
          p.plcData = {
            type: 3, // CCW full circle
            x1: p.center.x + p.radius, y1: p.center.y,
            x2: p.center.x + p.radius, y2: p.center.y,
            cx: p.center.x, cy: p.center.y, r: p.radius
          };
        } else if (p.type === 'rectangle') {
          // Rectangle becomes 4 lines - handle separately
          p.plcData = { type: 'rectangle', x: p.x, y: p.y, width: p.width, height: p.height };
        }
      }
      return p;
    });

    // Expand rectangles and polygons to lines
    const expandedPrimitives = [];
    for (const p of primitivesWithData) {
      if (p.type === 'rectangle') {
        // Create 4 lines for rectangle
        const x = p.x, y = p.y, w = p.width, h = p.height;
        expandedPrimitives.push(
          { type: 'line', x1: x, y1: y, x2: x + w, y2: y, plcData: { type: 1, x1: x, y1: y, x2: x + w, y2: y } },
          { type: 'line', x1: x + w, y1: y, x2: x + w, y2: y + h, plcData: { type: 1, x1: x + w, y1: y, x2: x + w, y2: y + h } },
          { type: 'line', x1: x + w, y1: y + h, x2: x, y2: y + h, plcData: { type: 1, x1: x + w, y1: y + h, x2: x, y2: y + h } },
          { type: 'line', x1: x, y1: y + h, x2: x, y2: y, plcData: { type: 1, x1: x, y1: y + h, x2: x, y2: y } }
        );
      } else if (p.type === 'polygon' && p.points && p.points.length > 1) {
        // Create lines for polygon edges
        for (let i = 0; i < p.points.length - 1; i++) {
          const p1 = p.points[i], p2 = p.points[i + 1];
          expandedPrimitives.push({
            type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
            plcData: { type: 1, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
          });
        }
        // Close polygon if closed
        if (p.closed && p.points.length > 2) {
          const first = p.points[0], last = p.points[p.points.length - 1];
          expandedPrimitives.push({
            type: 'line', x1: last.x, y1: last.y, x2: first.x, y2: first.y,
            plcData: { type: 1, x1: last.x, y1: last.y, x2: first.x, y2: first.y }
          });
        }
      } else if (p.type === 'line' || p.type === 'arc' || p.type === 'circle') {
        expandedPrimitives.push(p);
      }
    }

    // Generate PLC commands (skip path optimization as it requires full primitive objects)
    const generator = new PLCOutputGenerator();
    const commands = generator.generate(expandedPrimitives);
    this.plcCommands = commands; // Store full commands with primitive references
    this.plcOutput = commands.map(c => c.command);

    this.ui.displayPLCOutput(this.plcCommands, this);
    this.ui.updateStats();
    this.ui.updateStatus(`Estratte ${this.plcOutput.length} istruzioni PLC`);
  }

  /**
   * Copy PLC output to clipboard
   */
  async copyOutput() {
    if (this.plcOutput.length === 0) {
      this.ui.updateStatus('Nessun output da copiare');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.plcOutput.join('\n'));
      this.ui.updateStatus('Output copiato negli appunti');
    } catch (err) {
      this.ui.updateStatus('Errore nella copia');
    }
  }

  /**
   * Download PLC output as file
   */
  downloadOutput() {
    if (this.plcOutput.length === 0) {
      this.ui.updateStatus('Nessun output da scaricare');
      return;
    }

    const blob = new Blob([this.plcOutput.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plc_output_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.ui.updateStatus('File scaricato');
  }

  /**
   * Send output to PLC via OPC UA
   */
  async sendToPLC() {
    if (this.plcOutput.length === 0) {
      this.ui.updateStatus('Nessun output da inviare');
      return;
    }

    this.ui.updateOPCUAStatus('Invio in corso...', 'info');

    try {
      const response = await fetch('/api/opcua/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: this.plcOutput })
      });

      if (response.ok) {
        this.ui.updateOPCUAStatus('Inviato con successo', 'success');
        this.ui.updateStatus('Comandi inviati al PLC');
      } else {
        throw new Error('Errore nella risposta');
      }
    } catch (err) {
      this.ui.updateOPCUAStatus(`Errore: ${err.message}`, 'error');
      this.ui.updateStatus('Errore invio PLC');
    }
  }

  /**
   * Render the canvas
   */
  render() {
    // Update renderer state
    this.renderer.grid.show = this.showGrid;
    this.renderer.grid.spacing = this.gridSpacing;

    // Convert primitives to renderer format
    this.renderer.primitives = this.primitives.map(p => this.toRenderFormat(p));

    // Set preview
    if (this.currentTool && this.currentTool.getPreview) {
      const preview = this.currentTool.getPreview();
      this.renderer.preview = preview ? this.previewToRenderFormat(preview) : null;
    } else {
      this.renderer.preview = null;
    }

    // Render
    this.renderer.render();

    // Draw highlighted primitive from PLC command (if not already in main primitives)
    if (this.highlightedPrimitive) {
      this.renderer.drawHighlightedPrimitive(this.highlightedPrimitive);
    }

    // Draw snap indicator with CAD-style icon
    const snapResult = this.snapManager.lastSnapResult;
    if (snapResult && snapResult.isValid && snapResult.point) {
      this.renderer.drawSnapIndicator(
        { x: snapResult.point.x, y: snapResult.point.y },
        snapResult.type
      );
    }
  }

  /**
   * Convert primitive to renderer format
   */
  toRenderFormat(p) {
    const isHighlighted = this.highlightedPrimitive === p ||
      (this.highlightedPrimitive &&
       this.highlightedPrimitive.x1 === p.x1 &&
       this.highlightedPrimitive.y1 === p.y1 &&
       this.highlightedPrimitive.x2 === p.x2 &&
       this.highlightedPrimitive.y2 === p.y2);
    const base = { visible: true, type: p.type, selected: this.selectedPrimitives.has(p), highlighted: isHighlighted };

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
          getRenderData: () => ({
            cx: p.cx, cy: p.cy, r: p.radius,
            startAngle: p.startAngle, endAngle: p.endAngle,
            anticlockwise: !p.isClockwise
          })
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

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.cadApp = new CADApplication();
});

export { CADApplication };
