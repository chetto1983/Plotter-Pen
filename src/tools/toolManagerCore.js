/**
 * Tool Manager - Coordinates all tools
 */

import { TOOLS } from './constants.js';
import { LineTool } from './lineTool.js';
import { ArcTool } from './arcTool.js';
import { CircleTool } from './circleTool.js';
import { RectangleTool } from './rectangleTool.js';
import { PolygonTool } from './polygonTool.js';
import { DimensionTool } from './dimensionTool.js';

export class ToolManager {
  constructor() {
    this.tools = {};
    this.activeTool = null;
    this.referencePoint = { x: 0, y: 0 };
    this.primitives = [];

    // Event callbacks
    this.onPrimitiveAdded = null;
    this.onPrimitiveRemoved = null;
    this.onPreviewChanged = null;
    this.onHintChanged = null;

    this.initializeTools();
  }

  initializeTools() {
    this.tools[TOOLS.LINE] = new LineTool(this);
    this.tools[TOOLS.ARC] = new ArcTool(this);
    this.tools[TOOLS.CIRCLE] = new CircleTool(this);
    this.tools[TOOLS.RECTANGLE] = new RectangleTool(this);
    this.tools[TOOLS.POLYGON] = new PolygonTool(this);
    this.tools[TOOLS.DIMENSION] = new DimensionTool(this);
  }

  setActiveTool(toolName) {
    if (this.activeTool) {
      this.activeTool.cancel();
    }

    this.activeTool = this.tools[toolName] || null;

    if (this.activeTool) {
      this.activeTool.reset();
      this.notifyHintChanged();
    }

    return this.activeTool;
  }

  setReferencePoint(point) {
    this.referencePoint = { x: point.x, y: point.y };
  }

  addPrimitive(primitive) {
    this.primitives.push(primitive);
    if (this.onPrimitiveAdded) {
      this.onPrimitiveAdded(primitive);
    }
  }

  removePrimitive(primitive) {
    const index = this.primitives.indexOf(primitive);
    if (index > -1) {
      this.primitives.splice(index, 1);
      if (this.onPrimitiveRemoved) {
        this.onPrimitiveRemoved(primitive);
      }
    }
  }

  clearPrimitives() {
    this.primitives = [];
  }

  getPreview() {
    return this.activeTool?.preview || null;
  }

  getHint() {
    return this.activeTool?.getHint() || '';
  }

  notifyHintChanged() {
    if (this.onHintChanged) {
      this.onHintChanged(this.getHint());
    }
  }

  notifyPreviewChanged() {
    if (this.onPreviewChanged) {
      this.onPreviewChanged(this.getPreview());
    }
  }

  // Event handlers
  handleMouseDown(point, event) {
    if (this.activeTool) {
      this.activeTool.onMouseDown(point, event);
      this.notifyHintChanged();
      this.notifyPreviewChanged();
    }
  }

  handleMouseMove(point, event) {
    if (this.activeTool) {
      this.activeTool.onMouseMove(point, event);
      this.notifyPreviewChanged();
    }
  }

  handleMouseUp(point, event) {
    if (this.activeTool) {
      this.activeTool.onMouseUp(point, event);
      this.notifyHintChanged();
      this.notifyPreviewChanged();
    }
  }

  handleDoubleClick(point, event) {
    if (this.activeTool) {
      this.activeTool.onDoubleClick(point, event);
      this.notifyHintChanged();
      this.notifyPreviewChanged();
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (this.activeTool) {
        this.activeTool.cancel();
        this.notifyHintChanged();
        this.notifyPreviewChanged();
      }
      return;
    }

    if (this.activeTool) {
      this.activeTool.onKeyDown(event);
    }
  }

  processCommand(command) {
    if (!this.activeTool) {
      return 'Nessuno strumento attivo';
    }

    const error = this.activeTool.processCommand(command);
    this.notifyHintChanged();
    this.notifyPreviewChanged();
    return error;
  }

  // Arc mode shortcut
  setArcMode(mode) {
    const arcTool = this.tools[TOOLS.ARC];
    if (arcTool) {
      arcTool.setMode(mode);
    }
  }
}

export default ToolManager;
