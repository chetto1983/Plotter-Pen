/**
 * Rectangle primitive (axis-aligned)
 */

import { Vector2, BoundingBox } from '../core.js';
import { Primitive } from './base.js';
import { Line } from './line.js';

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

  draw(ctx, _scale = 1) {
    ctx.beginPath();
    ctx.rect(this._x, this._y, this._width, this._height);
    ctx.stroke();
  }

  clone() {
    const rect = new Rectangle(this._x, this._y, this._width, this._height);
    rect.style = { ...this.style };
    rect.layerId = this.layerId;
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
    if (data.layerId !== undefined) rect.layerId = data.layerId;
    else if (data.layer !== undefined) rect.layerId = data.layer;
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

export default Rectangle;
