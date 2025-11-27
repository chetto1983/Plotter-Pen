/**
 * Geometric Primitives - Line, Arc, Circle, Rectangle, Polygon
 * All primitives share a common interface for rendering, hit-testing, and snapping
 */

import {
  TWO_PI, TOLERANCE, VISUAL_TOLERANCE,
  normalizeAngle, normalizeAngleSigned,
  distance, areEqual, clamp,
  Vector2, Point, BoundingBox
} from './core.js';

let primitiveIdCounter = 0;

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${++primitiveIdCounter}`;
}

/**
 * Base class for all geometric primitives
 */
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
  distanceToPoint(point) {
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
  samplePoints(resolution = 1) {
    return [];
  }

  /**
   * Draw to canvas context - override in subclasses
   */
  draw(ctx, scale = 1) {
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
  translate(dx, dy) {
    throw new Error('translate() must be implemented by subclass');
  }

  /**
   * Rotate primitive around a center point - override in subclasses
   */
  rotate(cx, cy, radians) {
    throw new Error('rotate() must be implemented by subclass');
  }

  /**
   * Scale primitive from a center point - override in subclasses
   */
  scale(cx, cy, factor) {
    throw new Error('scale() must be implemented by subclass');
  }

  /**
   * Mirror primitive around a center point - override in subclasses
   * @param {string} axis - 'x' for horizontal, 'y' for vertical
   */
  mirror(cx, cy, axis) {
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
  intersectsBox(minX, minY, maxX, maxY) {
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

/**
 * Line Segment primitive
 */
export class Line extends Primitive {
  constructor(x1, y1, x2, y2, id = null) {
    super('line', id);
    this.a = new Point(x1, y1, `${this.id}:A`);
    this.b = new Point(x2, y2, `${this.id}:B`);
    this.a.parent = this;
    this.b.parent = this;
  }

  get x1() { return this.a.x; }
  get y1() { return this.a.y; }
  get x2() { return this.b.x; }
  get y2() { return this.b.y; }

  set x1(v) { this.a.x = v; }
  set y1(v) { this.a.y = v; }
  set x2(v) { this.b.x = v; }
  set y2(v) { this.b.y = v; }

  /**
   * Get line length
   */
  get length() {
    return this.a.distanceTo(this.b);
  }

  /**
   * Get line direction vector (normalized)
   */
  get direction() {
    return this.b.sub(this.a).normalize();
  }

  /**
   * Get line angle
   */
  get angle() {
    return Math.atan2(this.b.y - this.a.y, this.b.x - this.a.x);
  }

  /**
   * Get midpoint
   */
  get midpoint() {
    return new Vector2(
      (this.a.x + this.b.x) / 2,
      (this.a.y + this.b.y) / 2
    );
  }

  /**
   * Get perpendicular direction
   */
  get perpendicular() {
    return this.direction.perpendicular();
  }

  getBoundingBox() {
    return new BoundingBox(
      Math.min(this.a.x, this.b.x),
      Math.min(this.a.y, this.b.y),
      Math.max(this.a.x, this.b.x),
      Math.max(this.a.y, this.b.y)
    );
  }

  /**
   * Distance from point to line segment
   */
  distanceToPoint(point) {
    const ab = this.b.sub(this.a);
    const ap = Vector2.from(point).sub(this.a);
    const lengthSq = ab.lengthSquared();

    if (lengthSq < TOLERANCE) {
      return this.a.distanceTo(point);
    }

    // Project point onto line
    let t = ap.dot(ab) / lengthSq;
    t = clamp(t, 0, 1);

    const projection = this.a.add(ab.scale(t));
    return projection.distanceTo(point);
  }

  /**
   * Get closest point on segment to given point
   */
  closestPoint(point) {
    const ab = this.b.sub(this.a);
    const ap = Vector2.from(point).sub(this.a);
    const lengthSq = ab.lengthSquared();

    if (lengthSq < TOLERANCE) {
      return this.a.clone();
    }

    let t = clamp(ap.dot(ab) / lengthSq, 0, 1);
    return this.a.add(ab.scale(t));
  }

  /**
   * Get point at parameter t (0 = start, 1 = end)
   */
  pointAt(t) {
    return this.a.lerp(this.b, t);
  }

  /**
   * Check if point lies on line (within tolerance)
   */
  containsPoint(point, tolerance = VISUAL_TOLERANCE) {
    return this.distanceToPoint(point) < tolerance;
  }

  getSnapPoints() {
    return [
      { point: this.a.clone(), type: 'endpoint', label: 'Inizio' },
      { point: this.midpoint, type: 'midpoint', label: 'Centro' },
      { point: this.b.clone(), type: 'endpoint', label: 'Fine' }
    ];
  }

  samplePoints(resolution = 1) {
    return [
      { x: this.a.x, y: this.a.y },
      { x: this.b.x, y: this.b.y }
    ];
  }

  draw(ctx, scale = 1) {
    ctx.beginPath();
    ctx.moveTo(this.a.x, this.a.y);
    ctx.lineTo(this.b.x, this.b.y);
    ctx.stroke();
  }

  clone() {
    const line = new Line(this.a.x, this.a.y, this.b.x, this.b.y);
    line.style = { ...this.style };
    line.layer = this.layer;
    return line;
  }

  translate(dx, dy) {
    this.a = new Point(this.a.x + dx, this.a.y + dy, this.a.id);
    this.a.parent = this;
    this.b = new Point(this.b.x + dx, this.b.y + dy, this.b.id);
    this.b.parent = this;
  }

  rotate(cx, cy, radians) {
    const newA = Primitive.rotatePoint(this.a.x, this.a.y, cx, cy, radians);
    const newB = Primitive.rotatePoint(this.b.x, this.b.y, cx, cy, radians);
    this.a = new Point(newA.x, newA.y, this.a.id);
    this.a.parent = this;
    this.b = new Point(newB.x, newB.y, this.b.id);
    this.b.parent = this;
  }

  scale(cx, cy, factor) {
    const newA = Primitive.scalePoint(this.a.x, this.a.y, cx, cy, factor);
    const newB = Primitive.scalePoint(this.b.x, this.b.y, cx, cy, factor);
    this.a = new Point(newA.x, newA.y, this.a.id);
    this.a.parent = this;
    this.b = new Point(newB.x, newB.y, this.b.id);
    this.b.parent = this;
  }

  mirror(cx, cy, axis) {
    const newA = Primitive.mirrorPoint(this.a.x, this.a.y, cx, cy, axis);
    const newB = Primitive.mirrorPoint(this.b.x, this.b.y, cx, cy, axis);
    this.a = new Point(newA.x, newA.y, this.a.id);
    this.a.parent = this;
    this.b = new Point(newB.x, newB.y, this.b.id);
    this.b.parent = this;
  }

  intersectsBox(minX, minY, maxX, maxY) {
    // Check if either endpoint is inside
    const aInside = this.a.x >= minX && this.a.x <= maxX && this.a.y >= minY && this.a.y <= maxY;
    const bInside = this.b.x >= minX && this.b.x <= maxX && this.b.y >= minY && this.b.y <= maxY;
    if (aInside || bInside) return true;

    // Check line-box intersection using Liang-Barsky algorithm
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [this.a.x - minX, maxX - this.a.x, this.a.y - minY, maxY - this.a.y];

    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          t0 = Math.max(t0, t);
        } else {
          t1 = Math.min(t1, t);
        }
        if (t0 > t1) return false;
      }
    }
    return true;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      x1: this.a.x,
      y1: this.a.y,
      x2: this.b.x,
      y2: this.b.y
    };
  }

  static fromJSON(data) {
    const line = new Line(data.x1, data.y1, data.x2, data.y2, data.id);
    if (data.style) line.style = { ...data.style };
    if (data.layer !== undefined) line.layer = data.layer;
    return line;
  }
}

/**
 * Arc primitive - Three point model (start, end, center)
 */
export class Arc extends Primitive {
  constructor(ax, ay, bx, by, cx, cy, id = null) {
    super('arc', id);

    // Three defining points
    this.a = new Point(ax, ay, `${this.id}:A`); // Start
    this.b = new Point(bx, by, `${this.id}:B`); // End
    this.c = new Point(cx, cy, `${this.id}:C`); // Center

    this.a.parent = this;
    this.b.parent = this;
    this.c.parent = this;

    // Cached values
    this._radius = 0;
    this._startAngle = 0;
    this._endAngle = 0;
    this._sweep = 0;

    this.syncGeometry();
  }

  /**
   * Synchronize cached parameters from points
   */
  syncGeometry() {
    this._radius = this.distanceA();
    this._startAngle = this.calcStartAngle();
    this._endAngle = this.calcEndAngle();
    this._sweep = this.calcSweep();
  }

  calcStartAngle() {
    return Math.atan2(this.a.y - this.c.y, this.a.x - this.c.x);
  }

  calcEndAngle() {
    return Math.atan2(this.b.y - this.c.y, this.b.x - this.c.x);
  }

  calcSweep() {
    let sweep = this._endAngle - this._startAngle;
    // Normalize to smaller arc by default
    if (sweep > Math.PI) sweep -= TWO_PI;
    if (sweep < -Math.PI) sweep += TWO_PI;
    return sweep;
  }

  distanceA() {
    return distance(this.a.x, this.a.y, this.c.x, this.c.y);
  }

  distanceB() {
    return distance(this.b.x, this.b.y, this.c.x, this.c.y);
  }

  get x1() { return this.a.x; }
  get y1() { return this.a.y; }
  get x2() { return this.b.x; }
  get y2() { return this.b.y; }
  get cx() { return this.c.x; }
  get cy() { return this.c.y; }

  get radius() {
    return Math.max(this._radius, TOLERANCE);
  }

  get startAngle() {
    return this._startAngle;
  }

  get endAngle() {
    return this._endAngle;
  }

  get sweep() {
    return this._sweep;
  }

  get direction() {
    return this._sweep >= 0 ? 'CCW' : 'CW';
  }

  get isClockwise() {
    return this._sweep < 0;
  }

  get length() {
    return Math.abs(this._sweep) * this.radius;
  }

  /**
   * Get midpoint on arc
   */
  get midpoint() {
    const midAngle = this._startAngle + this._sweep / 2;
    return new Vector2(
      this.c.x + this.radius * Math.cos(midAngle),
      this.c.y + this.radius * Math.sin(midAngle)
    );
  }

  /**
   * Check if point is inside arc sector
   */
  isPointInsideSector(point) {
    const ca = Vector2.from(this.a).sub(this.c).normalize();
    const cb = Vector2.from(this.b).sub(this.c).normalize();
    const ct = Vector2.from(point).sub(this.c).normalize();

    const cosAB = ca.dot(cb);
    const cosAT = ca.dot(ct);
    const isInside = cosAT >= cosAB;

    const abCross = ca.cross(cb);
    const atCross = ca.cross(ct);

    if (abCross < 0) {
      return atCross >= 0 || !isInside;
    } else {
      return atCross >= 0 && isInside;
    }
  }

  /**
   * Distance from point to arc
   */
  distanceToPoint(point) {
    const isInside = this.isPointInsideSector(point);

    if (isInside) {
      const distToCenter = distance(point.x, point.y, this.c.x, this.c.y);
      return Math.abs(distToCenter - this.radius);
    } else {
      return Math.min(
        distance(point.x, point.y, this.a.x, this.a.y),
        distance(point.x, point.y, this.b.x, this.b.y)
      );
    }
  }

  /**
   * Get closest point on arc
   */
  closestPoint(point) {
    const isInside = this.isPointInsideSector(point);

    if (isInside) {
      const angle = Math.atan2(point.y - this.c.y, point.x - this.c.x);
      return new Vector2(
        this.c.x + this.radius * Math.cos(angle),
        this.c.y + this.radius * Math.sin(angle)
      );
    } else {
      const distA = distance(point.x, point.y, this.a.x, this.a.y);
      const distB = distance(point.x, point.y, this.b.x, this.b.y);
      return distA < distB ? this.a.clone() : this.b.clone();
    }
  }

  /**
   * Get point at parameter t (0 = start, 1 = end)
   */
  pointAt(t) {
    const angle = this._startAngle + this._sweep * t;
    return new Vector2(
      this.c.x + this.radius * Math.cos(angle),
      this.c.y + this.radius * Math.sin(angle)
    );
  }

  getBoundingBox() {
    const bb = new BoundingBox();
    bb.expandByPoint(this.a);
    bb.expandByPoint(this.b);

    // Check if arc passes through cardinal directions
    const r = this.radius;
    const angles = [0, HALF_PI, Math.PI, -HALF_PI];

    for (const angle of angles) {
      if (this.angleInArc(angle)) {
        bb.expandByPoint({
          x: this.c.x + r * Math.cos(angle),
          y: this.c.y + r * Math.sin(angle)
        });
      }
    }

    return bb;
  }

  /**
   * Check if an angle lies within the arc
   */
  angleInArc(angle) {
    const start = normalizeAngle(this._startAngle);
    const end = normalizeAngle(this._startAngle + this._sweep);
    angle = normalizeAngle(angle);

    if (this._sweep >= 0) {
      if (start <= end) {
        return angle >= start && angle <= end;
      } else {
        return angle >= start || angle <= end;
      }
    } else {
      if (end <= start) {
        return angle <= start && angle >= end;
      } else {
        return angle <= start || angle >= end;
      }
    }
  }

  getSnapPoints() {
    return [
      { point: this.a.clone(), type: 'endpoint', label: 'Arco inizio' },
      { point: this.midpoint, type: 'midpoint', label: 'Arco centro' },
      { point: this.b.clone(), type: 'endpoint', label: 'Arco fine' },
      { point: this.c.clone(), type: 'center', label: 'Centro' }
    ];
  }

  samplePoints(minSegments = 16, maxStepAngle = Math.PI / 36) {
    const totalAngle = Math.abs(this._sweep);
    const steps = Math.max(minSegments, Math.ceil(totalAngle / maxStepAngle));
    const points = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = this._startAngle + this._sweep * t;
      points.push({
        x: this.c.x + this.radius * Math.cos(angle),
        y: this.c.y + this.radius * Math.sin(angle)
      });
    }

    // Snap endpoints exactly
    if (points.length > 0) {
      points[0] = { x: this.a.x, y: this.a.y };
      points[points.length - 1] = { x: this.b.x, y: this.b.y };
    }

    return points;
  }

  /**
   * Get render data for canvas arc() method
   */
  getRenderData() {
    const startNorm = normalizeAngle(this._startAngle);
    const isFullCircle = areEqual(this.a.x, this.b.x) && areEqual(this.a.y, this.b.y);

    return {
      cx: this.c.x,
      cy: this.c.y,
      r: this.radius,
      startAngle: startNorm,
      endAngle: isFullCircle ? startNorm + TWO_PI : normalizeAngle(this._endAngle),
      anticlockwise: this._sweep >= 0  // CCW when sweep is positive
    };
  }

  draw(ctx, scale = 1) {
    const { startAngle, endAngle, anticlockwise } = this.getRenderData();
    ctx.beginPath();
    ctx.arc(this.c.x, this.c.y, this.radius, startAngle, endAngle, anticlockwise);
    ctx.stroke();
  }

  clone() {
    const arc = new Arc(
      this.a.x, this.a.y,
      this.b.x, this.b.y,
      this.c.x, this.c.y
    );
    arc.style = { ...this.style };
    arc.layer = this.layer;
    return arc;
  }

  translate(dx, dy) {
    this.a = new Point(this.a.x + dx, this.a.y + dy, this.a.id);
    this.a.parent = this;
    this.b = new Point(this.b.x + dx, this.b.y + dy, this.b.id);
    this.b.parent = this;
    this.c = new Point(this.c.x + dx, this.c.y + dy, this.c.id);
    this.c.parent = this;
    this.syncGeometry();
  }

  rotate(cx, cy, radians) {
    const newA = Primitive.rotatePoint(this.a.x, this.a.y, cx, cy, radians);
    const newB = Primitive.rotatePoint(this.b.x, this.b.y, cx, cy, radians);
    const newC = Primitive.rotatePoint(this.c.x, this.c.y, cx, cy, radians);
    this.a = new Point(newA.x, newA.y, this.a.id);
    this.a.parent = this;
    this.b = new Point(newB.x, newB.y, this.b.id);
    this.b.parent = this;
    this.c = new Point(newC.x, newC.y, this.c.id);
    this.c.parent = this;
    this.syncGeometry();
  }

  scale(cx, cy, factor) {
    const newA = Primitive.scalePoint(this.a.x, this.a.y, cx, cy, factor);
    const newB = Primitive.scalePoint(this.b.x, this.b.y, cx, cy, factor);
    const newC = Primitive.scalePoint(this.c.x, this.c.y, cx, cy, factor);
    this.a = new Point(newA.x, newA.y, this.a.id);
    this.a.parent = this;
    this.b = new Point(newB.x, newB.y, this.b.id);
    this.b.parent = this;
    this.c = new Point(newC.x, newC.y, this.c.id);
    this.c.parent = this;
    this.syncGeometry();
  }

  mirror(cx, cy, axis) {
    const newA = Primitive.mirrorPoint(this.a.x, this.a.y, cx, cy, axis);
    const newB = Primitive.mirrorPoint(this.b.x, this.b.y, cx, cy, axis);
    const newC = Primitive.mirrorPoint(this.c.x, this.c.y, cx, cy, axis);
    this.a = new Point(newA.x, newA.y, this.a.id);
    this.a.parent = this;
    this.b = new Point(newB.x, newB.y, this.b.id);
    this.b.parent = this;
    this.c = new Point(newC.x, newC.y, this.c.id);
    this.c.parent = this;
    this.syncGeometry();
  }

  intersectsBox(minX, minY, maxX, maxY) {
    // Sample points along arc and check if any are inside the box
    const samples = this.samplePoints(32);
    for (const p of samples) {
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
        return true;
      }
    }
    return false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ax: this.a.x,
      ay: this.a.y,
      bx: this.b.x,
      by: this.b.y,
      cx: this.c.x,
      cy: this.c.y
    };
  }

  static fromJSON(data) {
    const arc = new Arc(
      data.ax, data.ay,
      data.bx, data.by,
      data.cx, data.cy,
      data.id
    );
    if (data.style) arc.style = { ...data.style };
    if (data.layer !== undefined) arc.layer = data.layer;
    return arc;
  }
}

/**
 * Circle primitive
 */
export class Circle extends Primitive {
  constructor(cx, cy, radius, id = null) {
    super('circle', id);
    this.center = new Point(cx, cy, `${this.id}:C`);
    this.center.parent = this;
    this._radius = radius;
  }

  get cx() { return this.center.x; }
  get cy() { return this.center.y; }
  get radius() { return this._radius; }

  set cx(v) { this.center.x = v; }
  set cy(v) { this.center.y = v; }
  set radius(v) { this._radius = Math.max(TOLERANCE, v); }

  get diameter() { return this._radius * 2; }
  get circumference() { return TWO_PI * this._radius; }
  get area() { return Math.PI * this._radius * this._radius; }

  getBoundingBox() {
    return new BoundingBox(
      this.center.x - this._radius,
      this.center.y - this._radius,
      this.center.x + this._radius,
      this.center.y + this._radius
    );
  }

  distanceToPoint(point) {
    const distToCenter = distance(point.x, point.y, this.center.x, this.center.y);
    return Math.abs(distToCenter - this._radius);
  }

  closestPoint(point) {
    const angle = Math.atan2(point.y - this.center.y, point.x - this.center.x);
    return new Vector2(
      this.center.x + this._radius * Math.cos(angle),
      this.center.y + this._radius * Math.sin(angle)
    );
  }

  containsPoint(point) {
    return distance(point.x, point.y, this.center.x, this.center.y) <= this._radius;
  }

  pointAt(t) {
    const angle = t * TWO_PI;
    return new Vector2(
      this.center.x + this._radius * Math.cos(angle),
      this.center.y + this._radius * Math.sin(angle)
    );
  }

  getSnapPoints() {
    return [
      { point: this.center.clone(), type: 'center', label: 'Centro' },
      { point: new Vector2(this.center.x + this._radius, this.center.y), type: 'quadrant', label: 'Quadrante' },
      { point: new Vector2(this.center.x - this._radius, this.center.y), type: 'quadrant', label: 'Quadrante' },
      { point: new Vector2(this.center.x, this.center.y + this._radius), type: 'quadrant', label: 'Quadrante' },
      { point: new Vector2(this.center.x, this.center.y - this._radius), type: 'quadrant', label: 'Quadrante' }
    ];
  }

  samplePoints(segments = 64) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * TWO_PI;
      points.push({
        x: this.center.x + this._radius * Math.cos(angle),
        y: this.center.y + this._radius * Math.sin(angle)
      });
    }
    return points;
  }

  draw(ctx, scale = 1) {
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this._radius, 0, TWO_PI);
    ctx.stroke();
  }

  clone() {
    const circle = new Circle(this.center.x, this.center.y, this._radius);
    circle.style = { ...this.style };
    circle.layer = this.layer;
    return circle;
  }

  translate(dx, dy) {
    this.center = new Point(this.center.x + dx, this.center.y + dy, this.center.id);
    this.center.parent = this;
  }

  rotate(cx, cy, radians) {
    const newCenter = Primitive.rotatePoint(this.center.x, this.center.y, cx, cy, radians);
    this.center = new Point(newCenter.x, newCenter.y, this.center.id);
    this.center.parent = this;
  }

  scale(cx, cy, factor) {
    const newCenter = Primitive.scalePoint(this.center.x, this.center.y, cx, cy, factor);
    this.center = new Point(newCenter.x, newCenter.y, this.center.id);
    this.center.parent = this;
    this._radius *= factor;
  }

  mirror(cx, cy, axis) {
    const newCenter = Primitive.mirrorPoint(this.center.x, this.center.y, cx, cy, axis);
    this.center = new Point(newCenter.x, newCenter.y, this.center.id);
    this.center.parent = this;
  }

  intersectsBox(minX, minY, maxX, maxY) {
    // Find closest point on box to circle center
    const closestX = Math.max(minX, Math.min(this.center.x, maxX));
    const closestY = Math.max(minY, Math.min(this.center.y, maxY));
    const dx = this.center.x - closestX;
    const dy = this.center.y - closestY;
    return (dx * dx + dy * dy) <= (this._radius * this._radius);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      cx: this.center.x,
      cy: this.center.y,
      radius: this._radius
    };
  }

  static fromJSON(data) {
    const circle = new Circle(data.cx, data.cy, data.radius, data.id);
    if (data.style) circle.style = { ...data.style };
    if (data.layer !== undefined) circle.layer = data.layer;
    return circle;
  }
}

/**
 * Rectangle primitive (axis-aligned)
 */
export class Rectangle extends Primitive {
  constructor(x, y, width, height, id = null) {
    super('rectangle', id);
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
  }

  get x() { return this._x; }
  get y() { return this._y; }
  get width() { return this._width; }
  get height() { return this._height; }

  set x(v) { this._x = v; }
  set y(v) { this._y = v; }
  set width(v) { this._width = v; }
  set height(v) { this._height = v; }

  get center() {
    return new Vector2(
      this._x + this._width / 2,
      this._y + this._height / 2
    );
  }

  get topLeft() { return new Vector2(this._x, this._y); }
  get topRight() { return new Vector2(this._x + this._width, this._y); }
  get bottomLeft() { return new Vector2(this._x, this._y + this._height); }
  get bottomRight() { return new Vector2(this._x + this._width, this._y + this._height); }

  get corners() {
    return [this.topLeft, this.topRight, this.bottomRight, this.bottomLeft];
  }

  get edges() {
    const c = this.corners;
    return [
      new Line(c[0].x, c[0].y, c[1].x, c[1].y),
      new Line(c[1].x, c[1].y, c[2].x, c[2].y),
      new Line(c[2].x, c[2].y, c[3].x, c[3].y),
      new Line(c[3].x, c[3].y, c[0].x, c[0].y)
    ];
  }

  get perimeter() {
    return 2 * (this._width + this._height);
  }

  get area() {
    return this._width * this._height;
  }

  getBoundingBox() {
    return new BoundingBox(
      this._x, this._y,
      this._x + this._width, this._y + this._height
    );
  }

  distanceToPoint(point) {
    let minDist = Infinity;
    for (const edge of this.edges) {
      const d = edge.distanceToPoint(point);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  containsPoint(point) {
    return point.x >= this._x && point.x <= this._x + this._width &&
           point.y >= this._y && point.y <= this._y + this._height;
  }

  getSnapPoints() {
    const c = this.corners;
    return [
      { point: c[0], type: 'corner', label: 'Angolo' },
      { point: c[1], type: 'corner', label: 'Angolo' },
      { point: c[2], type: 'corner', label: 'Angolo' },
      { point: c[3], type: 'corner', label: 'Angolo' },
      { point: this.center, type: 'center', label: 'Centro' },
      { point: c[0].lerp(c[1], 0.5), type: 'midpoint', label: 'Centro lato' },
      { point: c[1].lerp(c[2], 0.5), type: 'midpoint', label: 'Centro lato' },
      { point: c[2].lerp(c[3], 0.5), type: 'midpoint', label: 'Centro lato' },
      { point: c[3].lerp(c[0], 0.5), type: 'midpoint', label: 'Centro lato' }
    ];
  }

  samplePoints() {
    const c = this.corners;
    return [
      { x: c[0].x, y: c[0].y },
      { x: c[1].x, y: c[1].y },
      { x: c[2].x, y: c[2].y },
      { x: c[3].x, y: c[3].y },
      { x: c[0].x, y: c[0].y } // Close the rectangle
    ];
  }

  draw(ctx, scale = 1) {
    ctx.beginPath();
    ctx.rect(this._x, this._y, this._width, this._height);
    ctx.stroke();
  }

  clone() {
    const rect = new Rectangle(this._x, this._y, this._width, this._height);
    rect.style = { ...this.style };
    rect.layer = this.layer;
    return rect;
  }

  translate(dx, dy) {
    this._x += dx;
    this._y += dy;
  }

  rotate(cx, cy, radians) {
    // Rotate center, keep dimensions (axis-aligned rectangle limitation)
    const rectCenter = this.center;
    const newCenter = Primitive.rotatePoint(rectCenter.x, rectCenter.y, cx, cy, radians);
    this._x = newCenter.x - this._width / 2;
    this._y = newCenter.y - this._height / 2;
    // For 90-degree rotations, swap dimensions
    const degrees = Math.round((radians * 180 / Math.PI) % 360);
    if (degrees === 90 || degrees === -270 || degrees === 270 || degrees === -90) {
      const temp = this._width;
      this._width = this._height;
      this._height = temp;
    }
  }

  scale(cx, cy, factor) {
    const rectCenter = this.center;
    const newCenter = Primitive.scalePoint(rectCenter.x, rectCenter.y, cx, cy, factor);
    this._width *= factor;
    this._height *= factor;
    this._x = newCenter.x - this._width / 2;
    this._y = newCenter.y - this._height / 2;
  }

  mirror(cx, cy, axis) {
    const rectCenter = this.center;
    const newCenter = Primitive.mirrorPoint(rectCenter.x, rectCenter.y, cx, cy, axis);
    this._x = newCenter.x - this._width / 2;
    this._y = newCenter.y - this._height / 2;
  }

  intersectsBox(minX, minY, maxX, maxY) {
    // Simple AABB overlap test
    return !(this._x + this._width < minX ||
             this._x > maxX ||
             this._y + this._height < minY ||
             this._y > maxY);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      x: this._x,
      y: this._y,
      width: this._width,
      height: this._height
    };
  }

  static fromJSON(data) {
    const rect = new Rectangle(data.x, data.y, data.width, data.height, data.id);
    if (data.style) rect.style = { ...data.style };
    if (data.layer !== undefined) rect.layer = data.layer;
    return rect;
  }

  static fromCorners(p1, p2) {
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);
    return new Rectangle(x, y, width, height);
  }
}

/**
 * Polygon primitive
 */
export class Polygon extends Primitive {
  constructor(points = [], id = null) {
    super('polygon', id);
    this.points = points.map((p, i) => {
      const pt = new Point(p.x, p.y, `${this.id}:P${i}`);
      pt.parent = this;
      return pt;
    });
    this._closed = true;
  }

  get closed() { return this._closed; }
  set closed(v) { this._closed = v; }

  get vertexCount() {
    return this.points.length;
  }

  get edges() {
    const edges = [];
    const n = this.points.length;
    if (n < 2) return edges;

    for (let i = 0; i < n - 1; i++) {
      edges.push(new Line(
        this.points[i].x, this.points[i].y,
        this.points[i + 1].x, this.points[i + 1].y
      ));
    }

    if (this._closed && n > 2) {
      edges.push(new Line(
        this.points[n - 1].x, this.points[n - 1].y,
        this.points[0].x, this.points[0].y
      ));
    }

    return edges;
  }

  get center() {
    if (this.points.length === 0) return new Vector2(0, 0);

    let sumX = 0, sumY = 0;
    for (const p of this.points) {
      sumX += p.x;
      sumY += p.y;
    }
    return new Vector2(sumX / this.points.length, sumY / this.points.length);
  }

  get perimeter() {
    let len = 0;
    for (const edge of this.edges) {
      len += edge.length;
    }
    return len;
  }

  /**
   * Calculate signed area (positive = CCW, negative = CW)
   */
  get signedArea() {
    let area = 0;
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += this.points[i].x * this.points[j].y;
      area -= this.points[j].x * this.points[i].y;
    }
    return area / 2;
  }

  get area() {
    return Math.abs(this.signedArea);
  }

  get isClockwise() {
    return this.signedArea < 0;
  }

  addPoint(point) {
    const pt = new Point(point.x, point.y, `${this.id}:P${this.points.length}`);
    pt.parent = this;
    this.points.push(pt);
  }

  getBoundingBox() {
    return BoundingBox.fromPoints(this.points);
  }

  distanceToPoint(point) {
    let minDist = Infinity;
    for (const edge of this.edges) {
      const d = edge.distanceToPoint(point);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /**
   * Check if point is inside polygon (ray casting)
   */
  containsPoint(point) {
    if (!this._closed || this.points.length < 3) return false;

    let inside = false;
    const n = this.points.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = this.points[i].x, yi = this.points[i].y;
      const xj = this.points[j].x, yj = this.points[j].y;

      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  getSnapPoints() {
    const snaps = [];

    // Vertices
    for (let i = 0; i < this.points.length; i++) {
      snaps.push({
        point: this.points[i].clone(),
        type: 'vertex',
        label: `Vertice ${i + 1}`
      });
    }

    // Edge midpoints
    const edges = this.edges;
    for (let i = 0; i < edges.length; i++) {
      snaps.push({
        point: edges[i].midpoint,
        type: 'midpoint',
        label: 'Centro lato'
      });
    }

    // Center
    snaps.push({
      point: this.center,
      type: 'center',
      label: 'Centro'
    });

    return snaps;
  }

  samplePoints() {
    const points = this.points.map(p => ({ x: p.x, y: p.y }));
    if (this._closed && points.length > 2) {
      points.push({ x: this.points[0].x, y: this.points[0].y });
    }
    return points;
  }

  draw(ctx, scale = 1) {
    if (this.points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);

    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }

    if (this._closed) {
      ctx.closePath();
    }

    ctx.stroke();
  }

  clone() {
    const poly = new Polygon(this.points.map(p => ({ x: p.x, y: p.y })));
    poly._closed = this._closed;
    poly.style = { ...this.style };
    poly.layer = this.layer;
    return poly;
  }

  translate(dx, dy) {
    this.points = this.points.map((p, i) => {
      const pt = new Point(p.x + dx, p.y + dy, `${this.id}:P${i}`);
      pt.parent = this;
      return pt;
    });
  }

  rotate(cx, cy, radians) {
    this.points = this.points.map((p, i) => {
      const newP = Primitive.rotatePoint(p.x, p.y, cx, cy, radians);
      const pt = new Point(newP.x, newP.y, `${this.id}:P${i}`);
      pt.parent = this;
      return pt;
    });
  }

  scale(cx, cy, factor) {
    this.points = this.points.map((p, i) => {
      const newP = Primitive.scalePoint(p.x, p.y, cx, cy, factor);
      const pt = new Point(newP.x, newP.y, `${this.id}:P${i}`);
      pt.parent = this;
      return pt;
    });
  }

  mirror(cx, cy, axis) {
    this.points = this.points.map((p, i) => {
      const newP = Primitive.mirrorPoint(p.x, p.y, cx, cy, axis);
      const pt = new Point(newP.x, newP.y, `${this.id}:P${i}`);
      pt.parent = this;
      return pt;
    });
  }

  intersectsBox(minX, minY, maxX, maxY) {
    // Check if any vertex is inside the box
    for (const p of this.points) {
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
        return true;
      }
    }
    // Check if any edge intersects the box
    for (const edge of this.edges) {
      if (edge.intersectsBox(minX, minY, maxX, maxY)) {
        return true;
      }
    }
    return false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      points: this.points.map(p => ({ x: p.x, y: p.y })),
      closed: this._closed
    };
  }

  static fromJSON(data) {
    const poly = new Polygon(data.points, data.id);
    poly._closed = data.closed !== false;
    if (data.style) poly.style = { ...data.style };
    if (data.layer !== undefined) poly.layer = data.layer;
    return poly;
  }

  /**
   * Create regular polygon
   */
  static regular(center, radius, sides, startAngle = 0) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + (i / sides) * TWO_PI;
      points.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      });
    }
    return new Polygon(points);
  }
}

/**
 * Polyline primitive (open polygon)
 */
export class Polyline extends Polygon {
  constructor(points = [], id = null) {
    super(points, id);
    this.type = 'polyline';
    this._closed = false;
  }

  clone() {
    const poly = new Polyline(this.points.map(p => ({ x: p.x, y: p.y })));
    poly.style = { ...this.style };
    poly.layer = this.layer;
    return poly;
  }

  static fromJSON(data) {
    const poly = new Polyline(data.points, data.id);
    if (data.style) poly.style = { ...data.style };
    if (data.layer !== undefined) poly.layer = data.layer;
    return poly;
  }
}

/**
 * Factory function to create primitive from JSON
 */
export function createPrimitiveFromJSON(data) {
  switch (data.type) {
    case 'line':
      return Line.fromJSON(data);
    case 'arc':
      return Arc.fromJSON(data);
    case 'circle':
      return Circle.fromJSON(data);
    case 'rectangle':
      return Rectangle.fromJSON(data);
    case 'polygon':
      return Polygon.fromJSON(data);
    case 'polyline':
      return Polyline.fromJSON(data);
    default:
      throw new Error(`Unknown primitive type: ${data.type}`);
  }
}
