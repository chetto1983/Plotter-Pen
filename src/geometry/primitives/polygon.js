/**
 * Polygon and Polyline primitives
 */

import { TWO_PI, Vector2, Point, BoundingBox } from '../core.js';
import { Primitive } from './base.js';
import { Line } from './line.js';

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

  draw(ctx, _scale = 1) {
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
    poly.layerId = this.layerId;
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
    if (data.layerId !== undefined) poly.layerId = data.layerId;
    else if (data.layer !== undefined) poly.layerId = data.layer;
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

export class Polyline extends Polygon {
  constructor(points = [], id = null) {
    super(points, id);
    this.type = 'polyline';
    this._closed = false;
  }

  clone() {
    const poly = new Polyline(this.points.map(p => ({ x: p.x, y: p.y })));
    poly.style = { ...this.style };
    poly.layerId = this.layerId;
    return poly;
  }

  static fromJSON(data) {
    const poly = new Polyline(data.points, data.id);
    if (data.style) poly.style = { ...data.style };
    if (data.layerId !== undefined) poly.layerId = data.layerId;
    else if (data.layer !== undefined) poly.layerId = data.layer;
    return poly;
  }
}

export default Polygon;
