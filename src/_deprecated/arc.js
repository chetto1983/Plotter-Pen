/**
 * Arc Class - Three-Point Model (inspired by JSketcher)
 * Defines arcs using start point (a), end point (b), and center point (c)
 * This provides a clean, unambiguous representation for any arc configuration
 */

const TWO_PI = Math.PI * 2;
const TOLERANCE = 1e-6;

/**
 * Normalize angle to [0, 2PI)
 */
export function normalizeAngle(angle) {
  angle = angle % TWO_PI;
  if (angle < 0) angle += TWO_PI;
  return angle;
}

/**
 * Check if two values are approximately equal
 */
export function areEqual(a, b, tolerance = TOLERANCE) {
  return Math.abs(a - b) < tolerance;
}

/**
 * Calculate distance between two points
 */
export function distance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate distance between two point objects
 */
export function distancePoints(a, b) {
  return distance(a.x, a.y, b.x, b.y);
}

/**
 * Vector operations
 */
export class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy() {
    return new Vector(this.x, this.y);
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const len = this.length();
    if (len > TOLERANCE) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  multiply(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  cross(other) {
    return this.x * other.y - this.y * other.x;
  }

  minus(other) {
    return new Vector(this.x - other.x, this.y - other.y);
  }

  plus(other) {
    return new Vector(this.x + other.x, this.y + other.y);
  }
}

/**
 * Point class with parent reference
 */
export class Point {
  constructor(x = 0, y = 0, id = null) {
    this.x = x;
    this.y = y;
    this.id = id;
    this.parent = null;
  }

  setFromPoint(p) {
    this.x = p.x;
    this.y = p.y;
  }

  copy() {
    return new Point(this.x, this.y, this.id);
  }

