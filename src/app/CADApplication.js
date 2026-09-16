import { Vector2 } from '../geometry/core.js';
import { SnapManager } from '../geometry/snap.js';
import { CanvasRenderer } from '../ui/renderer.js';
import { InputHandler } from './InputHandler.js';
import { UIController } from './UIController.js';
import { StateManager } from './StateManager.js';
import { FileManager } from './FileManager.js';
import { PLCOutputManager } from './PLCOutputManager.js';
import { SelectionManager } from './SelectionManager.js';
import { LayerManager } from './LayerManager.js';
import { ViewManager } from './ViewManager.js';
import { ToolController } from './ToolController.js';
import { LayerPanel } from '../ui/LayerPanel.js';
import { PersistenceManager } from './PersistenceManager.js';
import { OPCUAWebSocketService } from '../services/OPCUAWebSocketService.js';
import { log } from '../lib/logger.js';

/**
 * Main CAD Application Class
 */
export class CADApplication {
    constructor() {
        // Canvas and rendering
        this.canvas = null;
        this.renderer = null;

        // State
        this.primitives = [];
        this.selectedPrimitives = new Set();
        this.hoveredPrimitive = null;
        this.highlightedPrimitive = null;
        // Primitives the CAM could not cut with the tool in the panel, marked until it changes
        this.unreachedPrimitives = new Set();
        this.plcCommands = [];

        // Managers
        this.snapManager = null;
        this.input = null;
        this.ui = null;
        this.state = null;
        this.fileManager = null;
        this.plcOutputManager = null;
        this.selectionManager = null;
        this.layerManager = null;
        this.layerPanel = null;
        this.viewManager = null;
        this.toolController = null;
        this.persistenceManager = null;
        this.wsService = null;

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

        // Cached layer render settings
        this._layerSettingsCache = {};
        this._layerSettingsKey = '';

        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        log('MAIN: init() called');
        // Get canvas element
        this.canvas = document.getElementById('cadCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        // Initialize renderer
        this.renderer = new CanvasRenderer(this.canvas);
        this.renderer.setWorkspaceSize(this.workspaceWidth, this.workspaceHeight);
        this.renderer.onRequestRender = () => this.render();

        // Initialize snap manager
        this.snapManager = new SnapManager({
            gridSpacing: this.gridSpacing,
            snapDistance: 10,
            gridEnabled: this.snapToGrid,
            objectSnapEnabled: this.snapToObjects
        });
        this.snapManager.setPrimitives(this.primitives);

        // Initialize WebSocket service
        this.wsService = new OPCUAWebSocketService();
        this.wsService.connect();

        // Bound handler for cleanup
        this._beforeUnloadHandler = () => {
            if (this.wsService) {
                this.wsService.disconnect();
            }
        };

        // Cleanup WebSocket on page unload to prevent zombie connections
        window.addEventListener('beforeunload', this._beforeUnloadHandler);

        // Initialize handlers
        this.input = new InputHandler(this);
        this.ui = new UIController(this);
        this.state = new StateManager(this);
        this.fileManager = new FileManager(this);
        this.plcOutputManager = new PLCOutputManager(this);
        this.selectionManager = new SelectionManager(this);
        this.layerManager = new LayerManager(this);
        this.snapManager.setLayerManager(this.layerManager);
        this.viewManager = new ViewManager(this);
        this.toolController = new ToolController(this);
        this.persistenceManager = new PersistenceManager(this);

        // Initialize layer panel UI
        this.layerPanel = new LayerPanel(this.layerManager, 'layerPanel');

        // Setup
        this.input.setup();
        this.ui.setup();

        // Initialize 3D PLC simulator and simulation settings
        if (this.plcOutputManager) {
            this.plcOutputManager.init3DSimulator();
            this.plcOutputManager.initSimulationSettings();
        }

        // Load persisted state
        this.persistenceManager.loadState();

        // Initial render (wait for layout to be calculated)
        requestAnimationFrame(() => {
            this.renderer.resetView(); // Center workspace on canvas
            this.render();
            this.ui.updateStatus('Pronto');
        });
    }

    /**
     * Get snapped position for a world coordinate
     */
    getSnappedPosition(worldPos) {
        // Optimization: Do NOT reset primitives every frame. 
        // It rebuilds the O(N^2) intersection cache.
        // this.snapManager.setPrimitives(this.primitives); 

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
            if (this.selectionManager) {
                this.selectionManager.handleSelection(position, shiftKey);
            }
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
     * Select a tool
     */
    selectTool(toolName) {
        if (this.toolController) {
            this.toolController.selectTool(toolName);
        }
    }

    /**
     * Add a primitive (with boundary validation)
     */
    addPrimitive(primitive) {
        //console.log('addPrimitive:', primitive.type, '_throughPoint:', primitive._throughPoint);

        // Validate primitive fits within workspace boundaries
        if (!this.validateBoundaries(primitive)) {
            this.ui.updateStatus('Primitiva fuori dai limiti del workspace');
            return;
        }

        // Assign to active layer if not already set
        if (!primitive.layerId && this.layerManager) {
            primitive.layerId = this.layerManager.activeLayerId;
        }

        this.state.pushState();
        this.primitives.push(primitive);

        // Update snap manager anchor cache
        if (this.snapManager) {
            this.snapManager.setPrimitives(this.primitives);
        }

        // Invalidate renderer cache
        if (this.renderer) this.renderer.invalidateCache();

        this.ui.updateStats();
        this.render();
        if (this.plcOutputManager) this.plcOutputManager.refreshPLCOutput();
    }

    /**
     * Refresh PLC output (wrapper for manager method)
     */
    refreshPLCOutput() {
        if (this.plcOutputManager) {
            this.plcOutputManager.refreshPLCOutput();
        }
    }

    /**
     * Validate that a primitive fits within workspace boundaries
     */
    validateBoundaries(primitive) {
        const w = this.workspaceWidth;
        const h = this.workspaceHeight;

        if (primitive.type === 'circle') {
            const cx = primitive.cx ?? primitive.center?.x;
            const cy = primitive.cy ?? primitive.center?.y;
            const r = primitive.radius ?? primitive._radius;

            // Check if circle fits within workspace
            if (cx - r < 0 || cx + r > w || cy - r < 0 || cy + r > h) {
                return false;
            }
        } else if (primitive.type === 'arc') {
            // Check arc bounding box
            const bb = primitive.getBoundingBox();
            if (bb.minX < 0 || bb.maxX > w || bb.minY < 0 || bb.maxY > h) {
                return false;
            }
        } else if (primitive.type === 'line') {
            // Lines should already be clamped by input handler
            if (primitive.x1 < 0 || primitive.x1 > w || primitive.x2 < 0 || primitive.x2 > w ||
                primitive.y1 < 0 || primitive.y1 > h || primitive.y2 < 0 || primitive.y2 > h) {
                return false;
            }
        } else if (primitive.type === 'rectangle') {
            if (primitive.x < 0 || primitive.x + primitive.width > w ||
                primitive.y < 0 || primitive.y + primitive.height > h) {
                return false;
            }
        }

        return true;
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
        if (this.selectionManager) this.selectionManager.notifySelectionChanged();
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
     * Set hovered primitive
     */
    setHoveredPrimitive(primitive) {
        if (this.hoveredPrimitive !== primitive) {
            this.hoveredPrimitive = primitive;
            this.render();
        }
    }

    /**
     * Clear primitive highlight
     */
    clearHighlight() {
        this.highlightedPrimitive = null;
        const grid = document.getElementById('outputGrid');
        if (grid) {
            grid.querySelectorAll('.cad-output-item.selected').forEach(el => el.classList.remove('selected'));
        }
        if (this.renderer) this.renderer.invalidateCache();
        this.render();
    }




    setupModals() {
        // Save Modal
        const saveModal = document.getElementById('saveModal');
        const closeSave = document.getElementById('closeSaveModal');
        const btnSaveDb = document.getElementById('btnSaveDb');
        const btnSaveFile = document.getElementById('btnSaveFile');
        const nameInput = document.getElementById('saveNameInput');

        // Load Modal
        const loadModal = document.getElementById('loadModal');
        const closeLoad = document.getElementById('closeLoadModal');
        const drawingList = document.getElementById('drawingList');
        const emptyMsg = document.getElementById('drawingListEmpty');
        const pickFileBtn = document.getElementById('btnPickFile');
        const tabs = document.querySelectorAll('.cad-modal-tab');

        // --- Save Logic ---
        document.getElementById('btnSave').addEventListener('click', () => {
            saveModal.hidden = false;
            nameInput.value = `Drawing ${new Date().toLocaleString()}`;
            nameInput.focus();
            nameInput.select();
        });

        closeSave.addEventListener('click', () => saveModal.hidden = true);

        btnSaveDb.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) return alert('Inserisci un nome valido');
            const success = await this.fileManager.saveToDatabase(name);
            if (success) saveModal.hidden = true;
        });

        btnSaveFile.addEventListener('click', () => {
            this.fileManager.saveToFile();
            saveModal.hidden = true;
        });

        // --- Load Logic ---
        document.getElementById('btnLoad').addEventListener('click', async () => {
            loadModal.hidden = false;
            await refreshList();
        });

        closeLoad.addEventListener('click', () => loadModal.hidden = true);

        pickFileBtn.addEventListener('click', () => {
            this.fileManager.loadFromFile();
            loadModal.hidden = true;
        });

        // Tab Switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const mode = tab.dataset.tab; // 'db' or 'file'
                document.getElementById('loadTabDb').style.display = mode === 'db' ? 'block' : 'none';
                document.getElementById('loadTabFile').style.display = mode === 'file' ? 'block' : 'none';
            });
        });

        const refreshList = async () => {
            drawingList.innerHTML = '<div style="color:var(--muted); padding:20px;">Caricamento...</div>';
            const items = await this.fileManager.listDrawings();
            drawingList.innerHTML = '';

            if (items.length === 0) {
                emptyMsg.style.display = 'block';
            } else {
                emptyMsg.style.display = 'none';
                items.forEach(item => {
                    const el = document.createElement('div');
                    el.className = 'cad-drawing-item';
                    el.innerHTML = `
            <div class="cad-drawing-preview ${!item.previewImg ? 'placeholder' : ''}">
              ${item.previewImg
                            ? `<img src="${item.previewImg}" alt="Preview">`
                            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="width:40px;height:40px;opacity:0.5"><image x="2" y="2" width="20" height="20" rx="2"/><circle cx="12" cy="12" r="5"/></svg>'}
            </div>
            <div class="cad-drawing-info">
              <div class="cad-drawing-name" title="${item.name}">${item.name}</div>
              <div class="cad-drawing-date">${new Date(item.updatedAt).toLocaleString()}</div>
            </div>
            <div class="cad-drawing-actions">
              <button class="cad-drawing-btn delete" title="Elimina">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          `;

                    // Click to Load
                    el.addEventListener('click', (e) => {
                        if (e.target.closest('.delete')) return; // Ignore if delete btn clicked
                        this.fileManager.loadFromDatabase(item.id, item.name);
                        loadModal.hidden = true;
                    });

                    // Delete Action
                    el.querySelector('.delete').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`Eliminare "${item.name}"?`)) {
                            await this.fileManager.deleteDrawing(item.id, item.name);
                            refreshList(); // Reload list
                        }
                    });

                    drawingList.appendChild(el);
                });
            }
        };
    }

    /**
     * Render the canvas
     */
    render() {
        if (!this.renderer) return;

        // Update renderer settings
        this.renderer.grid.show = this.showGrid;
        this.renderer.grid.spacing = this.gridSpacing;
        this.renderer.grid.snapToGrid = this.snapToGrid;

        // Update floating toolbar visibility
        if (this.ui) {
            this.ui.updateFloatingToolbar();
        }

        // Get preview from current tool
        let preview = null;
        if (this.currentTool && this.currentTool.getPreview) {
            preview = this.currentTool.getPreview();
        }

        // Filter invisible primitives based on layer
        const visiblePrimitives = this.layerManager
            ? this.primitives.filter(p => this.layerManager.isPrimitiveVisible(p))
            : this.primitives;

        const layerSettings = this.getLayerSettings();

        // Single render call with all state
        this.renderer.render(
            visiblePrimitives,
            this.selectedPrimitives,
            preview,
            this.hoveredPrimitive,
            this.highlightedPrimitive,
            layerSettings,
            this.unreachedPrimitives
        );

        // Draw snap indicator if available
        if (this.snapManager && this.snapManager.lastSnapResult) {
            const snapResult = this.snapManager.lastSnapResult;
            if (snapResult && snapResult.isValid && snapResult.point) {
                this.renderer.drawSnapIndicator(
                    { x: snapResult.point.x, y: snapResult.point.y },
                    snapResult.type
                );
            }
        }

        // Trigger auto-save (debounced)
        if (this.persistenceManager) {
            this.persistenceManager.triggerAutoSave();
        }
    }

    /**
     * Cleanup resources to prevent memory leaks
     */
    destroy() {
        // Remove beforeunload listener
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }

        // Cleanup managers
        if (this.input && this.input.destroy) {
            this.input.destroy();
        }

        // Disconnect WebSocket
        if (this.wsService) {
            this.wsService.disconnect();
        }
    }

    getLayerSettings() {
        if (!this.layerManager) {
            return this._layerSettingsCache;
        }

        const layers = Array.from(this.layerManager.layers.values());
        const key = layers.map((layer) =>
            [
                layer.id,
                layer.color,
                layer.lineWeight ?? 1,
                layer.fontSize ?? 12,
                layer.textOffset ?? 5
            ].join(':')
        ).join('|');

        if (this._layerSettingsKey === key) {
            return this._layerSettingsCache;
        }

        const nextSettings = {};
        for (const layer of layers) {
            nextSettings[layer.id] = {
                color: layer.color,
                lineWeight: layer.lineWeight ?? 1,
                fontSize: layer.fontSize ?? 12,
                textOffset: layer.textOffset ?? 5
            };
        }

        this._layerSettingsCache = nextSettings;
        this._layerSettingsKey = key;
        return nextSettings;
    }

    // Helper methods removed: toRenderFormat, previewToRenderFormat
    // Direct object rendering is now used
}
