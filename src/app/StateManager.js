/**
 * State Manager - Handles undo/redo and primitive serialization
 */

import { Line, Arc, Circle, Rectangle, Polygon, Polyline, Dimension, AngularDimension, RadiusDimension } from '../geometry/primitives.js';

export class StateManager {
  constructor(app, maxHistory = 50) {
    this.app = app;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
  }

  /**
   * Push current state to undo stack
   */
  /**
   * Push current state to undo stack
   */
  pushState() {
    const state = this.serializeState();
    this.undoStack.push(state);

    // Limit stack size
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // Clear redo stack on new action
    this.redoStack = [];
  }

  /**
   * Undo last action
   */
  undo() {
    if (this.undoStack.length === 0) {
      this.app.ui.updateStatus('Nessuna azione da annullare');
      return false;
    }

    // Save current state to redo stack
    const currentState = this.serializeState();
    this.redoStack.push(currentState);

    // Restore previous state
    const previousState = this.undoStack.pop();
    this.restoreState(previousState);

    // Update
    this.app.ui.updateStats();
    if (this.app.renderer) this.app.renderer.invalidateCache();
    if (this.app.snapManager) this.app.snapManager.setPrimitives(this.app.primitives);
    this.app.render();
    this.app.ui.updateStatus('Azione annullata');

    return true;
  }

  /**
   * Redo last undone action
   */
  redo() {
    if (this.redoStack.length === 0) {
      this.app.ui.updateStatus('Nessuna azione da ripetere');
      return false;
    }

    // Save current state to undo stack
    const currentState = this.serializeState();
    this.undoStack.push(currentState);

    // Restore next state
    const nextState = this.redoStack.pop();
    this.restoreState(nextState);

    // Update
    this.app.ui.updateStats();
    if (this.app.renderer) this.app.renderer.invalidateCache();
    if (this.app.snapManager) this.app.snapManager.setPrimitives(this.app.primitives);
    this.app.render();
    this.app.ui.updateStatus('Azione ripetuta');

    return true;
  }

  /**
   * Clear all history
   */
  clearHistory() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Serialize full application state (primitives + layers)
   */
  /**
   * Serialize full application state (primitives + layers + view settings)
   */
  serializeState() {
    const view = this.app.renderer ? {
      zoom: this.app.renderer.view.zoom,
      panX: this.app.renderer.view.panX,
      panY: this.app.renderer.view.panY,
      scaleFactor: this.app.renderer.view.scaleFactor
    } : null;

    const workspace = this.app.renderer ? { ...this.app.renderer.workspace } : null;
    const grid = this.app.renderer ? { ...this.app.renderer.grid } : null;
    if (grid) {
      grid.spacing = this.app.gridSpacing;
      grid.show = this.app.showGrid;
      grid.snapToGrid = this.app.snapToGrid;
    }

    const snapSettings = {
      gridEnabled: this.app.snapToGrid,
      objectSnapEnabled: this.app.snapToObjects,
      gridSpacing: this.app.gridSpacing
    };

    // The PLC settings are not part of the state: their table (/api/plc/settings) is their only source
    const state = {
      primitives: this.app.primitives.map(p => p.toJSON()),
      layers: this.app.layerManager ? this.app.layerManager.serialize() : null,
      view,
      workspace,
      grid,
      snapSettings
    };
    return JSON.stringify(state);
  }

  /**
   * Restore application state
   * @param {string|Object} jsonString - State data
   * @param {boolean} restoreView - Whether to restore zoom/pan/grid settings (default false for Undo/Redo)
   */
  restoreState(jsonString, restoreView = false) {
    let data;
    try {
      data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    } catch (e) {
      console.error('Error parsing state:', e);
      return;
    }

    // Restore layers if present
    if (data.layers && this.app.layerManager) {
      this.app.layerManager.deserialize(data.layers);
    }

    // Restore primitives (handle both new object format and legacy array format)
    const primitivesData = data.primitives || data; // Fallback for legacy state (just primitive array)
    this.app.primitives = this.deserializePrimitives(primitivesData);
    this.app.selectedPrimitives.clear();
    this.app.layerManager?.adoptPrimitiveLayers();

    // Restore View/Settings if requested
    if (restoreView) {
      this.applyViewSettings(data);
    }

    // Refresh PLC output if manager exists
    if (this.app.plcOutputManager) {
      this.app.plcOutputManager.refreshPLCOutput();
    }
  }

