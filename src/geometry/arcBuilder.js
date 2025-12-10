/**
 * Arc Builder - Factory methods for creating arcs with different input modes
 * Inspired by AutoCAD arc creation methods
 */

import { TWO_PI, TOLERANCE, normalizeAngle, distance, Vector2 } from './core.js';
import { Arc } from './primitives.js';

/**
 * Arc creation modes (AutoCAD style)
 */
export const ARC_MODES = {
  THREE_POINT: '3point',           // Start, Through, End (default)
  CENTER_START_END: 'cse',         // Center, Start, End
  CENTER_START_ANGLE: 'csa',       // Center, Start, Angle
  START_CENTER_END: 'sce',         // Start, Center, End
  START_CENTER_ANGLE: 'sca',       // Start, Center, Angle
  START_END_RADIUS: 'ser',         // Start, End, Radius
  START_END_BULGE: 'seb',          // Start, End, Bulge
  START_END_DIRECTION: 'sed'       // Start, End, Start Direction
};

/**
 * Arc Builder class with multiple creation methods
 */
export class ArcBuilder {

  /**
   * Create arc from three points (start, through, end)
   * Most intuitive - pick three points on the arc
   */
  static fromThreePoints(start, through, end) {
    console.log('fromThreePoints called with:',
      'start:', start.x?.toFixed(1), start.y?.toFixed(1),
      'through:', through.x?.toFixed(1), through.y?.toFixed(1),
      'end:', end.x?.toFixed(1), end.y?.toFixed(1));
    const circle = ArcBuilder.circleFromThreePoints(start, through, end);
    if (!circle) return null;

    // Calculate angles from center to each point
    const startAngle = Math.atan2(start.y - circle.cy, start.x - circle.cx);
    const throughAngle = Math.atan2(through.y - circle.cy, through.x - circle.cx);
    const endAngle = Math.atan2(end.y - circle.cy, end.x - circle.cx);

    // Determine direction by checking which way around the circle
    // we need to go from start to end to pass through the 'through' point

    // Normalize angles relative to start (all in [0, 2π))
    let throughRel = throughAngle - startAngle;
    let endRel = endAngle - startAngle;

    while (throughRel < 0) throughRel += 2 * Math.PI;
    while (throughRel >= 2 * Math.PI) throughRel -= 2 * Math.PI;
    while (endRel < 0) endRel += 2 * Math.PI;
    while (endRel >= 2 * Math.PI) endRel -= 2 * Math.PI;

    // If throughRel < endRel, then going CCW (positive angle direction)
    // from start, we hit 'through' before 'end' - this is the CCW arc
    // If throughRel > endRel, then going CW (negative angle direction)
    // from start, we hit 'through' before 'end' - this is the CW arc
    //
    // clockwise = true means negative sweep (CW in math coords)
    // In screen coordinates with Y down, this visually appears CCW
    const clockwise = throughRel > endRel;

    const arc = new Arc(
      start.x, start.y,
      end.x, end.y,
      circle.cx, circle.cy,
      clockwise
    );

    // Store the through point as the actual midpoint/aux point
    // This is the point the user clicked, so it's definitely on the correct side
    arc._throughPoint = { x: through.x, y: through.y };
    console.log('fromThreePoints: set _throughPoint to', arc._throughPoint);

    return arc;
  }

  /**
   * Create arc from center, start point, and end point
   * The end point is projected onto the circle defined by center and start
   */
  static fromCenterStartEnd(center, startPoint, endPoint) {
    const radius = distance(startPoint.x, startPoint.y, center.x, center.y);
    if (radius < TOLERANCE) return null;

    // Project end point onto circle
    const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
    const projectedEndX = center.x + radius * Math.cos(endAngle);
    const projectedEndY = center.y + radius * Math.sin(endAngle);

    return new Arc(
      startPoint.x, startPoint.y,
      projectedEndX, projectedEndY,
      center.x, center.y
    );
  }

  /**
   * Create arc from center, start point, and sweep angle (in radians)
   */
  static fromCenterStartAngle(center, startPoint, sweepAngle) {
    const radius = distance(startPoint.x, startPoint.y, center.x, center.y);
    if (radius < TOLERANCE) return null;

    const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
    const endAngle = startAngle + sweepAngle;

    const endX = center.x + radius * Math.cos(endAngle);
    const endY = center.y + radius * Math.sin(endAngle);

    return new Arc(
      startPoint.x, startPoint.y,
      endX, endY,
      center.x, center.y
    );
  }

