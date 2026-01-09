/**
 * Base class for all geometric primitives
 */

import { BoundingBox } from '../core.js';

let primitiveIdCounter = 0;

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${++primitiveIdCounter}`;
}

export class Primitive {
  constructor(type, id = null) {
    this.type = type;
    this.id = id || generateId(type);
    this.selected = false;
    this.hovered = false;
    this.locked = false;
    this.visible = true;
    this.layer = 0;
    this.style = {
      strokeColor: '#c8d8ff',
      fillColor: null,
      lineWidth: 1,
      lineDash: []
    };
  }

  /**
   * Get bounding box - override in subclasses
   */
  getBoundingBox() {
    return new BoundingBox();
  }

  /**
   * Distance from point to primitive - override in subclasses
   */
  distanceToPoint(_point) {
    return Infinity;
  }

  /**
   * Get snap points - override in subclasses
   */
  getSnapPoints() {
    return [];
  }

  /**
   * Sample points for rendering - override in subclasses
   */
  samplePoints(_resolution = 1) {
    return [];
  }

  /**
   * Draw to canvas context - override in subclasses
   */
  draw(_ctx, _scale = 1) {
    // Override in subclasses
  }

  /**
   * Clone primitive - override in subclasses
   */
  clone() {
    throw new Error('clone() must be implemented by subclass');
  }

  /**
   * Translate primitive by dx, dy - override in subclasses
   */
  translate(_dx, _dy) {
    throw new Error('translate() must be implemented by subclass');
  }

  /**
   * Rotate primitive around a center point - override in subclasses
   */
  rotate(_cx, _cy, _radians) {
    throw new Error('rotate() must be implemented by subclass');
  }

  /**
   * Scale primitive from a center point - override in subclasses
   */
  scale(_cx, _cy, _factor) {
    throw new Error('scale() must be implemented by subclass');
  }

  /**
   * Mirror primitive around a center point - override in subclasses
   * @param {string} axis - 'x' for horizontal, 'y' for vertical
   */
  mirror(_cx, _cy, _axis) {
    throw new Error('mirror() must be implemented by subclass');
  }

  /**
   * Helper: rotate a point around a center
   */
  static rotatePoint(px, py, cx, cy, radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  /**
   * Helper: scale a point from a center
   */
  static scalePoint(px, py, cx, cy, factor) {
    return {
      x: cx + (px - cx) * factor,
      y: cy + (py - cy) * factor
    };
  }

  /**
   * Helper: mirror a point around a center
   */
  static mirrorPoint(px, py, cx, cy, axis) {
    if (axis === 'x') {
      return { x: 2 * cx - px, y: py };
    } else {
      return { x: px, y: 2 * cy - py };
    }
  }

  /**
   * Check if primitive intersects with a box - override in subclasses
   */
  intersectsBox(_minX, _minY, _maxX, _maxY) {
    return false;
  }

  /**
   * Serialize to JSON - override in subclasses
   */
  toJSON() {
    return {
      type: this.type,
      id: this.id,
      style: { ...this.style },
      layer: this.layer
    };
  }
}

export default Primitive;
