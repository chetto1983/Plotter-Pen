/**
 * Arc Builder - Factory methods for creating arcs with different input modes
 * Inspired by AutoCAD arc creation methods
 */

import { TWO_PI, TOLERANCE, normalizeAngle, distance } from './core.js';
import { Arc } from './primitives.js';

/**
 * Arc creation modes (AutoCAD style)
 */
export const ARC_MODES = {
  THREE_POINT: '3point',
  CENTER_START_END: 'cse',
  CENTER_START_ANGLE: 'csa',
  START_CENTER_END: 'sce',
  START_CENTER_ANGLE: 'sca',
  START_END_RADIUS: 'ser',
  START_END_BULGE: 'seb',
  START_END_DIRECTION: 'sed'
};

/**
 * Arc Builder class with multiple creation methods
 */
export class ArcBuilder {

  static fromThreePoints(start, through, end) {
    const circle = ArcBuilder.circleFromThreePoints(start, through, end);
    if (!circle) return null;

    const startAngle = Math.atan2(start.y - circle.cy, start.x - circle.cx);
    const throughAngle = Math.atan2(through.y - circle.cy, through.x - circle.cx);
    const endAngle = Math.atan2(end.y - circle.cy, end.x - circle.cx);

    let throughRel = throughAngle - startAngle;
    let endRel = endAngle - startAngle;

    while (throughRel < 0) throughRel += 2 * Math.PI;
    while (throughRel >= 2 * Math.PI) throughRel -= 2 * Math.PI;
    while (endRel < 0) endRel += 2 * Math.PI;
    while (endRel >= 2 * Math.PI) endRel -= 2 * Math.PI;

    const arc = new Arc(
      start.x, start.y,
      end.x, end.y,
      circle.cx, circle.cy,
      { x: through.x, y: through.y }
    );

    return arc;
  }

  static fromCenterStartEnd(center, startPoint, endPoint) {
    const radius = distance(startPoint.x, startPoint.y, center.x, center.y);
    if (radius < TOLERANCE) return null;

    const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);
    const projectedEndX = center.x + radius * Math.cos(endAngle);
    const projectedEndY = center.y + radius * Math.sin(endAngle);

    const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
    let sweep = endAngle - startAngle;
    if (sweep > Math.PI) sweep -= TWO_PI;
    if (sweep < -Math.PI) sweep += TWO_PI;
    const midAngle = startAngle + sweep / 2;
    const throughPoint = {
      x: center.x + radius * Math.cos(midAngle),
      y: center.y + radius * Math.sin(midAngle)
    };

