/**
 * Sacchi Plotter Pen - CAD Application
 * Main entry point
 */

import { Vector2 } from './geometry/core.js';
import { SnapManager } from './geometry/snap.js';
import { CanvasRenderer } from './ui/renderer.js';
import { InputHandler } from './app/InputHandler.js';
import { UIController } from './app/UIController.js';
import { StateManager } from './app/StateManager.js';
import { FileManager } from './app/FileManager.js';
import { PLCOutputManager } from './app/PLCOutputManager.js';
import { SelectionManager } from './app/SelectionManager.js';
import { LayerManager } from './app/LayerManager.js';
import { ViewManager } from './app/ViewManager.js';
import { ToolController } from './app/ToolController.js';
import { LayerPanel } from './ui/LayerPanel.js';
import { PersistenceManager } from './app/PersistenceManager.js';

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
    this.fileManager = null;
    this.plcOutputManager = null;
    this.selectionManager = null;
    this.layerManager = null;
    this.layerPanel = null;
    this.viewManager = null;
    this.toolController = null;
    this.persistenceManager = null;

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
      //console.error('Canvas element not found');
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

    // Load persisted state
    this.persistenceManager.loadState();

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



  /**
   * Render the canvas
   */
  render() {
    if (!this.renderer) return;

    // Update renderer settings
    this.renderer.grid.show = this.showGrid;
    this.renderer.grid.spacing = this.gridSpacing;

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

    // Map layer settings for rendering (includes color, lineWeight, fontSize)
    const layerSettings = {};
    if (this.layerManager) {
      for (const layer of this.layerManager.layers.values()) {
        layerSettings[layer.id] = {
          color: layer.color,
          lineWeight: layer.lineWeight ?? 1,
          fontSize: layer.fontSize ?? 12,
          textOffset: layer.textOffset ?? 5
        };
      }
    }

    // Single render call with all state
    this.renderer.render(
      visiblePrimitives,
      this.selectedPrimitives,
      preview,
      this.hoveredPrimitive,
      this.highlightedPrimitive,
      layerSettings
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

  // Helper methods removed: toRenderFormat, previewToRenderFormat
  // Direct object rendering is now used
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.cadApp = new CADApplication();
});

export { CADApplication };