  /**
   * Async version of restoreState using Web Worker + Progressive Rendering
   * Industrial-grade: requestIdleCallback + progressive render for touch panels
   */
  async restoreStateAsync(jsonString, restoreView = false) {
    if (typeof jsonString !== 'string') {
      return this.restoreStateFromData(jsonString, restoreView);
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/jsonParseWorker.js', import.meta.url)
      );

      const messageQueue = [];
      let processing = false;
      let completed = false;
      let lastRenderTime = 0;
      const RENDER_INTERVAL = 200; // Progressive render every 200ms

      // Adaptive yield: use requestIdleCallback when available
      const idleYield = () => new Promise(resolve => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          setTimeout(resolve, 0);
        }
      });

      // Progressive render during load
      const progressiveRender = () => {
        const now = performance.now();
        if (now - lastRenderTime > RENDER_INTERVAL && this.app.primitives.length > 0) {
          lastRenderTime = now;
          if (this.app.renderer) {
            this.app.renderer.invalidateCache();
            this.app.render();
          }
        }
      };

      const processQueue = async () => {
        if (processing || messageQueue.length === 0) return;
        processing = true;

        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();

          if (msg.type === 'metadata') {
            if (msg.layers && this.app.layerManager) {
              this.app.layerManager.deserialize(msg.layers);
            }
            if (restoreView) {
              this.applyViewSettings(msg);
            }
            if (this.app.ui) {
              this.app.ui.updateStatus(`Caricamento ${msg.totalPrimitives} primitive...`);
            }
          }

          if (msg.type === 'chunk') {
            const items = msg.data;
            // Process entire chunk synchronously (chunks are pre-sized for efficiency)
            for (let i = 0; i < items.length; i++) {
              const prim = this.deserializeSinglePrimitive(items[i]);
              if (prim) this.app.primitives.push(prim);
            }
            // Progressive render every 10% to show loading progress
            if (msg.percent % 10 === 0) {
              progressiveRender();
            }
            // Update status every chunk
            if (this.app.ui) {
              this.app.ui.updateStatus(`Caricamento ${msg.percent}%...`);
            }
            // Single yield per chunk instead of every 10 primitives
            await idleYield();
          }

          if (msg.type === 'complete') {
            completed = true;
          }
        }

        processing = false;

        if (completed) {
          worker.terminate();
          this.app.selectedPrimitives.clear();
          // Final render
          if (this.app.renderer) {
            this.app.renderer.invalidateCache();
          }
          setTimeout(() => {
            if (this.app.plcOutputManager) {
              this.app.plcOutputManager.refreshPLCOutput();
            }
          }, 200);
          resolve();
        }
      };

      // Initialize empty primitives array for progressive loading
      this.app.primitives = [];

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'error') {
          console.error('Worker parse error:', msg.error);
          worker.terminate();
          reject(new Error(msg.error));
          return;
        }
        messageQueue.push(msg);
        processQueue();
      };

      worker.onerror = (err) => {
        console.error('Worker error:', err);
        worker.terminate();
        this.restoreStateFromData(JSON.parse(jsonString), restoreView)
          .then(resolve).catch(reject);
      };

      worker.postMessage({ jsonString, chunkSize: 100 });
    });
  }

  /**
   * Restore state from already-parsed data object
   */
  async restoreStateFromData(data, restoreView = false) {
    if (data.layers && this.app.layerManager) {
      this.app.layerManager.deserialize(data.layers);
    }
    const primitivesData = data.primitives || data;
    this.app.primitives = await this.deserializePrimitivesAsync(primitivesData);
    this.app.selectedPrimitives.clear();
    if (restoreView && this.app.renderer) {
      this.applyViewSettings(data);
    }
    setTimeout(() => {
      if (this.app.plcOutputManager) {
        this.app.plcOutputManager.refreshPLCOutput();
      }
    }, 200);
  }

  /**
   * Apply view/workspace/grid settings
   */
  applyViewSettings(data) {
    if (data.workspace && this.app.renderer) {
      this.app.renderer.workspace = { ...data.workspace };
      this.app.workspaceWidth = data.workspace.width;
      this.app.workspaceHeight = data.workspace.height;
      this.app.renderer.resizeCanvas();
      const widthInput = document.getElementById('workspaceWidth');
      const heightInput = document.getElementById('workspaceHeight');
      if (widthInput) widthInput.value = this.app.workspaceWidth;
      if (heightInput) heightInput.value = this.app.workspaceHeight;
    }
    if (data.grid && this.app.renderer) {
      this.app.renderer.setGridOptions(data.grid);
      this.app.gridSpacing = data.grid.spacing ?? 10;
      this.app.showGrid = data.grid.show ?? true;
      this.app.snapToGrid = data.grid.snapToGrid ?? this.app.snapToGrid ?? false;
    }
    if (data.snapSettings) {
      if (data.snapSettings.gridEnabled !== undefined) {
        this.app.snapToGrid = data.snapSettings.gridEnabled;
      }
      if (data.snapSettings.objectSnapEnabled !== undefined) {
        this.app.snapToObjects = data.snapSettings.objectSnapEnabled;
      }
      if (data.snapSettings.gridSpacing !== undefined) {
        this.app.gridSpacing = data.snapSettings.gridSpacing;
      }
    }
    const gridInput = document.getElementById('gridSpacing');
    if (gridInput) gridInput.value = this.app.gridSpacing;
    if (this.app.renderer) {
      this.app.renderer.grid.snapToGrid = this.app.snapToGrid;
      this.app.renderer.grid.spacing = this.app.gridSpacing;
      this.app.renderer.grid.show = this.app.showGrid;
    }
    if (this.app.snapManager) {
      this.app.snapManager.configure({
        gridEnabled: this.app.snapToGrid,
        objectSnapEnabled: this.app.snapToObjects,
        gridSpacing: this.app.gridSpacing
      });
    }
    const showGridInput = document.getElementById('showGrid');
    if (showGridInput) showGridInput.checked = this.app.showGrid;
    const snapGridInput = document.getElementById('snapGrid');
    if (snapGridInput) snapGridInput.checked = this.app.snapToGrid;
    const snapObjectsInput = document.getElementById('snapObjects');
    if (snapObjectsInput) snapObjectsInput.checked = this.app.snapToObjects;
    if (data.view && this.app.renderer) {
      this.app.renderer.view = { ...data.view };
      this.app.renderer.isCacheDirty = true;
    }
  }

  /**
   * Async chunked deserialization to prevent UI freeze
   * Uses setTimeout(0) to truly yield to browser event loop
   */
  async deserializePrimitivesAsync(data) {
    const items = typeof data === 'string' ? JSON.parse(data) : data;
    if (!Array.isArray(items)) return [];

    const primitives = [];
    const CHUNK_SIZE = 10; // Very small chunks for responsive UI
    const yieldToMain = () => new Promise(r => setTimeout(r, 0));

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, items.length);

      for (let j = i; j < end; j++) {
        const prim = this.deserializeSinglePrimitive(items[j]);
        if (prim) primitives.push(prim);
      }

      // Yield to browser event loop - truly non-blocking
      await yieldToMain();
    }

    return primitives;
  }

  /**
   * Deserialize a single primitive
   */
  deserializeSinglePrimitive(item) {
    if (!item || !item.type) return null;
    switch (item.type) {
      case 'line': return Line.fromJSON(item);
      case 'arc': return Arc.fromJSON(item);
      case 'circle': return Circle.fromJSON(item);
      case 'rectangle': return Rectangle.fromJSON(item);
      case 'polygon': return Polygon.fromJSON(item);
      case 'polyline': return Polyline.fromJSON(item);
      case 'dimension': return Dimension.fromJSON(item);
      case 'angularDimension': return AngularDimension.fromJSON(item);
      case 'radiusDimension': return RadiusDimension.fromJSON(item);
      default:
        console.warn('Unknown primitive type:', item.type);
        return null;
    }
  }

  /**
   * Deserialize primitives from JSON string or object
   * Uses static fromJSON methods from primitive classes
   */
  deserializePrimitives(data) {
    const items = typeof data === 'string' ? JSON.parse(data) : data;

    if (!Array.isArray(items)) {
      console.warn('deserializePrimitives: Expected array, got', typeof items);
      return [];
    }

    return items.map(item => {
      switch (item.type) {
        case 'line':
          return Line.fromJSON(item);

        case 'arc':
          return Arc.fromJSON(item);

        case 'circle':
          return Circle.fromJSON(item);

        case 'rectangle':
          return Rectangle.fromJSON(item);

        case 'polygon':
          return Polygon.fromJSON(item);

        case 'polyline':
          return Polyline.fromJSON(item);

        case 'dimension':
          return Dimension.fromJSON(item);

        case 'angularDimension':
          return AngularDimension.fromJSON(item);

        case 'radiusDimension':
          return RadiusDimension.fromJSON(item);

        default:
          console.warn('Unknown primitive type:', item.type);
          return null;
      }
    }).filter(Boolean);
  }

  /**
   * Check if undo is available
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo() {
    return this.redoStack.length > 0;
  }
}

export default StateManager;
