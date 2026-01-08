/**
 * Circle Tool
 */

import { Circle } from '../geometry/primitives.js';
import { Tool } from './baseTool.js';
import { TOOLS, TOOL_PHASES } from './constants.js';
import { parseVector, parseNumber } from './commandParser.js';

export class CircleTool extends Tool {
  constructor(manager) {
    super(TOOLS.CIRCLE, manager);
    this.center = null;
  }

  reset() {
    super.reset();
    this.center = null;
  }

  getHint() {
    switch (this.phase) {
      case TOOL_PHASES.IDLE:
        return 'Clicca per il centro del cerchio';
      case TOOL_PHASES.POINT1:
        return 'Clicca per definire il raggio, o digita il valore (es: 50)';
      default:
        return '';
    }
  }

  onMouseDown(point, event) {
    if (this.phase === TOOL_PHASES.IDLE) {
      this.center = { x: point.x, y: point.y };
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(point);
    }
  }

  onMouseMove(point, event) {
    if (this.phase === TOOL_PHASES.POINT1 && this.center) {
      const radius = Math.sqrt(
        Math.pow(point.x - this.center.x, 2) +
        Math.pow(point.y - this.center.y, 2)
      );

      this.preview = {
        type: 'circle',
        cx: this.center.x,
        cy: this.center.y,
        r: radius
      };
    }
  }

  onMouseUp(point, event) {
    if (this.phase === TOOL_PHASES.POINT1 && this.center) {
      const radius = Math.sqrt(
        Math.pow(point.x - this.center.x, 2) +
        Math.pow(point.y - this.center.y, 2)
      );

      // Only create and reset if radius is meaningful
      if (radius > 0.1) {
        const circle = new Circle(this.center.x, this.center.y, radius);
        this.manager.addPrimitive(circle);
        this.reset();
      }
      // If radius too small, stay in POINT1 waiting for second click
    }
  }

  processCommand(command) {
    if (this.phase === TOOL_PHASES.IDLE) {
      const result = parseVector(this.manager.referencePoint, command);
      if (result.error) return result.error;
      this.center = result;
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(result);
      return null;
    } else if (this.phase === TOOL_PHASES.POINT1) {
      const radius = parseNumber(command);
      if (typeof radius === 'string') return radius;

      if (radius > 0.1) {
        const circle = new Circle(this.center.x, this.center.y, radius);
        this.manager.addPrimitive(circle);
      }

      this.reset();
      return null;
    }
  }
}

export default CircleTool;
