/**
 * Arc primitive - Three point model (start, end, center)
 */

import {
  TWO_PI,
  HALF_PI,
  TOLERANCE,
  normalizeAngle,
  distance,
  areEqual,
  Vector2,
  Point,
  BoundingBox
} from '../core.js';
import { Primitive } from './base.js';

export class Arc extends Primitive {
  constructor(ax, ay, bx, by, cx, cy, clockwise = null, id = null) {
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

    // Explicit direction flag (null = auto-detect on first sync)
    this._clockwise = clockwise;

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

    // If direction is already set, preserve it
    if (this._clockwise !== null) {
      // For clockwise: sweep should be negative
      // For counter-clockwise: sweep should be positive
      if (this._clockwise) {
        // Want clockwise (negative sweep)
        while (sweep > 0) sweep -= TWO_PI;
        if (sweep < -TWO_PI + TOLERANCE) sweep += TWO_PI;
      } else {
        // Want counter-clockwise (positive sweep)
        while (sweep < 0) sweep += TWO_PI;
        if (sweep > TWO_PI - TOLERANCE) sweep -= TWO_PI;
      }
    } else {
      // First time: auto-detect based on smaller arc
      if (sweep > Math.PI) sweep -= TWO_PI;
      if (sweep < -Math.PI) sweep += TWO_PI;
      // Store detected direction
      this._clockwise = sweep < 0;
    }

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
   * Get midpoint on arc (the point halfway along the drawn arc)
   * Must match exactly how canvas renders the arc visually on screen (Y-axis down)
   */
  get midpoint() {
    const { startAngle, endAngle, anticlockwise } = this.getRenderData();

    // Canvas arc() draws from startAngle to endAngle:
    // - anticlockwise=true: goes in INCREASING angle direction (math CCW)
    // - anticlockwise=false: goes in DECREASING angle direction (math CW)
    //
    // To find the midpoint ON THE DRAWN ARC, we must follow the same direction.

    let midAngle;
    if (anticlockwise) {
      // Canvas goes in DECREASING angle direction
      let sweep = startAngle - endAngle;
      if (sweep < 0) sweep += TWO_PI;
      midAngle = startAngle - sweep / 2;
    } else {
      // Canvas goes in INCREASING angle direction
      let sweep = endAngle - startAngle;
      if (sweep < 0) sweep += TWO_PI;
      midAngle = startAngle + sweep / 2;
    }

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
      this.c.x, this.c.y,
      this._clockwise
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
    // Mirror reverses direction (CW <-> CCW)
    this._clockwise = !this._clockwise;
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
      cy: this.c.y,
      clockwise: this._clockwise
    };
  }

  static fromJSON(data) {
    const arc = new Arc(
      data.ax, data.ay,
      data.bx, data.by,
      data.cx, data.cy,
      data.clockwise !== undefined ? data.clockwise : null,
      data.id
    );
    if (data.style) arc.style = { ...data.style };
    if (data.layer !== undefined) arc.layer = data.layer;
    return arc;
  }
}

export default Arc;
