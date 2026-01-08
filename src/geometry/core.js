/**
 * Core Geometry Module - Foundation for all geometric operations
 * Inspired by JSketcher and AutoCAD patterns
 */

export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const TOLERANCE = 1e-6;
export const VISUAL_TOLERANCE = 1e-3;

/**
 * Normalize angle to [0, 2PI)
 */
export function normalizeAngle(angle) {
  angle = angle % TWO_PI;
  if (angle < 0) angle += TWO_PI;
  return angle;
}

/**
 * Normalize angle to [-PI, PI]
 */
export function normalizeAngleSigned(angle) {
  angle = angle % TWO_PI;
  if (angle > Math.PI) angle -= TWO_PI;
  if (angle < -Math.PI) angle += TWO_PI;
  return angle;
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians) {
  return radians * 180 / Math.PI;
}

/**
 * Check if two values are approximately equal
 */
export function areEqual(a, b, tolerance = TOLERANCE) {
  return Math.abs(a - b) < tolerance;
}

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Calculate distance between two points (coordinates)
 */
export function distance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate squared distance (faster, no sqrt)
 */
export function distanceSquared(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

/**
 * Calculate perpendicular distance from point to line segment
 * @param {number} px - Point x
 * @param {number} py - Point y
 * @param {number} x1 - Segment start x
 * @param {number} y1 - Segment start y
 * @param {number} x2 - Segment end x
 * @param {number} y2 - Segment end y
 * @returns {number} Distance from point to nearest point on segment
 */
export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < TOLERANCE) {
    return distance(px, py, x1, y1);
  }

  // Project point onto line, clamped to segment
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return distance(px, py, x1 + t * dx, y1 + t * dy);
}


/**
 * 2D Vector class with chainable operations
 */
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static from(point) {
    return new Vector2(point.x, point.y);
  }

  static fromAngle(angle, length = 1) {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  addSelf(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  subSelf(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }

  scaleSelf(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSquared() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len > TOLERANCE) {
      return new Vector2(this.x / len, this.y / len);
    }
    return new Vector2(0, 0);
  }

  normalizeSelf() {
    const len = this.length();
    if (len > TOLERANCE) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  angle() {
    return Math.atan2(this.y, this.x);
  }

  angleTo(v) {
    return Math.atan2(this.cross(v), this.dot(v));
  }

  perpendicular() {
    return new Vector2(-this.y, this.x);
  }

  perpendicularSelf() {
    const temp = this.x;
    this.x = -this.y;
    this.y = temp;
    return this;
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  rotateSelf(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  distanceTo(v) {
    return distance(this.x, this.y, v.x, v.y);
  }

  lerp(v, t) {
    return new Vector2(
      lerp(this.x, v.x, t),
      lerp(this.y, v.y, t)
    );
  }

  equals(v, tolerance = TOLERANCE) {
    return areEqual(this.x, v.x, tolerance) && areEqual(this.y, v.y, tolerance);
  }

  toArray() {
    return [this.x, this.y];
  }

  toString() {
    return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }
}

/**
 * Point class - extends Vector2 with ID and parent reference
 */
export class Point extends Vector2 {
  constructor(x = 0, y = 0, id = null) {
    super(x, y);
    this.id = id;
    this.parent = null;
  }

  clone() {
    const p = new Point(this.x, this.y, this.id);
    p.parent = this.parent;
    return p;
  }

  setFromPoint(p) {
    this.x = p.x;
    this.y = p.y;
    return this;
  }
}

/**
 * Bounding Box class
 */
export class BoundingBox {
  constructor(minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }

  static fromPoints(points) {
    const bb = new BoundingBox();
    for (const p of points) {
      bb.expandByPoint(p);
    }
    return bb;
  }

  get width() {
    return this.maxX - this.minX;
  }

  get height() {
    return this.maxY - this.minY;
  }

  get center() {
    return new Vector2(
      (this.minX + this.maxX) / 2,
      (this.minY + this.maxY) / 2
    );
  }

  isEmpty() {
    return this.maxX < this.minX || this.maxY < this.minY;
  }

  expandByPoint(p) {
    this.minX = Math.min(this.minX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxX = Math.max(this.maxX, p.x);
    this.maxY = Math.max(this.maxY, p.y);
    return this;
  }

  expandByBox(box) {
    this.minX = Math.min(this.minX, box.minX);
    this.minY = Math.min(this.minY, box.minY);
    this.maxX = Math.max(this.maxX, box.maxX);
    this.maxY = Math.max(this.maxY, box.maxY);
    return this;
  }

  expand(delta) {
    this.minX -= delta;
    this.minY -= delta;
    this.maxX += delta;
    this.maxY += delta;
    return this;
  }

  containsPoint(p) {
    return p.x >= this.minX && p.x <= this.maxX &&
      p.y >= this.minY && p.y <= this.maxY;
  }

  intersects(box) {
    return this.maxX >= box.minX && this.minX <= box.maxX &&
      this.maxY >= box.minY && this.minY <= box.maxY;
  }

  clone() {
    return new BoundingBox(this.minX, this.minY, this.maxX, this.maxY);
  }
}

/**
 * Transform2D - 2D transformation matrix
 */
export class Transform2D {
  constructor() {
    // Identity matrix
    this.a = 1;  // scale x
    this.b = 0;  // skew y
    this.c = 0;  // skew x
    this.d = 1;  // scale y
    this.e = 0;  // translate x
    this.f = 0;  // translate y
  }

  static identity() {
    return new Transform2D();
  }

  static translation(tx, ty) {
    const t = new Transform2D();
    t.e = tx;
    t.f = ty;
    return t;
  }

  static rotation(angle, cx = 0, cy = 0) {
    const t = new Transform2D();
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    t.a = cos;
    t.b = sin;
    t.c = -sin;
    t.d = cos;
    t.e = cx - cx * cos + cy * sin;
    t.f = cy - cx * sin - cy * cos;
    return t;
  }

  static scale(sx, sy = sx, cx = 0, cy = 0) {
    const t = new Transform2D();
    t.a = sx;
    t.d = sy;
    t.e = cx - cx * sx;
    t.f = cy - cy * sy;
    return t;
  }

  clone() {
    const t = new Transform2D();
    t.a = this.a;
    t.b = this.b;
    t.c = this.c;
    t.d = this.d;
    t.e = this.e;
    t.f = this.f;
    return t;
  }

  multiply(other) {
    const t = new Transform2D();
    t.a = this.a * other.a + this.c * other.b;
    t.b = this.b * other.a + this.d * other.b;
    t.c = this.a * other.c + this.c * other.d;
    t.d = this.b * other.c + this.d * other.d;
    t.e = this.a * other.e + this.c * other.f + this.e;
    t.f = this.b * other.e + this.d * other.f + this.f;
    return t;
  }

  transformPoint(p) {
    return new Vector2(
      this.a * p.x + this.c * p.y + this.e,
      this.b * p.x + this.d * p.y + this.f
    );
  }

  transformVector(v) {
    return new Vector2(
      this.a * v.x + this.c * v.y,
      this.b * v.x + this.d * v.y
    );
  }

  invert() {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < TOLERANCE) return null;

    const t = new Transform2D();
    t.a = this.d / det;
    t.b = -this.b / det;
    t.c = -this.c / det;
    t.d = this.a / det;
    t.e = (this.c * this.f - this.d * this.e) / det;
    t.f = (this.b * this.e - this.a * this.f) / det;
    return t;
  }

  applyToContext(ctx) {
    ctx.setTransform(this.a, this.b, this.c, this.d, this.e, this.f);
  }
}