    return new Arc(
      startPoint.x, startPoint.y,
      projectedEndX, projectedEndY,
      center.x, center.y,
      throughPoint
    );
  }

  static fromCenterStartAngle(center, startPoint, sweepAngle) {
    const radius = distance(startPoint.x, startPoint.y, center.x, center.y);
    if (radius < TOLERANCE) return null;

    const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x);
    const endAngle = startAngle + sweepAngle;

    const endX = center.x + radius * Math.cos(endAngle);
    const endY = center.y + radius * Math.sin(endAngle);

    const midAngle = startAngle + sweepAngle / 2;
    const throughPoint = {
      x: center.x + radius * Math.cos(midAngle),
      y: center.y + radius * Math.sin(midAngle)
    };

    return new Arc(
      startPoint.x, startPoint.y,
      endX, endY,
      center.x, center.y,
      throughPoint
    );
  }

  static fromStartCenterEnd(startPoint, center, endPoint) {
    return ArcBuilder.fromCenterStartEnd(center, startPoint, endPoint);
  }

  static fromStartCenterAngle(startPoint, center, sweepAngle) {
    return ArcBuilder.fromCenterStartAngle(center, startPoint, sweepAngle);
  }

  static fromStartEndRadius(start, end, radius, useMinorArc = true, side = 1) {
    const chord = distance(start.x, start.y, end.x, end.y);

    if (chord > 2 * Math.abs(radius)) return null;
    if (chord < TOLERANCE) return null;
    if (Math.abs(radius) < TOLERANCE) return null;

    const r = Math.abs(radius);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    const halfChord = chord / 2;
    const h = Math.sqrt(r * r - halfChord * halfChord);

    const center = {
      x: midX + side * h * perpX,
      y: midY + side * h * perpY
    };

    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let sweep = endAngle - startAngle;

    if (useMinorArc) {
      if (sweep > Math.PI) sweep -= TWO_PI;
      if (sweep < -Math.PI) sweep += TWO_PI;
    } else {
      if (sweep > 0 && sweep < Math.PI) sweep -= TWO_PI;
      if (sweep < 0 && sweep > -Math.PI) sweep += TWO_PI;
    }

    const midAngle = startAngle + sweep / 2;
    const throughPoint = {
      x: center.x + r * Math.cos(midAngle),
      y: center.y + r * Math.sin(midAngle)
    };

    return new Arc(start.x, start.y, end.x, end.y, center.x, center.y, throughPoint);
  }

  static fromStartEndBulge(start, end, bulge) {
    if (Math.abs(bulge) < TOLERANCE) return null;

    const chord = distance(start.x, start.y, end.x, end.y);
    if (chord < TOLERANCE) return null;

    const sagitta = Math.abs(bulge) * chord / 2;
    const radius = (sagitta / 2) + (chord * chord) / (8 * sagitta);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const perpX = -dy / chord;
    const perpY = dx / chord;

    const midToCenter = radius - sagitta;

    const sign = bulge > 0 ? -1 : 1;
    const cx = midX + midToCenter * perpX * sign;
    const cy = midY + midToCenter * perpY * sign;

    const throughPoint = {
      x: midX - sign * perpX * sagitta,
      y: midY - sign * perpY * sagitta
    };

    return new Arc(start.x, start.y, end.x, end.y, cx, cy, throughPoint);
  }

  static fromStartEndDirection(start, end, directionAngle) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chord = Math.sqrt(dx * dx + dy * dy);

    if (chord < TOLERANCE) return null;

    const chordAngle = Math.atan2(dy, dx);

    let beta = directionAngle - chordAngle;
    beta = normalizeAngle(beta + Math.PI) - Math.PI;

    if (Math.abs(Math.abs(beta) - Math.PI / 2) < TOLERANCE) {
      return null;
    }

    const radius = chord / (2 * Math.sin(beta));

    const cx = start.x + radius * Math.cos(directionAngle - Math.PI / 2);
    const cy = start.y + radius * Math.sin(directionAngle - Math.PI / 2);

    const startAngle = Math.atan2(start.y - cy, start.x - cx);
    const endAngle = Math.atan2(end.y - cy, end.x - cx);
    let sweep = endAngle - startAngle;
    if (sweep > Math.PI) sweep -= TWO_PI;
    if (sweep < -Math.PI) sweep += TWO_PI;
    const midAngle = startAngle + sweep / 2;
    const throughPoint = {
      x: cx + Math.abs(radius) * Math.cos(midAngle),
      y: cy + Math.abs(radius) * Math.sin(midAngle)
    };

    return new Arc(start.x, start.y, end.x, end.y, cx, cy, throughPoint);
  }

  static circleFromThreePoints(p1, p2, p3) {
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));

    if (Math.abs(d) < TOLERANCE) {
      return null;
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

  static areCollinear(p1, p2, p3, tolerance = TOLERANCE) {
    const d = (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
    return Math.abs(d) < tolerance;
  }

  static calculateSweepThroughPoint(startAngle, auxAngle, endAngle) {
    let auxRel = auxAngle - startAngle;
    let endRel = endAngle - startAngle;

    while (auxRel < 0) auxRel += TWO_PI;
    while (auxRel >= TWO_PI) auxRel -= TWO_PI;
    while (endRel < 0) endRel += TWO_PI;
    while (endRel >= TWO_PI) endRel -= TWO_PI;

    if (auxRel < endRel) {
      return endRel;
    }
    return endRel - TWO_PI;
  }

  static signedDistanceToChord(start, end, point) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const norm = Math.sqrt(dx * dx + dy * dy);

    if (norm < TOLERANCE) return 0;

    return ((dx * (point.y - start.y)) - (dy * (point.x - start.x))) / norm;
  }

  static calculateBulge(start, end, through) {
    const signedDist = ArcBuilder.signedDistanceToChord(start, end, through);
    const chord = distance(start.x, start.y, end.x, end.y);

    if (chord < TOLERANCE) return 0;

    const circle = ArcBuilder.circleFromThreePoints(start, through, end);
    if (!circle) return 0;

    const sagitta = circle.r - Math.sqrt(Math.max(0, circle.r * circle.r - (chord / 2) * (chord / 2)));

    const sign = signedDist >= 0 ? 1 : -1;

    return sign * (2 * sagitta / chord);
  }
}

// Re-export ArcToolState for backward compatibility
export { ArcToolState } from './ArcToolState.js';

export default ArcBuilder;
