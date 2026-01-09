/**
 * Circle primitive
 */

import {
  TWO_PI,
  TOLERANCE,
  distance,
  Vector2,
  Point,
  BoundingBox
} from '../core.js';
import { Primitive } from './base.js';

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

  draw(ctx, _scale = 1) {
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

export default Circle;
