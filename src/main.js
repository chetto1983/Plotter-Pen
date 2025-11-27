/**
 * Sacchi Plotter Pen - CAD Application
 * Main entry point
 */

import { Vector2 } from './geometry/core.js';
import { SnapManager } from './geometry/snap.js';
import { LineTool, ArcTool, CircleTool, RectangleTool, PolygonTool } from './tools/toolManager.js';
import { CanvasRenderer } from './ui/renderer.js';
import { PLCOutputGenerator } from './plc/extraction.js';
import { InputHandler } from './app/InputHandler.js';
import { UIController } from './app/UIController.js';
import { StateManager } from './app/StateManager.js';

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

    // Clipboard for copy/paste
    this.clipboard = [];

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

    // Initialize renderer
    this.renderer = new CanvasRenderer(this.canvas);
    this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);

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
      return;
    }

    // Tools use onMouseDown/onMouseUp pattern
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
    if (this.currentTool) {
      this.currentTool.cancel();
    }

    const manager = this.getToolManager();

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
   * Move selected primitives by dx, dy (in world units)
   */
  moveSelected(dx, dy) {
    if (this.selectedPrimitives.size === 0) return;

    this.state.pushState();
    for (const primitive of this.selectedPrimitives) {
      primitive.translate(dx, dy);
    }
    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus(`Spostato: ${dx.toFixed(1)}, ${dy.toFixed(1)} mm`);
  }

  /**
   * Copy selected primitives to clipboard
   */
  copySelected() {
    if (this.selectedPrimitives.size === 0) {
      this.ui.updateStatus('Nessuna selezione da copiare');
      return;
    }

    // Serialize selected primitives
    this.clipboard = [];
    for (const primitive of this.selectedPrimitives) {
      this.clipboard.push(primitive.toJSON());
    }

    this.ui.updateStatus(`Copiati: ${this.clipboard.length} elementi`);
  }

  /**
   * Cut selected primitives (copy + delete)
   */
  cutSelected() {
    if (this.selectedPrimitives.size === 0) {
      this.ui.updateStatus('Nessuna selezione da tagliare');
      return;
    }

    this.copySelected();
    this.deleteSelected();
    this.ui.updateStatus(`Tagliati: ${this.clipboard.length} elementi`);
  }

  /**
   * Paste primitives from clipboard
   */
  pasteClipboard() {
    if (this.clipboard.length === 0) {
      this.ui.updateStatus('Appunti vuoti');
      return;
    }

    this.state.pushState();

    // Deserialize and add primitives with offset
    const newPrimitives = this.state.deserializePrimitives(JSON.stringify(this.clipboard));

    // Offset pasted primitives by 10mm so they're visible
    for (const prim of newPrimitives) {
      prim.translate(10, 10);
    }

    // Add to scene and select
    this.selectedPrimitives.clear();
    for (const prim of newPrimitives) {
      this.primitives.push(prim);
      this.selectedPrimitives.add(prim);
    }

    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus(`Incollati: ${newPrimitives.length} elementi`);
  }

  /**
   * Rotate selected primitives around their center
   * @param {number} angle - Rotation angle in degrees
   */
  rotateSelected(angle) {
    if (this.selectedPrimitives.size === 0) {
      this.ui.updateStatus('Nessuna selezione da ruotare');
      return;
    }

    this.state.pushState();

    // Calculate center of selection
    const center = this.getSelectionCenter();
    const radians = (angle * Math.PI) / 180;

    for (const primitive of this.selectedPrimitives) {
      primitive.rotate(center.x, center.y, radians);
    }

    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus(`Ruotato: ${angle}°`);
  }

  /**
   * Scale selected primitives from their center
   * @param {number} factor - Scale factor (1.0 = no change)
   */
  scaleSelected(factor) {
    if (this.selectedPrimitives.size === 0) {
      this.ui.updateStatus('Nessuna selezione da scalare');
      return;
    }

    this.state.pushState();

    // Calculate center of selection
    const center = this.getSelectionCenter();

    for (const primitive of this.selectedPrimitives) {
      primitive.scale(center.x, center.y, factor);
    }

    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus(`Scalato: ${(factor * 100).toFixed(0)}%`);
  }

  /**
   * Mirror selected primitives
   * @param {string} axis - 'x' for horizontal mirror, 'y' for vertical mirror
   */
  mirrorSelected(axis) {
    if (this.selectedPrimitives.size === 0) {
      this.ui.updateStatus('Nessuna selezione da specchiare');
      return;
    }

    this.state.pushState();

    // Calculate center of selection
    const center = this.getSelectionCenter();

    for (const primitive of this.selectedPrimitives) {
      primitive.mirror(center.x, center.y, axis);
    }

    this.render();
    this.refreshPLCOutput();
    this.ui.updateStatus(`Specchiato: asse ${axis.toUpperCase()}`);
  }

  /**
   * Get the center point of all selected primitives
   */
  getSelectionCenter() {
    if (this.selectedPrimitives.size === 0) {
      return { x: 0, y: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const primitive of this.selectedPrimitives) {
      const bbox = primitive.getBoundingBox();
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  }

  /**
   * Select primitives inside a box (rubber band selection)
   * @param {number} minX - Min X in world coordinates
   * @param {number} minY - Min Y in world coordinates
   * @param {number} maxX - Max X in world coordinates
   * @param {number} maxY - Max Y in world coordinates
   * @param {boolean} crossing - If true, select any intersecting primitive (crossing mode)
   * @param {boolean} additive - If true, add to existing selection (Shift held)
   */
  boxSelect(minX, minY, maxX, maxY, crossing = false, additive = false) {
    // Clear selection if not additive
    if (!additive) {
      this.selectedPrimitives.clear();
    }

    // Select primitives based on mode
    for (const primitive of this.primitives) {
      const intersects = primitive.intersectsBox(minX, minY, maxX, maxY);

      if (crossing) {
        // Crossing mode: select any primitive that intersects the box
        if (intersects) {
          this.selectedPrimitives.add(primitive);
        }
      } else {
        // Window mode: select only primitives fully inside the box
        const bbox = primitive.getBoundingBox();
        const fullyInside = bbox.minX >= minX && bbox.maxX <= maxX &&
                          bbox.minY >= minY && bbox.maxY <= maxY;
        if (fullyInside) {
          this.selectedPrimitives.add(primitive);
        }
      }
    }

    const count = this.selectedPrimitives.size;
    const mode = crossing ? 'attraversamento' : 'finestra';
    this.ui.updateStatus(count > 0 ? `Selezionati: ${count} (${mode})` : 'Nessun elemento selezionato');
    this.render();
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

    // Always regenerate PLC data from current primitive coordinates
    const primitivesWithData = this.primitives.map(p => {
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
   * Save drawing to JSON file
   */
  saveToFile() {
    const data = {
      version: '1.0',
      created: new Date().toISOString(),
      workspace: {
        width: this.workspaceWidth,
        height: this.workspaceHeight,
        gridSpacing: this.gridSpacing
      },
      primitives: this.primitives.map(p => p.toJSON())
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `disegno_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    this.ui.updateStatus('Disegno salvato');
  }

  /**
   * Load drawing from JSON file
   */
  loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        this.loadDrawingData(data);
        this.ui.updateStatus(`Caricato: ${file.name}`);
      } catch (err) {
        this.ui.updateStatus(`Errore caricamento: ${err.message}`);
      }
    };

    input.click();
  }

  /**
   * Apply loaded drawing data
   */
  loadDrawingData(data) {
    // Validate
    if (!data.version || !data.primitives) {
      throw new Error('Formato file non valido');
    }

    // Clear current state
    this.state.pushState();
    this.primitives = [];
    this.selectedPrimitives.clear();
    this.highlightedPrimitive = null;

    // Apply workspace settings
    if (data.workspace) {
      this.workspaceWidth = data.workspace.width || 600;
      this.workspaceHeight = data.workspace.height || 600;
      this.gridSpacing = data.workspace.gridSpacing || 10;

      this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);

      // Update snap manager grid spacing
      if (this.snapManager.options) {
        this.snapManager.options.gridSpacing = this.gridSpacing;
      }
      if (this.snapManager.gridSize !== undefined) {
        this.snapManager.gridSize = this.gridSpacing;
      }

      // Update UI inputs
      const widthInput = document.getElementById('workspaceWidth');
      const heightInput = document.getElementById('workspaceHeight');
      const gridInput = document.getElementById('gridSpacing');
      if (widthInput) widthInput.value = this.workspaceWidth;
      if (heightInput) heightInput.value = this.workspaceHeight;
      if (gridInput) gridInput.value = this.gridSpacing;
    }

    // Load primitives - handle both array format and JSON string
    try {
      if (Array.isArray(data.primitives)) {
        const primitivesJson = JSON.stringify(data.primitives);
        this.primitives = this.state.deserializePrimitives(primitivesJson);
      } else {
        throw new Error('Primitives deve essere un array');
      }
    } catch (err) {
      console.error('Error deserializing primitives:', err);
      throw new Error(`Errore caricamento primitive: ${err.message}`);
    }

    // Update UI
    this.ui.updateStats();
    this.render();
    this.refreshPLCOutput();
    this.renderer.resetView();
  }

  /**
   * Render the canvas
   */
  render() {
    // Update renderer state
    this.renderer.grid.show = this.showGrid;
    this.renderer.grid.spacing = this.gridSpacing;

    // Update floating toolbar visibility based on selection
    if (this.ui) {
      this.ui.updateFloatingToolbar();
    }

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
