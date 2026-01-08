/**
 * Polygon Tool
 */

import { Polygon } from '../geometry/primitives.js';
import { Tool } from './baseTool.js';
import { TOOLS } from './constants.js';
import { parseVector } from './commandParser.js';

export class PolygonTool extends Tool {
  constructor(manager) {
    super(TOOLS.POLYGON, manager);
    this.points = [];
  }

  reset() {
    super.reset();
    this.points = [];
  }

  getHint() {
    if (this.points.length === 0) {
      return 'Clicca per il primo vertice del poligono';
    } else if (this.points.length < 3) {
      return `Clicca per aggiungere vertici (${this.points.length}/min 3), doppio clic per chiudere`;
    } else {
      return 'Clicca per aggiungere vertici, doppio clic o clicca vicino al primo punto per chiudere';
    }
  }

  onMouseDown(point, event) {
    // Check if clicking near first point to close
    if (this.points.length >= 3) {
      const first = this.points[0];
      const dist = Math.sqrt(
        Math.pow(point.x - first.x, 2) +
        Math.pow(point.y - first.y, 2)
      );

      if (dist < 5) {
        this.commit();
        return;
      }
    }

    this.points.push({ x: point.x, y: point.y });
    this.manager.setReferencePoint(point);
  }

  onMouseMove(point, event) {
    if (this.points.length > 0) {
      const previewPoints = [...this.points, { x: point.x, y: point.y }];
      this.preview = {
        type: 'polygon',
        points: previewPoints,
        closed: false
      };
    }
  }

  onDoubleClick(point, event) {
    if (this.points.length >= 3) {
      this.commit();
    }
  }

  commit() {
    if (this.points.length >= 3) {
      const polygon = new Polygon(this.points);
      this.manager.addPrimitive(polygon);
    }
    this.reset();
  }

  processCommand(command) {
    if (command.toLowerCase() === 'c' || command.toLowerCase() === 'close') {
      if (this.points.length >= 3) {
        this.commit();
        return null;
      }
      return 'Servono almeno 3 punti per chiudere il poligono';
    }

    const result = parseVector(this.manager.referencePoint, command);
    if (result.error) return result.error;

    this.points.push(result);
    this.manager.setReferencePoint(result);
    return null;
  }
}

export default PolygonTool;
