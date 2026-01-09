/**
 * Line Segment primitive
 */

import {
  TOLERANCE,
  VISUAL_TOLERANCE,
  clamp,
  Vector2,
  Point,
  BoundingBox
} from '../core.js';
import { Primitive } from './base.js';

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


  samplePoints(_resolution = 1) {
    return [
      { x: this.a.x, y: this.a.y },
      { x: this.b.x, y: this.b.y }
    ];
  }


  draw(ctx, _scale = 1) {
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

export default Line;