  /**
   * Create arc from start point, center, and end point
   * Similar to center-start-end but with different input order
   */
  static fromStartCenterEnd(startPoint, center, endPoint) {
    return ArcBuilder.fromCenterStartEnd(center, startPoint, endPoint);
  }

  /**
   * Create arc from start point, center, and sweep angle
   */
  static fromStartCenterAngle(startPoint, center, sweepAngle) {
    return ArcBuilder.fromCenterStartAngle(center, startPoint, sweepAngle);
  }

  /**
   * Create arc from start, end, and radius
   * Two possible arcs (minor/major) - controlled by useMinorArc parameter
   * Two possible sides - controlled by clockwise parameter
   */
  static fromStartEndRadius(start, end, radius, useMinorArc = true, clockwise = false) {
    const chord = distance(start.x, start.y, end.x, end.y);

    // Check if arc is possible
    if (chord > 2 * Math.abs(radius)) return null;
    if (chord < TOLERANCE) return null;
    if (Math.abs(radius) < TOLERANCE) return null;

    const r = Math.abs(radius);

    // Midpoint of chord
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Direction perpendicular to chord
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    // Distance from chord midpoint to center(s)
    const halfChord = chord / 2;
    const h = Math.sqrt(r * r - halfChord * halfChord);

    // Two possible centers
    const centers = [
      { x: midX + h * perpX, y: midY + h * perpY },
      { x: midX - h * perpX, y: midY - h * perpY }
    ];

    // Create both arcs and choose based on parameters
    const arcs = centers.map(c => new Arc(start.x, start.y, end.x, end.y, c.x, c.y));

    // Sort by sweep angle (minor first)
    arcs.sort((a, b) => Math.abs(a.sweep) - Math.abs(b.sweep));

    let arc = useMinorArc ? arcs[0] : arcs[1];

    // If clockwise is requested and arc is CCW (or vice versa), swap
    if (clockwise !== arc.isClockwise) {
      // Try the other center
      arc = useMinorArc ? arcs[1] : arcs[0];

      // If still wrong direction, reverse start/end
      if (clockwise !== arc.isClockwise) {
        arc = new Arc(end.x, end.y, start.x, start.y, arc.cx, arc.cy);
      }
    }

    return arc;
  }

  /**
   * Create arc from start, end, and bulge
   * Bulge is the tangent of 1/4 of the included angle
   * Positive = CCW, Negative = CW
   */
  static fromStartEndBulge(start, end, bulge) {
    if (Math.abs(bulge) < TOLERANCE) return null;

    const chord = distance(start.x, start.y, end.x, end.y);
    if (chord < TOLERANCE) return null;

    // Calculate radius from bulge
    // bulge = tan(theta/4), where theta is the included angle
    // sagitta = r * (1 - cos(theta/2)) = chord/2 * bulge
    const sagitta = Math.abs(bulge) * chord / 2;
    const radius = (sagitta / 2) + (chord * chord) / (8 * sagitta);

    // Midpoint and perpendicular direction
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    // Distance from midpoint to center
    const midToCenter = radius - sagitta;

    // Direction of center from midpoint (opposite to bulge direction)
    const sign = bulge > 0 ? -1 : 1;
    const cx = midX + midToCenter * perpX * sign;
    const cy = midY + midToCenter * perpY * sign;

    // Explicitly set direction: positive bulge = CCW (false), negative bulge = CW (true)
    const clockwise = bulge < 0;
    return new Arc(start.x, start.y, end.x, end.y, cx, cy, clockwise);
  }

  /**
   * Create arc from start, end, and start direction (tangent angle at start)
   */
  static fromStartEndDirection(start, end, directionAngle) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chord = Math.sqrt(dx * dx + dy * dy);

    if (chord < TOLERANCE) return null;

    // Angle from start to end
    const chordAngle = Math.atan2(dy, dx);

    // Angle between direction and chord
    let beta = directionAngle - chordAngle;
    beta = normalizeAngle(beta + Math.PI) - Math.PI; // Normalize to [-PI, PI]

    // If direction is nearly parallel to chord, it's a line
    if (Math.abs(Math.abs(beta) - Math.PI / 2) < TOLERANCE) {
      return null; // Would result in infinite radius
    }

    // Calculate radius
    // Using the formula: r = chord / (2 * sin(beta))
    const radius = chord / (2 * Math.sin(beta));

    // Center is perpendicular to direction at start, at distance radius
    const cx = start.x + radius * Math.cos(directionAngle - Math.PI / 2);
    const cy = start.y + radius * Math.sin(directionAngle - Math.PI / 2);

