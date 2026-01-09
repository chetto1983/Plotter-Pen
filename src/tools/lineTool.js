/**
 * Line Tool
 */

import { Line } from '../geometry/primitives.js';
import { Tool } from './baseTool.js';
import { TOOLS, TOOL_PHASES } from './constants.js';
import { parseVector } from './commandParser.js';

export class LineTool extends Tool {
  constructor(manager) {
    super(TOOLS.LINE, manager);
    this.startPoint = null;
  }

  reset() {
    super.reset();
    this.startPoint = null;
  }

  getHint() {
    switch (this.phase) {
      case TOOL_PHASES.IDLE:
        return 'Clicca per il punto iniziale della linea';
      case TOOL_PHASES.POINT1:
        return 'Clicca per il punto finale, o digita coordinate (es: 100,50 oppure @50,30)';
      default:
        return '';
    }
  }

  onMouseDown(point, _event) {
    if (this.phase === TOOL_PHASES.IDLE) {
      this.startPoint = { x: point.x, y: point.y };
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(point);
    }
  }

  onMouseMove(point, _event) {
    if (this.phase === TOOL_PHASES.POINT1 && this.startPoint) {
      this.preview = {
        type: 'line',
        x1: this.startPoint.x,
        y1: this.startPoint.y,
        x2: point.x,
        y2: point.y
      };
    }
  }

  onMouseUp(point, _event) {
    if (this.phase === TOOL_PHASES.POINT1 && this.startPoint) {
      const line = new Line(
        this.startPoint.x, this.startPoint.y,
        point.x, point.y
      );

      // Only create and reset if line has meaningful length
      // This allows click-click workflow (first click sets start, second click sets end)
      if (line.length > 0.1) {
        this.manager.addPrimitive(line);
        this.manager.setReferencePoint(point);
        this.reset();
      }
      // If points are same/too close, stay in POINT1 phase waiting for second click
    }
  }

  processCommand(command) {
    if (this.phase === TOOL_PHASES.IDLE) {
      const result = parseVector(this.manager.referencePoint, command);
      if (result.error) return result.error;
      this.startPoint = result;
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(result);
      return null;
    } else if (this.phase === TOOL_PHASES.POINT1) {
      const result = parseVector(this.manager.referencePoint, command);
      if (result.error) return result.error;

      const line = new Line(
        this.startPoint.x, this.startPoint.y,
        result.x, result.y
      );

      if (line.length > 0.1) {
        this.manager.addPrimitive(line);
        this.manager.setReferencePoint(result);
      }

      this.reset();
      return null;
    }
  }
}

export default LineTool;
