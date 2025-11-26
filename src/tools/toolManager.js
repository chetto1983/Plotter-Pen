/**
 * Tool Manager - Handles tool state and interactions
 * State machine pattern for drawing tools
 */

import { Vector2 } from '../geometry/core.js';
import { Line, Arc, Circle, Rectangle, Polygon } from '../geometry/primitives.js';
import { ArcBuilder, ARC_MODES, ArcToolState } from '../geometry/arcBuilder.js';

/**
 * Available tools
 */
export const TOOLS = {
  SELECT: 'select',
  LINE: 'line',
  ARC: 'arc',
  CIRCLE: 'circle',
  RECTANGLE: 'rectangle',
  POLYGON: 'polygon',
  FREEHAND: 'freehand',
  DELETE: 'delete',
  PAN: 'pan',
  ZOOM: 'zoom'
};

/**
 * Tool phases
 */
export const TOOL_PHASES = {
  IDLE: 'idle',
  POINT1: 'point1',
  POINT2: 'point2',
  POINT3: 'point3',
  DRAWING: 'drawing',
  COMPLETE: 'complete'
};

/**
 * Base Tool class
 */
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

/**
 * Line Tool
 */
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

  onMouseDown(point, event) {
    if (this.phase === TOOL_PHASES.IDLE) {
      this.startPoint = { x: point.x, y: point.y };
      this.phase = TOOL_PHASES.POINT1;
      this.manager.setReferencePoint(point);
    }
  }

  onMouseMove(point, event) {
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

  onMouseUp(point, event) {
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

/**
 * Arc Tool with multiple modes
 */
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

  onMouseDown(point, event) {
    // Will be handled in onMouseUp for cleaner interaction
  }

  onMouseMove(point, event) {
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

  onMouseUp(point, event) {
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

/**
 * Circle Tool
 */
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

/**
 * Rectangle Tool
 */
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

/**
 * Polygon Tool
 */
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

/**
 * Command Parser Utilities
 */
const VECTOR_PATTERN = /^(@)?(.+)(,|<)(.+)$/;

export function parseNumber(str) {
  try {
    const val = parseFloat(str);
    if (isNaN(val)) return 'Numero non valido: ' + str;
    return val;
  } catch (e) {
    return 'Errore nel parsing: ' + str;
  }
}

export function parseVector(referencePoint, command) {
  command = command.replace(/\s+/g, '');

  const match = command.match(VECTOR_PATTERN);
  if (match) {
    const isRelative = match[1] !== undefined;
    let x = parseNumber(match[2]);
    if (typeof x === 'string') return { error: x };

    const isPolar = match[3] === '<';
    let y = parseNumber(match[4]);
    if (typeof y === 'string') return { error: y };

    if (isPolar) {
      const angle = y * Math.PI / 180;
      const radius = x;
      x = radius * Math.cos(angle);
      y = radius * Math.sin(angle);
    }

    if (isRelative && referencePoint) {
      x += referencePoint.x;
      y += referencePoint.y;
    }

    return { x, y };
  }

  return { error: 'Formato non valido. Usa: x,y | @x,y | r<angolo | @r<angolo' };
}

/**
 * Parse command input and return coordinates or null
 * Used by UIController for coordinate input
 */
export function parseCommandInput(input, referencePoint) {
  const result = parseVector(referencePoint || { x: 0, y: 0 }, input);
  if (result.error) return null;
  return result;
}

/**
 * Tool Manager - Coordinates all tools
 */
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