  distanceTo(other) {
    return distance(this.x, this.y, other.x, other.y);
  }
}

/**
 * Arc class using three-point model
 * a = start point
 * b = end point
 * c = center point
 */
export class Arc {
  constructor(ax, ay, bx, by, cx, cy, id = null) {
    this.id = id || `arc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Three defining points
    this.a = new Point(ax, ay, `${this.id}:A`); // Start
    this.b = new Point(bx, by, `${this.id}:B`); // End
    this.c = new Point(cx, cy, `${this.id}:C`); // Center

    // Set parent references
    this.a.parent = this;
    this.b.parent = this;
    this.c.parent = this;

    // Cached parameters (derived from points)
    this._radius = 0;
    this._startAngle = 0;
    this._endAngle = 0;

    this.syncGeometry();
  }

  /**
   * Synchronize cached parameters from the three points
   */
  syncGeometry() {
    this._radius = this.distanceA();
    this._startAngle = this.calcStartAngle();
    this._endAngle = this.calcEndAngle();
  }

  /**
   * Calculate start angle from center to point A
   */
  calcStartAngle() {
    return Math.atan2(this.a.y - this.c.y, this.a.x - this.c.x);
  }

  /**
   * Calculate end angle from center to point B
   */
  calcEndAngle() {
    return Math.atan2(this.b.y - this.c.y, this.b.x - this.c.x);
  }

  /**
   * Distance from center to start point
   */
  distanceA() {
    return distance(this.a.x, this.a.y, this.c.x, this.c.y);
  }

  /**
   * Distance from center to end point
   */
  distanceB() {
    return distance(this.b.x, this.b.y, this.c.x, this.c.y);
  }

  /**
   * Get radius (use distanceA as authoritative)
   */
  get radius() {
    return Math.max(this._radius, TOLERANCE);
  }

  /**
   * Get start angle
   */
  get startAngle() {
    return this._startAngle;
  }

  /**
   * Get end angle
   */
  get endAngle() {
    return this._endAngle;
  }

  /**
   * Calculate sweep angle (positive = CCW in math coords, CW in canvas)
   */
  get sweep() {
    let sweep = this._endAngle - this._startAngle;
    // Normalize to [-2PI, 2PI]
    while (sweep > Math.PI) sweep -= TWO_PI;
    while (sweep < -Math.PI) sweep += TWO_PI;
    return sweep;
  }

  /**
   * Get direction string
   */
  get direction() {
    return this.sweep >= 0 ? 'CCW' : 'CW';
  }

  /**
   * Check if a point is inside the arc's sector
   * Uses cross product method from JSketcher
   */
  isPointInsideSector(x, y) {
    const ca = new Vector(this.a.x - this.c.x, this.a.y - this.c.y).normalize();
    const cb = new Vector(this.b.x - this.c.x, this.b.y - this.c.y).normalize();
    const ct = new Vector(x - this.c.x, y - this.c.y).normalize();

    const cosAB = ca.dot(cb);
    const cosAT = ca.dot(ct);
    const isInside = cosAT >= cosAB;

    const abCross = ca.cross(cb);
    const atCross = ca.cross(ct);

    // Handle direction
    if (abCross < 0) {
      return atCross >= 0 || !isInside;
    } else {
      return atCross >= 0 && isInside;
    }
  }

  /**
   * Calculate distance from a point to the arc
   */
  normalDistance(point) {
    const isInside = this.isPointInsideSector(point.x, point.y);

    if (isInside) {
      // Point in sector: distance to arc curve
      const distToCenter = distance(point.x, point.y, this.c.x, this.c.y);
      return Math.abs(distToCenter - this.radius);
    } else {
      // Point outside sector: distance to nearest endpoint
      return Math.min(
        distance(point.x, point.y, this.a.x, this.a.y),
        distance(point.x, point.y, this.b.x, this.b.y)
      );
    }
  }

  /**
   * Get midpoint on the arc
   */
  getMidpoint() {
    const midAngle = this._startAngle + this.sweep / 2;
    return {
      x: this.c.x + this.radius * Math.cos(midAngle),
      y: this.c.y + this.radius * Math.sin(midAngle)
    };
  }

  /**
   * Sample points along the arc for rendering
   */
  samplePoints(minSegments = 16, maxStepAngle = Math.PI / 36) {
    const totalAngle = Math.abs(this.sweep);
    const steps = Math.max(minSegments, Math.ceil(totalAngle / maxStepAngle));
    const points = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = this._startAngle + this.sweep * t;
      points.push({
        x: this.c.x + this.radius * Math.cos(angle),
        y: this.c.y + this.radius * Math.sin(angle)
      });
    }

    // Snap first and last to exact endpoints
    if (points.length > 0) {
      points[0] = { x: this.a.x, y: this.a.y };
      points[points.length - 1] = { x: this.b.x, y: this.b.y };
    }

    return points;
  }

  /**
   * Get rendering data for canvas arc() method
   */
  getRenderData() {
    const startNorm = normalizeAngle(this._startAngle);
    const endNorm = normalizeAngle(this._endAngle);

    // Check for full circle
    const isFullCircle = areEqual(this.a.x, this.b.x) && areEqual(this.a.y, this.b.y);

    return {
      cx: this.c.x,
      cy: this.c.y,
      r: this.radius,
      startAngle: startNorm,
      endAngle: isFullCircle ? startNorm + TWO_PI : endNorm,
      anticlockwise: this.sweep < 0
    };
  }

  /**
   * Serialize arc data
   */
  toJSON() {
    return {
      id: this.id,
      a: { x: this.a.x, y: this.a.y },
      b: { x: this.b.x, y: this.b.y },
      c: { x: this.c.x, y: this.c.y },
      radius: this.radius,
      startAngle: this._startAngle,
      endAngle: this._endAngle,
      sweep: this.sweep,
      direction: this.direction
    };
  }

  /**
   * Create arc from JSON
   */
  static fromJSON(data) {
    return new Arc(
      data.a.x, data.a.y,
      data.b.x, data.b.y,
      data.c.x, data.c.y,
      data.id
    );
  }
}

/**
 * Arc Builder - Factory methods for creating arcs
 */
export class ArcBuilder {
  /**
   * Create arc from three points (start, through, end)
   * The most intuitive method - pick three points on the arc
   */
  static fromThreePoints(start, through, end) {
    const circle = ArcBuilder.circleFromThreePoints(start, through, end);
    if (!circle) return null;

    // Determine direction based on through point position
    const startAngle = Math.atan2(start.y - circle.cy, start.x - circle.cx);
    const throughAngle = Math.atan2(through.y - circle.cy, through.x - circle.cx);
    const endAngle = Math.atan2(end.y - circle.cy, end.x - circle.cx);

    // Normalize angles relative to start
    const normalizedThrough = normalizeAngle(throughAngle - startAngle);
    const normalizedEnd = normalizeAngle(endAngle - startAngle);

    // If through point is between start and end going CCW, use CCW
    const useCCW = normalizedThrough <= normalizedEnd;

    // Create arc with correct direction
    const arc = new Arc(start.x, start.y, end.x, end.y, circle.cx, circle.cy);

    // Verify direction matches through point
    const midpoint = arc.getMidpoint();
    const midDist = distance(midpoint.x, midpoint.y, through.x, through.y);

    // If midpoint is far from through point, we have wrong direction
    // In this case, swap start and end
    if (midDist > circle.r * 0.5) {
      return new Arc(end.x, end.y, start.x, start.y, circle.cx, circle.cy);
    }

    return arc;
  }

  /**
   * Create arc from center, start point, and end angle
   * AutoCAD style: specify center, then radius via start point, then sweep angle
   */
  static fromCenterStartAngle(center, startPoint, endAngle) {
    const radius = distance(startPoint.x, startPoint.y, center.x, center.y);
    if (radius < TOLERANCE) return null;

    const endX = center.x + radius * Math.cos(endAngle);
    const endY = center.y + radius * Math.sin(endAngle);

    return new Arc(startPoint.x, startPoint.y, endX, endY, center.x, center.y);
  }

  /**
   * Create arc from center, radius, start angle, and end angle
   */
  static fromCenterRadiusAngles(center, radius, startAngle, endAngle) {
    if (radius < TOLERANCE) return null;

    const startX = center.x + radius * Math.cos(startAngle);
    const startY = center.y + radius * Math.sin(startAngle);
    const endX = center.x + radius * Math.cos(endAngle);
    const endY = center.y + radius * Math.sin(endAngle);

    return new Arc(startX, startY, endX, endY, center.x, center.y);
  }

  /**
   * Create arc from start, end, and radius
   * Can create two arcs (major/minor) - direction parameter chooses which
   */
  static fromStartEndRadius(start, end, radius, useMinorArc = true) {
    const chord = distance(start.x, start.y, end.x, end.y);
    if (chord > 2 * radius) return null; // Impossible arc
    if (chord < TOLERANCE) return null;

    // Calculate center
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Direction perpendicular to chord
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    // Distance from chord midpoint to center
    const h = Math.sqrt(radius * radius - (chord / 2) * (chord / 2));

    // Two possible centers
    const cx1 = midX + h * perpX;
    const cy1 = midY + h * perpY;
    const cx2 = midX - h * perpX;
    const cy2 = midY - h * perpY;

    // Choose center based on minor/major arc preference
    // Minor arc has center on the same side as the shorter path
    const arc1 = new Arc(start.x, start.y, end.x, end.y, cx1, cy1);
    const arc2 = new Arc(start.x, start.y, end.x, end.y, cx2, cy2);

    if (useMinorArc) {
      return Math.abs(arc1.sweep) < Math.abs(arc2.sweep) ? arc1 : arc2;
    } else {
      return Math.abs(arc1.sweep) > Math.abs(arc2.sweep) ? arc1 : arc2;
    }
  }

  /**
   * Create arc from start, end, and bulge (signed height)
   * Bulge is the signed perpendicular distance from chord midpoint to arc midpoint
   */
  static fromStartEndBulge(start, end, bulge) {
    if (Math.abs(bulge) < TOLERANCE) {
      // Essentially a line
      return null;
    }

    const chord = distance(start.x, start.y, end.x, end.y);
    if (chord < TOLERANCE) return null;

    // Calculate radius from bulge
    // bulge = r - sqrt(r^2 - (chord/2)^2) for minor arc
    // Solving for r: r = (bulge^2 + (chord/2)^2) / (2 * |bulge|)
    const halfChord = chord / 2;
    const radius = (bulge * bulge + halfChord * halfChord) / (2 * Math.abs(bulge));

    // Direction perpendicular to chord
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    // Midpoint of chord
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Distance from chord midpoint to center
    const h = Math.sqrt(Math.max(0, radius * radius - halfChord * halfChord));

    // Choose direction based on bulge sign
    const sign = bulge > 0 ? 1 : -1;
    const cx = midX + (h - Math.abs(bulge)) * perpX * sign;
    const cy = midY + (h - Math.abs(bulge)) * perpY * sign;

    // Actually, simpler: center is at distance 'h' from midpoint, opposite to bulge direction
    const cx2 = midX - h * perpX * sign;
    const cy2 = midY - h * perpY * sign;

    return new Arc(start.x, start.y, end.x, end.y, cx2, cy2);
  }

  /**
   * Calculate circle from three points
   */
  static circleFromThreePoints(p1, p2, p3) {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    if (Math.abs(d) < TOLERANCE) return null; // Collinear points

    const p1Sq = p1.x * p1.x + p1.y * p1.y;
    const p2Sq = p2.x * p2.x + p2.y * p2.y;
    const p3Sq = p3.x * p3.x + p3.y * p3.y;

    const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
    const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
    const r = Math.sqrt((p1.x - cx) * (p1.x - cx) + (p1.y - cy) * (p1.y - cy));

    if (!Number.isFinite(r) || r < TOLERANCE) return null;

    return { cx, cy, r };
  }
}

/**
 * Arc creation modes (AutoCAD style)
 */
export const ARC_MODES = {
  THREE_POINT: '3point',           // Start, Through, End
  CENTER_START_END: 'cse',         // Center, Start, End
  CENTER_START_ANGLE: 'csa',       // Center, Start, Angle
  START_CENTER_END: 'sce',         // Start, Center, End
  START_CENTER_ANGLE: 'sca',       // Start, Center, Angle
  START_END_RADIUS: 'ser',         // Start, End, Radius
  START_END_BULGE: 'seb'           // Start, End, Bulge (current behavior)
};

export default Arc;
