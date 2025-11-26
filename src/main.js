/**
 * Sacchi Plotter Pen - CAD Application
 * Main application module integrating all components
 */

import { Vector2, Point, BoundingBox, Transform2D, distance, TOLERANCE } from './geometry/core.js';
import { Line, Arc, Circle, Rectangle, Polygon, Polyline, Primitive } from './geometry/primitives.js';
import { ArcBuilder, ArcToolState } from './geometry/arcBuilder.js';
import { SnapManager, CollisionDetector } from './geometry/snap.js';
import { ToolManager, LineTool, ArcTool, CircleTool, RectangleTool, PolygonTool, parseCommandInput } from './tools/toolManager.js';
import { CanvasRenderer } from './ui/renderer.js';
import { PrimitiveExtractor, PathOptimizer, PLCOutputGenerator } from './plc/extraction.js';

/**
 * Main CAD Application Class
 */
class CADApplication {
  constructor() {
    // Canvas and rendering
    this.canvas = null;
    this.ctx = null;
    this.renderer = null;

    // State
    this.primitives = [];
    this.selectedPrimitives = new Set();
    this.undoStack = [];
    this.redoStack = [];

    // Tools and managers
    this.toolManager = null;
    this.snapManager = null;
    this.collisionDetector = null;

    // View state
    this.viewOffset = new Vector2(0, 0);
    this.viewScale = 1;
    this.isDragging = false;
    this.lastMousePos = new Vector2(0, 0);
    this.currentMousePos = new Vector2(0, 0);

    // Workspace settings
    this.workspaceWidth = 600;
    this.workspaceHeight = 600;
    this.gridSpacing = 10;
    this.showGrid = true;
    this.snapToGrid = false;
    this.snapToObjects = true;

    // Current tool state
    this.currentTool = null;
    this.arcMode = '3point';

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

    this.ctx = this.canvas.getContext('2d');

    // Initialize renderer
    this.renderer = new CanvasRenderer(this.canvas);
    this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);

    // Initialize snap manager
    this.snapManager = new SnapManager({
      gridSize: this.gridSpacing,
      snapDistance: 10,
      enableGrid: this.snapToGrid,
      enableObjects: this.snapToObjects
    });

    // Initialize collision detector
    this.collisionDetector = new CollisionDetector();

    // Initialize tool manager
    this.toolManager = new ToolManager();

    // Setup event listeners
    this.setupEventListeners();

    // Setup UI bindings
    this.setupUIBindings();

    // Initial resize and render
    this.resizeCanvas();
    this.render();

