export function distance(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  return Math.hypot(dx, dy);
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
  const angleStart = Math.atan2(arc.y1 - arc.cy, arc.x1 - arc.cx);
  const angleEnd = Math.atan2(arc.y2 - arc.cy, arc.x2 - arc.cx);
  const anglePoint = Math.atan2(point.y - arc.cy, point.x - arc.cx);
  const dir = (arc.dir || 'CW').toUpperCase();
  let start = angleStart;
  let end = angleEnd;

  if (dir === 'CW') {
    while (end < start) {
      end += 2 * Math.PI;
    }
    let angle = anglePoint;
    while (angle < start) {
      angle += 2 * Math.PI;
    }
    while (angle > end) {
      angle -= 2 * Math.PI;
    }
    const x = arc.cx + arc.r * Math.cos(angle);
    const y = arc.cy + arc.r * Math.sin(angle);
    return Math.hypot(point.x - x, point.y - y);
  }

  while (end > start) {
    end -= 2 * Math.PI;
  }
  let angle = anglePoint;
  while (angle > start) {
    angle -= 2 * Math.PI;
  }
  while (angle < end) {
    angle += 2 * Math.PI;
  }
  const x = arc.cx + arc.r * Math.cos(angle);
  const y = arc.cy + arc.r * Math.sin(angle);
  return Math.hypot(point.x - x, point.y - y);
}

export function pointToSegmentDistance(a, b, p) {
  return distanceToLineSegment(a.x, a.y, b.x, b.y, p.x, p.y);
}


