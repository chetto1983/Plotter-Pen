export function distance(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return Math.hypot(dx, dy);
}

const TWO_PI = Math.PI * 2;
const ARC_EPSILON = 1e-6;

export function normalizeArcAngles(arc) {
  if (
    !arc ||
    !Number.isFinite(arc.cx) ||
    !Number.isFinite(arc.cy) ||
    !Number.isFinite(arc.x1) ||
    !Number.isFinite(arc.y1) ||
    !Number.isFinite(arc.x2) ||
    !Number.isFinite(arc.y2) ||
    !Number.isFinite(arc.r) ||
    arc.r <= 0
  ) {
    return null;
  }
  let startAngle = Number.isFinite(arc.startAngle)
    ? arc.startAngle
    : Math.atan2(arc.y1 - arc.cy, arc.x1 - arc.cx);
  let sweepSigned = Number.isFinite(arc.sweep) ? arc.sweep : null;

  if (sweepSigned == null) {
    const endAngleRaw = Number.isFinite(arc.endAngle)
      ? arc.endAngle
      : Math.atan2(arc.y2 - arc.cy, arc.x2 - arc.cx);
    sweepSigned = endAngleRaw - startAngle;
  }

  // if sweep is too small, fallback to full circle to avoid zero-length arcs
  if (Math.abs(sweepSigned) < ARC_EPSILON) {
    sweepSigned = sweepSigned >= 0 ? ARC_EPSILON : -ARC_EPSILON;
  }

  const resolvedDir = sweepSigned < 0 ? 'CCW' : 'CW';

  return {
    startAngle,
    endAngle: startAngle + sweepSigned,
    sweep: sweepSigned,
    dir: resolvedDir,
    anticlockwise: sweepSigned < 0
  };
}

export function distanceToLineSegment(x1, y1, x2, y2, x0, y0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(x0 - x1, y0 - y1);
  }
  let t = ((x0 - x1) * dx + (y0 - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(projX - x0, projY - y0);
}

export function distanceToArc(arc, point) {
  if (!arc || !point) {
    return Infinity;
  }
  const normalized = normalizeArcAngles(arc);
  if (!normalized) {
    return Infinity;
  }

  const anglePoint = Math.atan2(point.y - arc.cy, point.x - arc.cx);
  let delta = anglePoint - normalized.startAngle;
  while (delta > Math.PI) {
    delta -= TWO_PI;
  }
  while (delta < -Math.PI) {
    delta += TWO_PI;
  }

  if (normalized.sweep > 0) {
    // CW in canvas (sweep>0)
    if (delta < 0) {
      delta += TWO_PI;
    }
    delta = Math.min(delta, normalized.sweep);
  } else {
    // CCW in canvas (sweep<0)
    if (delta > 0) {
      delta -= TWO_PI;
    }
    delta = Math.max(delta, normalized.sweep);
  }

  const clampedAngle = normalized.startAngle + delta;
  const x = arc.cx + arc.r * Math.cos(clampedAngle);
  const y = arc.cy + arc.r * Math.sin(clampedAngle);
  return Math.hypot(point.x - x, point.y - y);
}

export function pointToSegmentDistance(a, b, p) {
  return distanceToLineSegment(a.x, a.y, b.x, b.y, p.x, p.y);
}