    // Update status
    this.updateStatus('Pronto');
  }

  /**
   * Setup canvas and input event listeners
   */
  setupEventListeners() {
    // Canvas events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Window resize
    window.addEventListener('resize', this.resizeCanvas.bind(this));
  }

  /**
   * Setup UI element bindings
   */
  setupUIBindings() {
    // Tool buttons
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const toolName = btn.dataset.tool;
        this.selectTool(toolName);
      });
    });

    // Arc mode buttons
    document.querySelectorAll('[data-arc-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.arcMode = btn.dataset.arcMode;
        this.selectTool('arc');
        this.updateArcModeUI();
      });
    });

    // Action buttons
    document.getElementById('btnUndo')?.addEventListener('click', () => this.undo());
    document.getElementById('btnRedo')?.addEventListener('click', () => this.redo());
    document.getElementById('btnClear')?.addEventListener('click', () => this.clearAll());
    document.getElementById('btnZoomIn')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('btnZoomOut')?.addEventListener('click', () => this.zoomOut());
    document.getElementById('btnZoomFit')?.addEventListener('click', () => this.zoomFit());
    document.getElementById('btnExtract')?.addEventListener('click', () => this.extractPLC());
    document.getElementById('btnCopyOutput')?.addEventListener('click', () => this.copyOutput());
    document.getElementById('btnDownloadOutput')?.addEventListener('click', () => this.downloadOutput());
    document.getElementById('btnSendPLC')?.addEventListener('click', () => this.sendToPLC());

    // Settings inputs
    document.getElementById('workspaceWidth')?.addEventListener('change', (e) => {
      this.workspaceWidth = parseInt(e.target.value) || 600;
      this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);
      this.render();
    });

    document.getElementById('workspaceHeight')?.addEventListener('change', (e) => {
      this.workspaceHeight = parseInt(e.target.value) || 600;
      this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);
      this.render();
    });

    document.getElementById('gridSpacing')?.addEventListener('change', (e) => {
      this.gridSpacing = parseInt(e.target.value) || 10;
      this.snapManager.gridSize = this.gridSpacing;
      this.renderer.gridSpacing = this.gridSpacing;
      this.render();
    });

    document.getElementById('showGrid')?.addEventListener('change', (e) => {
      this.showGrid = e.target.checked;
      this.renderer.showGrid = this.showGrid;
      this.render();
    });

    document.getElementById('snapGrid')?.addEventListener('change', (e) => {
      this.snapToGrid = e.target.checked;
      this.snapManager.enableGrid = this.snapToGrid;
    });

    document.getElementById('snapObjects')?.addEventListener('change', (e) => {
      this.snapToObjects = e.target.checked;
      this.snapManager.enableObjects = this.snapToObjects;
    });

    // Command input
    const commandInput = document.getElementById('commandInput');
    commandInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleCommand(commandInput.value);
        commandInput.value = '';
      } else if (e.key === 'Escape') {
        this.cancelCurrentOperation();
        commandInput.value = '';
      }
    });

    // Shortcuts modal
    document.getElementById('closeShortcuts')?.addEventListener('click', () => {
      document.getElementById('shortcutsModal')?.setAttribute('hidden', '');
    });
  }

  /**
   * Resize canvas to fit container
   */
  resizeCanvas() {
    const container = this.canvas.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';

      this.renderer.resize(rect.width, rect.height);
      this.render();
    }
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (screenX - rect.left - this.canvas.width / (2 * window.devicePixelRatio) - this.viewOffset.x) / this.viewScale;
    const y = -(screenY - rect.top - this.canvas.height / (2 * window.devicePixelRatio) - this.viewOffset.y) / this.viewScale;
    return new Vector2(x, y);
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(e) {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle button or Alt+Left for panning
      this.isDragging = true;
      this.lastMousePos.set(e.clientX, e.clientY);
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 0) {
      // Left button - tool action
      const snappedPos = this.getSnappedPosition(worldPos);
      this.handleToolClick(snappedPos);
    }
  }

  /**
   * Handle mouse move event
   */
  handleMouseMove(e) {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    this.currentMousePos.copy(worldPos);

    if (this.isDragging) {
      // Pan view
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.viewOffset.x += dx;
      this.viewOffset.y += dy;
      this.lastMousePos.set(e.clientX, e.clientY);
      this.renderer.setView(this.viewOffset, this.viewScale);
      this.render();
      return;
    }

    // Update snap position
    const snappedPos = this.getSnappedPosition(worldPos);

    // Update coordinate display
    this.updateCoordinates(snappedPos);

    // Update tool preview
    if (this.currentTool) {
      this.currentTool.onMouseMove(snappedPos);
      this.render();
    }
  }

  /**
   * Handle mouse up event
   */
  handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  /**
   * Handle mouse wheel event
   */
  handleWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(10, this.viewScale * delta));

    // Zoom towards mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = this.canvas.width / (2 * window.devicePixelRatio);
    const centerY = this.canvas.height / (2 * window.devicePixelRatio);

    const beforeX = (mouseX - centerX - this.viewOffset.x) / this.viewScale;
    const beforeY = (mouseY - centerY - this.viewOffset.y) / this.viewScale;

    this.viewScale = newScale;

    const afterX = (mouseX - centerX - this.viewOffset.x) / this.viewScale;
    const afterY = (mouseY - centerY - this.viewOffset.y) / this.viewScale;

    this.viewOffset.x += (afterX - beforeX) * this.viewScale;
    this.viewOffset.y += (afterY - beforeY) * this.viewScale;

    this.renderer.setView(this.viewOffset, this.viewScale);
    this.updateZoomDisplay();
    this.render();
  }

  /**
   * Handle touch events
   */
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
    }
  }

  handleTouchMove(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  handleTouchEnd(e) {
    this.handleMouseUp({ button: 0 });
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(e) {
    // Don't handle if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'l':
        this.selectTool('line');
        break;
      case 'a':
        this.selectTool('arc');
        break;
      case 'c':
        this.selectTool('circle');
        break;
      case 'r':
        this.selectTool('rectangle');
        break;
      case 'p':
        this.selectTool('polygon');
        break;
      case 's':
        this.selectTool('select');
        break;
      case 'delete':
      case 'backspace':
        this.deleteSelected();
        break;
      case 'escape':
        this.cancelCurrentOperation();
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.redo();
        }
        break;
      case 'g':
        this.toggleGrid();
        break;
      case 'f':
        this.zoomFit();
        break;
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case 'f1':
        e.preventDefault();
        document.getElementById('shortcutsModal')?.removeAttribute('hidden');
        break;
    }
  }

  /**
   * Get snapped position for a world coordinate
   */
  getSnappedPosition(worldPos) {
    // Update snap manager with current primitives
    this.snapManager.setPrimitives(this.primitives);

    // Try to snap
    const snapResult = this.snapManager.snap(worldPos.x, worldPos.y);

    if (snapResult) {
      this.updateSnapInfo(snapResult.type);
      return new Vector2(snapResult.x, snapResult.y);
    }

    this.updateSnapInfo(null);
    return worldPos;
  }

  /**
   * Handle tool click
   */
  handleToolClick(position) {
    if (!this.currentTool) {
      return;
    }

    const result = this.currentTool.onClick(position);

    if (result && result.completed) {
      // Tool completed a primitive
      this.addPrimitive(result.primitive);
      this.updateStatus(`${result.primitive.type} creato`);
    }

    this.render();
  }

  /**
   * Handle command input
   */
  handleCommand(input) {
    if (!input.trim()) return;

    const cmd = input.trim().toLowerCase();

    // Check for tool commands
    if (cmd === 'line' || cmd === 'l') {
      this.selectTool('line');
      return;
    }
    if (cmd === 'arc' || cmd === 'a') {
      this.selectTool('arc');
      return;
    }
    if (cmd === 'circle' || cmd === 'c') {
      this.selectTool('circle');
      return;
    }
    if (cmd === 'rectangle' || cmd === 'rect' || cmd === 'r') {
      this.selectTool('rectangle');
      return;
    }
    if (cmd === 'polygon' || cmd === 'p') {
      this.selectTool('polygon');
      return;
    }

    // Try to parse as coordinate input
    const coord = parseCommandInput(input, this.currentMousePos);
    if (coord && this.currentTool) {
      this.handleToolClick(coord);
      return;
    }

    this.updateStatus(`Comando non riconosciuto: ${input}`);
  }

  /**
   * Select a tool
   */
  selectTool(toolName) {
    // Cancel current operation
    if (this.currentTool) {
      this.currentTool.cancel();
    }

    // Create new tool
    switch (toolName) {
      case 'line':
        this.currentTool = new LineTool();
        break;
      case 'arc':
        this.currentTool = new ArcTool(this.arcMode);
        break;
      case 'circle':
        this.currentTool = new CircleTool();
        break;
      case 'rectangle':
        this.currentTool = new RectangleTool();
        break;
      case 'polygon':
        this.currentTool = new PolygonTool();
        break;
      case 'select':
        this.currentTool = null;
        break;
      case 'delete':
        this.currentTool = null;
        this.deleteSelected();
        return;
      default:
        this.currentTool = null;
    }

    // Update UI
    this.updateToolUI(toolName);
    this.updateStatus(this.currentTool ? `Strumento: ${toolName}` : 'Nessuno strumento');
    this.render();
  }

  /**
   * Update tool button UI
   */
  updateToolUI(activeTool) {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === activeTool);
    });

    const statusTool = document.getElementById('statusTool');
    if (statusTool) {
      statusTool.textContent = activeTool ? activeTool.charAt(0).toUpperCase() + activeTool.slice(1) : 'Nessuno';
    }
  }

  /**
   * Update arc mode UI
   */
  updateArcModeUI() {
    document.querySelectorAll('[data-arc-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.arcMode === this.arcMode);
    });
  }

  /**
   * Add a primitive to the drawing
   */
  addPrimitive(primitive) {
    // Save state for undo
    this.pushUndo();

    // Add primitive
    this.primitives.push(primitive);

    // Clear redo stack
    this.redoStack = [];

    // Update stats
    this.updateStats();

    // Render
    this.render();
  }

  /**
   * Delete selected primitives
   */
  deleteSelected() {
    if (this.selectedPrimitives.size === 0) {
      this.updateStatus('Nessun elemento selezionato');
      return;
    }

    // Save state for undo
    this.pushUndo();

    // Remove selected primitives
    this.primitives = this.primitives.filter(p => !this.selectedPrimitives.has(p));
    this.selectedPrimitives.clear();

    // Clear redo stack
    this.redoStack = [];

    // Update
    this.updateStats();
    this.render();
    this.updateStatus('Elementi eliminati');
  }

  /**
   * Clear all primitives
   */
  clearAll() {
    if (this.primitives.length === 0) return;

    // Save state for undo
    this.pushUndo();

    // Clear
    this.primitives = [];
    this.selectedPrimitives.clear();

    // Clear redo stack
    this.redoStack = [];

    // Update
    this.updateStats();
    this.render();
    this.updateStatus('Area di lavoro pulita');
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
    this.updateStatus('Operazione annullata');
  }

  /**
   * Push current state to undo stack
   */
  pushUndo() {
    this.undoStack.push(JSON.stringify(this.primitives.map(p => p.toJSON())));

    // Limit stack size
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
  }

  /**
   * Undo last action
   */
  undo() {
    if (this.undoStack.length === 0) {
      this.updateStatus('Nessuna azione da annullare');
      return;
    }

    // Save current state to redo stack
    this.redoStack.push(JSON.stringify(this.primitives.map(p => p.toJSON())));

    // Restore previous state
    const state = JSON.parse(this.undoStack.pop());
    this.primitives = this.deserializePrimitives(state);
    this.selectedPrimitives.clear();

    // Update
    this.updateStats();
    this.render();
    this.updateStatus('Azione annullata');
  }

  /**
   * Redo last undone action
   */
  redo() {
    if (this.redoStack.length === 0) {
      this.updateStatus('Nessuna azione da ripetere');
      return;
    }

    // Save current state to undo stack
    this.undoStack.push(JSON.stringify(this.primitives.map(p => p.toJSON())));

    // Restore next state
    const state = JSON.parse(this.redoStack.pop());
    this.primitives = this.deserializePrimitives(state);
    this.selectedPrimitives.clear();

    // Update
    this.updateStats();
    this.render();
    this.updateStatus('Azione ripetuta');
  }

  /**
   * Deserialize primitives from JSON
   */
  deserializePrimitives(data) {
    return data.map(item => {
      switch (item.type) {
        case 'line':
          return new Line(
            new Point(item.start.x, item.start.y),
            new Point(item.end.x, item.end.y)
          );
        case 'arc':
          const arc = new Arc(
            new Point(item.center.x, item.center.y),
            item.radius,
            item.startAngle,
            item.endAngle,
            item.counterClockwise
          );
          arc.startPoint = new Point(item.startPoint.x, item.startPoint.y);
          arc.endPoint = new Point(item.endPoint.x, item.endPoint.y);
          return arc;
        case 'circle':
          return new Circle(
            new Point(item.center.x, item.center.y),
            item.radius
          );
        case 'rectangle':
          return new Rectangle(
            new Point(item.corner.x, item.corner.y),
            item.width,
            item.height
          );
        case 'polygon':
          return new Polygon(item.vertices.map(v => new Point(v.x, v.y)));
        default:
          return null;
      }
    }).filter(Boolean);
  }

  /**
   * Zoom controls
   */
  zoomIn() {
    this.viewScale = Math.min(10, this.viewScale * 1.2);
    this.renderer.setView(this.viewOffset, this.viewScale);
    this.updateZoomDisplay();
    this.render();
  }

  zoomOut() {
    this.viewScale = Math.max(0.1, this.viewScale / 1.2);
    this.renderer.setView(this.viewOffset, this.viewScale);
    this.updateZoomDisplay();
    this.render();
  }

  zoomFit() {
    if (this.primitives.length === 0) {
      this.viewScale = 1;
      this.viewOffset.set(0, 0);
    } else {
      // Calculate bounding box of all primitives
      const bb = new BoundingBox();
      for (const p of this.primitives) {
        bb.expandByBox(p.getBoundingBox());
      }

      // Add padding
      bb.expand(20);

      // Calculate scale to fit
      const canvasWidth = this.canvas.width / window.devicePixelRatio;
      const canvasHeight = this.canvas.height / window.devicePixelRatio;

      const scaleX = canvasWidth / bb.width;
      const scaleY = canvasHeight / bb.height;
      this.viewScale = Math.min(scaleX, scaleY) * 0.9;

      // Center view
      this.viewOffset.set(
        -bb.center.x * this.viewScale,
        bb.center.y * this.viewScale
      );
    }

    this.renderer.setView(this.viewOffset, this.viewScale);
    this.updateZoomDisplay();
    this.render();
  }

  /**
   * Toggle grid display
   */
  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.renderer.showGrid = this.showGrid;

    const checkbox = document.getElementById('showGrid');
    if (checkbox) checkbox.checked = this.showGrid;

    this.render();
  }

  /**
   * Extract PLC commands
   */
  extractPLC() {
    if (this.primitives.length === 0) {
      this.updateStatus('Nessuna primitiva da estrarre');
      return;
    }

    // Extract and optimize
    const extractor = new PrimitiveExtractor();
    const extracted = this.primitives.map(p => extractor.extractPrimitive(p));

    const optimizer = new PathOptimizer();
    const optimized = optimizer.optimize(extracted);

    // Generate PLC output
    const generator = new PLCOutputGenerator();
    this.plcOutput = generator.generateCommands(optimized);

    // Update output display
    this.displayPLCOutput();

    this.updateStats();
    this.updateStatus(`Estratte ${this.plcOutput.length} istruzioni PLC`);
  }

  /**
   * Display PLC output in grid
   */
  displayPLCOutput() {
    const grid = document.getElementById('outputGrid');
    if (!grid) return;

    if (this.plcOutput.length === 0) {
      grid.innerHTML = '<div class="cad-output-empty">Estrai le primitive per generare i comandi PLC</div>';
      return;
    }

    grid.innerHTML = this.plcOutput.map((cmd, i) =>
      `<div class="cad-output-item" data-index="${i}">${cmd}</div>`
    ).join('');

    // Add click handlers for selection
    grid.querySelectorAll('.cad-output-item').forEach(item => {
      item.addEventListener('click', () => {
        item.classList.toggle('selected');
      });
    });
  }

  /**
   * Copy PLC output to clipboard
   */
  async copyOutput() {
    if (this.plcOutput.length === 0) {
      this.updateStatus('Nessun output da copiare');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.plcOutput.join('\n'));
      this.updateStatus('Output copiato negli appunti');
    } catch (err) {
      this.updateStatus('Errore nella copia');
    }
  }

  /**
   * Download PLC output as file
   */
  downloadOutput() {
    if (this.plcOutput.length === 0) {
      this.updateStatus('Nessun output da scaricare');
      return;
    }

    const blob = new Blob([this.plcOutput.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plc_output_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.updateStatus('File scaricato');
  }

  /**
   * Send output to PLC via OPC UA
   */
  async sendToPLC() {
    if (this.plcOutput.length === 0) {
      this.updateStatus('Nessun output da inviare');
      return;
    }

    const statusEl = document.getElementById('opcuaStatus');

    try {
      statusEl.textContent = 'Invio in corso...';
      statusEl.className = 'cad-opcua-status';

      // This would be the actual OPC UA call
      const response = await fetch('/api/opcua/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: this.plcOutput })
      });

      if (response.ok) {
        statusEl.textContent = 'Inviato con successo';
        statusEl.className = 'cad-opcua-status connected';
        this.updateStatus('Comandi inviati al PLC');
      } else {
        throw new Error('Errore nella risposta');
      }
    } catch (err) {
      statusEl.textContent = `Errore: ${err.message}`;
      statusEl.className = 'cad-opcua-status error';
      this.updateStatus('Errore invio PLC');
    }
  }

  /**
   * Update UI elements
   */
  updateCoordinates(pos) {
    const coordX = document.getElementById('coordX');
    const coordY = document.getElementById('coordY');
    const statusX = document.getElementById('statusX');
    const statusY = document.getElementById('statusY');

    if (coordX) coordX.textContent = pos.x.toFixed(2);
    if (coordY) coordY.textContent = pos.y.toFixed(2);
    if (statusX) statusX.textContent = `X: ${pos.x.toFixed(2)}`;
    if (statusY) statusY.textContent = `Y: ${pos.y.toFixed(2)}`;
  }

  updateSnapInfo(snapType) {
    const snapInfo = document.getElementById('snapInfo');
    if (snapInfo) {
      const typeLabels = {
        endpoint: 'Fine',
        midpoint: 'Medio',
        center: 'Centro',
        intersection: 'Intersezione',
        grid: 'Griglia'
      };
      snapInfo.querySelector('.cad-snap-type').textContent = typeLabels[snapType] || '-';
    }
  }

  updateZoomDisplay() {
    const statusZoom = document.getElementById('statusZoom');
    if (statusZoom) {
      statusZoom.textContent = `${Math.round(this.viewScale * 100)}%`;
    }
  }

  updateStats() {
    const lines = this.primitives.filter(p => p.type === 'line').length;
    const arcs = this.primitives.filter(p => p.type === 'arc' || p.type === 'circle').length;

    document.getElementById('statLines')?.textContent = lines;
    document.getElementById('statArcs')?.textContent = arcs;
    document.getElementById('statTotal')?.textContent = this.primitives.length;
  }

  updateStatus(message) {
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
      statusMessage.textContent = message;
    }

    const commandHint = document.getElementById('commandHint');
    if (commandHint && this.currentTool) {
      commandHint.textContent = this.currentTool.getHint?.() || message;
    }
  }

  /**
   * Render the canvas
   */
  render() {
    this.renderer.clear();

    // Draw workspace background
    this.renderer.drawWorkspace();

    // Draw grid if enabled
    if (this.showGrid) {
      this.renderer.drawGrid();
    }

    // Draw primitives
    for (const primitive of this.primitives) {
      const isSelected = this.selectedPrimitives.has(primitive);
      this.renderer.drawPrimitive(primitive, isSelected);
    }

    // Draw tool preview
    if (this.currentTool && this.currentTool.getPreview) {
      const preview = this.currentTool.getPreview();
      if (preview) {
        this.renderer.drawPreview(preview);
      }
    }

    // Draw snap indicator
    const snapResult = this.snapManager.lastSnapResult;
    if (snapResult) {
      this.renderer.drawSnapIndicator(snapResult);
    }
  }
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.cadApp = new CADApplication();
});

// Export for module usage
export { CADApplication };
