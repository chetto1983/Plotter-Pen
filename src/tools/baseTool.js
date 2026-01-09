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
  onMouseDown(_point, _event) { }

  /**
   * Handle mouse move event
   */
  onMouseMove(_point, _event) { }

  /**
   * Handle mouse up event
   */
  onMouseUp(_point, _event) { }

  /**
   * Handle double click event
   */
  onDoubleClick(_point, _event) { }

  /**
   * Handle key down event
   */
  onKeyDown(_event) { }

  /**
   * Handle command input
   */
  processCommand(_command) {
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