    return new Arc(start.x, start.y, end.x, end.y, cx, cy);
  }

  /**
   * Calculate circle passing through three points
   */
  static circleFromThreePoints(p1, p2, p3) {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));

    if (Math.abs(d) < TOLERANCE) {
      return null; // Collinear points
    }

    const p1Sq = p1.x * p1.x + p1.y * p1.y;
    const p2Sq = p2.x * p2.x + p2.y * p2.y;
    const p3Sq = p3.x * p3.x + p3.y * p3.y;

    const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
    const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
    const r = Math.sqrt((p1.x - cx) * (p1.x - cx) + (p1.y - cy) * (p1.y - cy));

    if (!Number.isFinite(r) || r < TOLERANCE) {
      return null;
    }

    return { cx, cy, r };
  }

  /**
   * Check if three points are collinear
   */
  static areCollinear(p1, p2, p3, tolerance = TOLERANCE) {
    const d = (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    return Math.abs(d) < tolerance;
  }

  /**
   * Calculate the signed distance from a point to the chord (start-end line)
   * Positive = left of chord, Negative = right of chord
   */
  static signedDistanceToChord(start, end, point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const norm = Math.sqrt(dx * dx + dy * dy);

    if (norm < TOLERANCE) return 0;

    return ((dx * (point.y - start.y)) - (dy * (point.x - start.x))) / norm;
  }

  /**
   * Calculate bulge value from three points
   */
  static calculateBulge(start, end, through) {
    const signedDist = ArcBuilder.signedDistanceToChord(start, end, through);
    const chord = distance(start.x, start.y, end.x, end.y);

    if (chord < TOLERANCE) return 0;

    // Bulge = sagitta / (chord/2) = 2 * sagitta / chord
    // But we need actual sagitta on arc, not just signed distance
    const circle = ArcBuilder.circleFromThreePoints(start, through, end);
    if (!circle) return 0;

    // Calculate sagitta
    const sagitta = circle.r - Math.sqrt(Math.max(0, circle.r * circle.r - (chord / 2) * (chord / 2)));

    // Sign based on which side of chord the through point is
    const sign = signedDist >= 0 ? 1 : -1;

    return sign * (2 * sagitta / chord);
  }
}

/**
 * Interactive Arc Tool State Machine
 */
export class ArcToolState {
  constructor() {
    this.reset();
  }

  reset() {
    this.mode = ARC_MODES.THREE_POINT;
    this.phase = 'idle';
    this.points = [];
    this.preview = null;
    this.tempArc = null;
  }

  /**
   * Get current hint text based on mode and phase
   */
  getHint() {
    const hints = {
      [ARC_MODES.THREE_POINT]: {
        idle: 'Clicca per il punto iniziale dell\'arco',
        point1: 'Clicca per il punto intermedio (sulla curva)',
        point2: 'Clicca per il punto finale'
      },
      [ARC_MODES.CENTER_START_END]: {
        idle: 'Clicca per il centro dell\'arco',
        point1: 'Clicca per il punto iniziale (definisce il raggio)',
        point2: 'Clicca per il punto finale'
      },
      [ARC_MODES.CENTER_START_ANGLE]: {
        idle: 'Clicca per il centro dell\'arco',
        point1: 'Clicca per il punto iniziale',
        point2: 'Muovi per l\'angolo, clicca per confermare'
      },
      [ARC_MODES.START_END_BULGE]: {
        idle: 'Clicca per il punto iniziale',
        point1: 'Clicca per il punto finale',
        point2: 'Muovi per la curvatura, clicca per confermare'
      }
    };

    const modeHints = hints[this.mode] || hints[ARC_MODES.THREE_POINT];
    return modeHints[this.phase] || modeHints.idle;
  }

  /**
   * Add a point and advance state
   */
  addPoint(point) {
    this.points.push({ x: point.x, y: point.y });

    switch (this.phase) {
      case 'idle':
        this.phase = 'point1';
        break;
      case 'point1':
        this.phase = 'point2';
        break;
      case 'point2':
        // Complete - build final arc
        return this.buildArc();
    }

    return null;
  }

  /**
   * Update preview based on current mouse position
   */
  updatePreview(mousePoint) {
    if (this.points.length === 0) {
      this.preview = null;
      this.tempArc = null;
      return;
    }

    this.preview = { x: mousePoint.x, y: mousePoint.y };

    // Build temporary arc for preview
    switch (this.mode) {
      case ARC_MODES.THREE_POINT:
        this.buildThreePointPreview(mousePoint);
        break;
      case ARC_MODES.CENTER_START_END:
        this.buildCenterStartEndPreview(mousePoint);
        break;
      case ARC_MODES.CENTER_START_ANGLE:
        this.buildCenterStartAnglePreview(mousePoint);
        break;
      case ARC_MODES.START_END_BULGE:
        this.buildStartEndBulgePreview(mousePoint);
        break;
      default:
        this.buildThreePointPreview(mousePoint);
    }
  }

