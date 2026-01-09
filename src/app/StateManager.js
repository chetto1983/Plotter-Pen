/**
 * State Manager - Handles undo/redo and primitive serialization
 */

import { Line, Arc, Circle, Rectangle, Polygon, Polyline } from '../geometry/primitives.js';

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
  pushState() {
    const state = this.serializePrimitives(this.app.primitives);
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
    const currentState = this.serializePrimitives(this.app.primitives);
    this.redoStack.push(currentState);

    // Restore previous state
    const previousState = this.undoStack.pop();
    this.app.primitives = this.deserializePrimitives(previousState);
    this.app.selectedPrimitives.clear();

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
    const currentState = this.serializePrimitives(this.app.primitives);
    this.undoStack.push(currentState);

    // Restore next state
    const nextState = this.redoStack.pop();
    this.app.primitives = this.deserializePrimitives(nextState);
    this.app.selectedPrimitives.clear();

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
   * Serialize primitives to JSON string
   */
  serializePrimitives(primitives) {
    return JSON.stringify(primitives.map(p => p.toJSON()));
  }

  /**
   * Deserialize primitives from JSON string
   * Uses static fromJSON methods from primitive classes
   */
  deserializePrimitives(jsonString) {
    const data = JSON.parse(jsonString);

    return data.map(item => {
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
