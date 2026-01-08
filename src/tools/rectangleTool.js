/**
 * Rectangle Tool
 */

import { Rectangle } from '../geometry/primitives.js';
import { Tool } from './baseTool.js';
import { TOOLS, TOOL_PHASES } from './constants.js';
import { parseVector } from './commandParser.js';

export class RectangleTool extends Tool {
  constructor(manager) {
    super(TOOLS.RECTANGLE, manager);
    this.corner1 = null;
  }

  reset() {
    super.reset();
    this.corner1 = null;
  }

  getHint() {
    switch (this.phase) {
      case TOOL_PHASES.IDLE:
        return 'Clicca per il primo angolo del rettangolo';
      case TOOL_PHASES.POINT1:
        return 'Clicca per l\'angolo opposto, o digita dimensioni (es: @100,50)';
      default:
        return '';
    }
  }

  onMouseDown(point, event) {
    if (this.phase === TOOL_PHASES.IDLE) {
      this.corner1 = { x: point.x, y: point.y };
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(point);
    }
  }

  onMouseMove(point, event) {
    if (this.phase === TOOL_PHASES.POINT1 && this.corner1) {
      this.preview = {
        type: 'rectangle',
        x: Math.min(this.corner1.x, point.x),
        y: Math.min(this.corner1.y, point.y),
        width: Math.abs(point.x - this.corner1.x),
        height: Math.abs(point.y - this.corner1.y)
      };
    }
  }

  onMouseUp(point, event) {
    if (this.phase === TOOL_PHASES.POINT1 && this.corner1) {
      const rect = Rectangle.fromCorners(this.corner1, point);

      // Only create and reset if rectangle has meaningful size
      if (rect.width > 0.1 && rect.height > 0.1) {
        this.manager.addPrimitive(rect);
        this.reset();
      }
      // If too small, stay in POINT1 waiting for second click
    }
  }

  processCommand(command) {
    if (this.phase === TOOL_PHASES.IDLE) {
      const result = parseVector(this.manager.referencePoint, command);
      if (result.error) return result.error;
      this.corner1 = result;
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(result);
      return null;
    } else if (this.phase === TOOL_PHASES.POINT1) {
      const result = parseVector(this.manager.referencePoint, command);
      if (result.error) return result.error;

      const rect = Rectangle.fromCorners(this.corner1, result);

      if (rect.width > 0.1 && rect.height > 0.1) {
        this.manager.addPrimitive(rect);
      }

      this.reset();
      return null;
    }
  }
}

export default RectangleTool;