  buildThreePointPreview(mousePoint) {
    if (this.points.length === 1) {
      // Show line from start to mouse
      this.tempArc = null;
    } else if (this.points.length === 2) {
      // Build arc preview
      this.tempArc = ArcBuilder.fromThreePoints(
        this.points[0],
        this.points[1],
        mousePoint
      );
    }
  }

  buildCenterStartEndPreview(mousePoint) {
    if (this.points.length === 1) {
      // Show line from center to mouse (radius preview)
      this.tempArc = null;
    } else if (this.points.length === 2) {
      this.tempArc = ArcBuilder.fromCenterStartEnd(
        this.points[0],
        this.points[1],
        mousePoint
      );
    }
  }

  buildCenterStartAnglePreview(mousePoint) {
    if (this.points.length === 1) {
      this.tempArc = null;
    } else if (this.points.length === 2) {
      const center = this.points[0];
      const start = this.points[1];
      const endAngle = Math.atan2(mousePoint.y - center.y, mousePoint.x - center.x);
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
      let sweep = endAngle - startAngle;

      // Normalize sweep
      if (sweep > Math.PI) sweep -= TWO_PI;
      if (sweep < -Math.PI) sweep += TWO_PI;

      this.tempArc = ArcBuilder.fromCenterStartAngle(center, start, sweep);
    }
  }

  buildStartEndBulgePreview(mousePoint) {
    if (this.points.length === 1) {
      this.tempArc = null;
    } else if (this.points.length === 2) {
      const start = this.points[0];
      const end = this.points[1];
      const bulge = ArcBuilder.calculateBulge(start, end, mousePoint);

      if (Math.abs(bulge) > TOLERANCE) {
        this.tempArc = ArcBuilder.fromStartEndBulge(start, end, bulge);
      } else {
        this.tempArc = null;
      }
    }
  }

  /**
   * Build final arc from collected points
   */
  buildArc() {
    if (this.points.length < 2) return null;

    let arc = null;

    switch (this.mode) {
      case ARC_MODES.THREE_POINT:
        if (this.points.length >= 3) {
          arc = ArcBuilder.fromThreePoints(
            this.points[0],
            this.points[1],
            this.points[2]
          );
        }
        break;

      case ARC_MODES.CENTER_START_END:
        if (this.points.length >= 3) {
          arc = ArcBuilder.fromCenterStartEnd(
            this.points[0],
            this.points[1],
            this.points[2]
          );
        }
        break;

      case ARC_MODES.CENTER_START_ANGLE:
        if (this.points.length >= 3) {
          const center = this.points[0];
          const start = this.points[1];
          const anglePoint = this.points[2];
          const endAngle = Math.atan2(anglePoint.y - center.y, anglePoint.x - center.x);
          const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
          let sweep = endAngle - startAngle;
          if (sweep > Math.PI) sweep -= TWO_PI;
          if (sweep < -Math.PI) sweep += TWO_PI;
          arc = ArcBuilder.fromCenterStartAngle(center, start, sweep);
        }
        break;

      case ARC_MODES.START_END_BULGE:
        if (this.points.length >= 3) {
          const start = this.points[0];
          const end = this.points[1];
          const through = this.points[2];
          const bulge = ArcBuilder.calculateBulge(start, end, through);
          arc = ArcBuilder.fromStartEndBulge(start, end, bulge);
          // Calculate the actual point ON the arc for PLC output
          // The click position (through) is not exactly on the arc
          if (arc) {
            // Project the click point onto the arc to get the true aux point
            const mp = arc.midpoint;
            arc._throughPoint = { x: mp.x, y: mp.y };
          }
        }
        break;

      default:
        if (this.points.length >= 3) {
          arc = ArcBuilder.fromThreePoints(
            this.points[0],
            this.points[1],
            this.points[2]
          );
        }
    }

    return arc;
  }

  /**
   * Set the arc creation mode
   */
  setMode(mode) {
    if (Object.values(ARC_MODES).includes(mode)) {
      this.mode = mode;
      this.reset();
      this.mode = mode; // Keep the mode after reset
    }
  }
}

export default ArcBuilder;
