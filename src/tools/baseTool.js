/**
 * Base Tool class
 */

import { TOOL_PHASES } from './constants.js';

export class Tool {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;
    this.phase = TOOL_PHASES.IDLE;
    this.preview = null;
  }

  /**
   * Reset tool state
   */
  reset() {
    this.phase = TOOL_PHASES.IDLE;
    this.preview = null;
  }

  /**
   * Get hint text for current state
   */
  getHint() {
    return '';
  }

  /**
   * Handle mouse down event
   */
  onMouseDown(point, event) { }

  /**
   * Handle mouse move event
   */
  onMouseMove(point, event) { }

  /**
   * Handle mouse up event
   */
  onMouseUp(point, event) { }

  /**
   * Handle double click event
   */
  onDoubleClick(point, event) { }

  /**
   * Handle key down event
   */
  onKeyDown(event) { }

  /**
   * Handle command input
   */
  processCommand(command) {
    return null;
  }

  /**
   * Cancel current operation
   */
  cancel() {
    this.reset();
  }

  /**
   * Commit the current shape
   */
  commit() { }

  /**
   * Get current preview for rendering
   */
  getPreview() {
    return this.preview;
  }
}

export default Tool;
