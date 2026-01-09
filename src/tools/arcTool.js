/**
 * Arc Tool with multiple modes
 */

import { ArcToolState } from '../geometry/arcBuilder.js';
import { Tool } from './baseTool.js';
import { TOOLS } from './constants.js';
import { parseVector } from './commandParser.js';

export class ArcTool extends Tool {
  constructor(manager) {
    super(TOOLS.ARC, manager);
    this.state = new ArcToolState();
  }

  reset() {
    super.reset();
    this.state.reset();
  }

  getHint() {
    return this.state.getHint();
  }

  setMode(mode) {
    this.state.setMode(mode);
  }

  onMouseDown(_point, _event) {
    // Will be handled in onMouseUp for cleaner interaction
  }

  onMouseMove(point, _event) {
    this.state.updatePreview(point);
    this.preview = this.state.tempArc ? {
      type: 'arc',
      arc: this.state.tempArc
    } : null;

    // Also show line preview for first point
    if (this.state.points.length === 1 && !this.state.tempArc) {
      this.preview = {
        type: 'line',
        x1: this.state.points[0].x,
        y1: this.state.points[0].y,
        x2: point.x,
        y2: point.y
      };
    }
  }

  onMouseUp(point, _event) {
    const arc = this.state.addPoint(point);

    if (arc) {
      this.manager.addPrimitive(arc);
      this.manager.setReferencePoint({ x: arc.x2, y: arc.y2 });
      this.reset();
    } else {
      this.manager.setReferencePoint(point);
    }
  }

  processCommand(command) {
    const result = parseVector(this.manager.referencePoint, command);
    if (result.error) return result.error;

    const arc = this.state.addPoint(result);

    if (arc) {
      this.manager.addPrimitive(arc);
      this.manager.setReferencePoint({ x: arc.x2, y: arc.y2 });
      this.reset();
    } else {
      this.manager.setReferencePoint(result);
    }

    return null;
  }
}

export default ArcTool;
