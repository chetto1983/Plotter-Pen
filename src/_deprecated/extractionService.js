import { PrimitiveExtractor } from "./primitiveExtractor.js";
import { PathOptimizer } from "./pathOptimizer.js";
import { EXTRACTOR_DEFAULTS, MIN_PRIMITIVE_LENGTH } from "./constants.js";
import { distance } from "./geometry.js";
import { formatPlcMovements } from "./plcFormatter.js";

let primitiveIdCounter = 0;

function resample(points, step = 4) {
  if (!Array.isArray(points) || points.length <= 2) {
    return points ? points.slice() : [];
  }

  let total = 0;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i]);
    total += d;
    cum[i] = total;
  }
  if (total === 0) {
    return points.slice();
  }

  const num = Math.max(2, Math.ceil(total / step) + 1);
  const out = [points[0]];
  let idx = 0;
  for (let i = 1; i < num - 1; i++) {
    const target = i * step;
    while (idx < points.length - 1 && cum[idx + 1] < target) {
      idx++;
    }
    if (idx >= points.length - 1) {
      break;
    }
    const a = points[idx];
    const b = points[idx + 1];
    const da = cum[idx];
    const db = cum[idx + 1];
    const segL = db - da;
    if (segL === 0) {
      continue;
    }
    const t = (target - da) / segL;
    const x = a.x + t * (b.x - a.x);
    const y = a.y + t * (b.y - a.y);
    out.push({ x, y });
  }
  out.push(points[points.length - 1]);
  return out;
}

function lineLength(prim) {
  if (!prim) {
    return 0;
  }
  const x1 = prim.x1 != null ? prim.x1 : prim.start?.x ?? 0;
  const y1 = prim.y1 != null ? prim.y1 : prim.start?.y ?? 0;
  const x2 = prim.x2 != null ? prim.x2 : prim.end?.x ?? 0;
  const y2 = prim.y2 != null ? prim.y2 : prim.end?.y ?? 0;
  return Math.hypot(x2 - x1, y2 - y1);
}

function createLinePrimitive(start, end, minLength = MIN_PRIMITIVE_LENGTH) {
  if (!start || !end) {
    return null;
  }
  const x1 = typeof start.x === 'number' ? start.x : 0;
  const y1 = typeof start.y === 'number' ? start.y : 0;
  const x2 = typeof end.x === 'number' ? end.x : 0;
  const y2 = typeof end.y === 'number' ? end.y : 0;
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (!Number.isFinite(length) || length < minLength) {
    return null;
  }
  return { type: 'line', x1, y1, x2, y2 };
}

function createArcPrimitive(info, minChord = MIN_PRIMITIVE_LENGTH) {
  if (!info) {
    return null;
  }
  const start = info.start;
  const end = info.end;
  const center = info.center;
  if (!start || !end || !center) {
    return null;
  }
  const x1 = typeof start.x === 'number' ? start.x : 0;
  const y1 = typeof start.y === 'number' ? start.y : 0;
  const x2 = typeof end.x === 'number' ? end.x : 0;
  const y2 = typeof end.y === 'number' ? end.y : 0;
  const cx = typeof center.x === 'number' ? center.x : 0;
  const cy = typeof center.y === 'number' ? center.y : 0;
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (!Number.isFinite(chord) || chord < Math.max(minChord, 0.1)) {
    return null;
  }
  const radius = typeof info.radius === 'number' ? info.radius : Math.hypot(x1 - cx, y1 - cy);
  if (!Number.isFinite(radius) || radius < minChord / 2) {
    return null;
  }
  const midPoint = info.middle || info.mid || info.midpoint || info.through || info.control || null;
  const dir = (info.dir || determineArcDirection({ x: cx, y: cy }, start, end, info.referencePoints, midPoint)) || 'CW';
  return {
    type: 'arc',
    x1,
    y1,
    x2,
    y2,
    cx,
    cy,
    r: radius,
    dir
  };
}

function findClosestPointIndex(points, target) {
  if (!Array.isArray(points) || !target) {
    return -1;
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distance(points[i], target);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}





function isValidPoint(point) {
  return point != null && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function computeSignedDistanceToChord(start, end, point) {
  if (!isValidPoint(start) || !isValidPoint(end) || !isValidPoint(point)) {
    return 0;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) {
    return 0;
  }
  const numerator = (dx * (point.y - start.y)) - (dy * (point.x - start.x));
  return numerator / length;
}

function resolveArcMidpoint(start, end, midPointCandidate, referencePoints = []) {
  if (!isValidPoint(start) || !isValidPoint(end)) {
    return null;
  }
  const MIN_SEPARATION = 1e-3;

  const sanitizeCandidate = (candidate) => {
    if (!isValidPoint(candidate)) {
      return null;
    }
    if (distance(candidate, start) <= MIN_SEPARATION) {
      return null;
    }
    if (distance(candidate, end) <= MIN_SEPARATION) {
      return null;
    }
    const signedDistance = computeSignedDistanceToChord(start, end, candidate);
    if (!Number.isFinite(signedDistance)) {
      return null;
    }
    return { point: candidate, signedDistance };
  };

  const directCandidate = sanitizeCandidate(midPointCandidate);
  const points = Array.isArray(referencePoints) ? referencePoints : [];
  let bestCandidate = null;
  let bestScore = 0;

  for (const point of points) {
    const candidate = sanitizeCandidate(point);
    if (!candidate) {
      continue;
    }
    const score = Math.abs(candidate.signedDistance);
    if (score > bestScore + 1e-6) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  if (bestCandidate && Math.abs(bestCandidate.signedDistance) > 1e-6) {
    return bestCandidate;
  }

  if (directCandidate && Math.abs(directCandidate.signedDistance) > 1e-6) {
    return directCandidate;
  }

  if (!bestCandidate && points.length >= 3) {
    const midIndex = Math.floor(points.length / 2);
    const fallbackCandidate = sanitizeCandidate(points[midIndex]);
    if (fallbackCandidate) {
      bestCandidate = fallbackCandidate;
    }
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  if (directCandidate) {
    return directCandidate;
  }

  return null;
}

function determineArcDirection(center, start, end, referencePoints = [], midPoint = null) {
  const orientationFromPoint = (point) => {
    if (!isValidPoint(point)) {
      return null;
    }
    const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    if (Math.abs(cross) < 1e-9) {
      return null;
    }
    // screen coordinates (y grows down): cross > 0 means visual clockwise
    return cross > 0 ? 'CW' : 'CCW';
  };

  const resolved = resolveArcMidpoint(start, end, midPoint, referencePoints);
  if (resolved && resolved.point) {
    const dirFromMid = orientationFromPoint(resolved.point);
    if (dirFromMid) {
      return dirFromMid;
    }
    if (Number.isFinite(resolved.signedDistance) && Math.abs(resolved.signedDistance) > 1e-9) {
      return resolved.signedDistance > 0 ? 'CCW' : 'CW';
    }
  }

  if (center && start && end) {
    const centerCross = (start.x - center.x) * (end.y - center.y) - (start.y - center.y) * (end.x - center.x);
    if (Math.abs(centerCross) > 1e-9) {
      return centerCross > 0 ? 'CW' : 'CCW';
    }
  }

  const fallback = fallbackToReferencePoints(center, start, end, referencePoints);
  if (fallback) {
    return fallback;
  }

  return 'CW';
}


function fallbackToReferencePoints(center, start, end, referencePoints = []) {
  const points = Array.isArray(referencePoints) ? referencePoints : [];
  const totalPoints = points.length;
  if (totalPoints >= 2 && center && start && end) {
    const startIdx = findClosestPointIndex(points, start);
    const endIdx = findClosestPointIndex(points, end);
    if (startIdx !== -1 && endIdx !== -1) {
      let crossSum = 0;
      let idx = startIdx;
      let guard = 0;
      const limit = totalPoints + 2;
      while (guard < limit) {
        const nextIdx = (idx + 1) % totalPoints;
        const prev = points[idx];
        const curr = points[nextIdx];
        crossSum += ((prev.x - center.x) * (curr.y - center.y)) - ((prev.y - center.y) * (curr.x - center.x));
        if (nextIdx === endIdx) {
          break;
        }
        if (nextIdx === startIdx) {
          // looped entire stroke without reaching endIdx
          break;
        }
        idx = nextIdx;
        guard += 1;
      }
      if (Math.abs(crossSum) > 1e-6) {
        return crossSum >= 0 ? 'CW' : 'CCW';
      }
    }
  }

  // Final fallback to simple cross product
  if (center && start && end) {
    const cross = (start.x - center.x) * (end.y - center.y) - (start.y - center.y) * (end.x - center.x);
    if (Math.abs(cross) > 1e-9) {
      return cross >= 0 ? 'CW' : 'CCW';
    }
  }
  return null;
}

function clonePrimitive(prim) {
  if (!prim) {
    return null;
  }
  if (prim.type === 'line') {
    return { type: 'line', x1: prim.x1, y1: prim.y1, x2: prim.x2, y2: prim.y2 };
  }
  if (prim.type === 'arc') {
    return {
      type: 'arc',
      x1: prim.x1,
      y1: prim.y1,
      x2: prim.x2,
      y2: prim.y2,
      cx: prim.cx,
      cy: prim.cy,
      r: prim.r,
      dir: prim.dir
    };
  }
  return { ...prim };
}

function mergeColinearLinePrimitives(primitives, options) {
  const opts = options || {};
  const angleToleranceDeg = opts.angleToleranceDeg != null ? opts.angleToleranceDeg : 5;
  const positionEps = opts.positionEps != null ? opts.positionEps : 0.25;
  const allowReverse = opts.allowReverse !== undefined ? opts.allowReverse : true;
  const inputPrims = Array.isArray(primitives) ? primitives : [];

  if (inputPrims.length === 0) return [];

  const angleTolerance = angleToleranceDeg * Math.PI / 180;
  const samePoint = (a, b) => {
    if (!a || !b) return false;
    return distance(a, b) <= positionEps;
  };
  const lineAngle = (line) => Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
  const angleDiff = (a, b) => {
    let diff = Math.abs(a - b);
    if (diff > Math.PI) diff = (2 * Math.PI) - diff;
    return diff;
  };

  const merged = [];

  for (const prim of inputPrims) {
    if (!prim) continue;

    if (prim.type !== 'line') {
      merged.push(clonePrimitive(prim));
      continue;
    }

    const current = clonePrimitive(prim);
    if (lineLength(current) <= 1e-3) {
      continue;
    }

    const last = merged[merged.length - 1];
    if (last && last.type === 'line') {
      const lastEnd = { x: last.x2, y: last.y2 };
      const lastStart = { x: last.x1, y: last.y1 };
      const variants = allowReverse ? [
        current,
        { type: 'line', x1: current.x2, y1: current.y2, x2: current.x1, y2: current.y1 }
      ] : [current];

      let mergedInPlace = false;

      for (const candidate of variants) {
        const start = { x: candidate.x1, y: candidate.y1 };
        const end = { x: candidate.x2, y: candidate.y2 };
        if (samePoint(lastEnd, start) && angleDiff(lineAngle(last), lineAngle(candidate)) <= angleTolerance) {
          last.x2 = end.x;
          last.y2 = end.y;
          mergedInPlace = true;
          break;
        }
        if (samePoint(lastStart, end) && angleDiff(lineAngle(last), lineAngle(candidate)) <= angleTolerance) {
          last.x1 = start.x;
          last.y1 = start.y;
          mergedInPlace = true;
          break;
        }
      }

      if (mergedInPlace) {
        continue;
      }
    }

    merged.push(current);
  }

  return merged;
}

function normalizeExtractedPrimitive(primitive, referencePoints = []) {
  if (!primitive) return null;

  if (primitive.type === 'line') {
    return createLinePrimitive(primitive.start, primitive.end);
  }

  if (primitive.type === 'arc' && primitive.center) {
    const start = primitive.start;
    const end = primitive.end;
    const center = primitive.center;
    if (!start || !end || !center) return null;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    if (!Number.isFinite(chord) || chord < MIN_PRIMITIVE_LENGTH * 0.5) return null;
    const rawRadius = primitive.r != null ? primitive.r : Math.hypot(start.x - center.x, start.y - center.y);
    if (!Number.isFinite(rawRadius) || rawRadius <= 0) return null;
    const dir = determineArcDirection(center, start, end, referencePoints);
    return {
      type: 'arc',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      cx: center.x,
      cy: center.y,
      r: rawRadius,
      dir
    };
  }

  return null;
}

function toMmPrimitive(prim) {
  if (!prim) return null;

  if (prim.type === 'line') {
    return {
      type: 'line',
      x1: +prim.x1.toFixed(3),
      y1: +prim.y1.toFixed(3),
      x2: +prim.x2.toFixed(3),
      y2: +prim.y2.toFixed(3)
    };
  }

  if (prim.type === 'arc') {
    return {
      type: 'arc',
      x1: +prim.x1.toFixed(3),
      y1: +prim.y1.toFixed(3),
      x2: +prim.x2.toFixed(3),
      y2: +prim.y2.toFixed(3),
      cx: +prim.cx.toFixed(3),
      cy: +prim.cy.toFixed(3),
      r: +prim.r.toFixed(3),
      dir: prim.dir
    };
  }

  return prim;
}

function toOptimizerPrimitive(prim) {
  if (!prim) return null;

  if (prim.type === 'line') {
    return {
      type: 'line',
      start: { x: prim.x1, y: prim.y1 },
      end: { x: prim.x2, y: prim.y2 }
    };
  }

  if (prim.type === 'arc') {
    return {
      type: 'arc',
      start: { x: prim.x1, y: prim.y1 },
      end: { x: prim.x2, y: prim.y2 },
      center: { x: prim.cx, y: prim.cy },
      r: prim.r
    };
  }

  return null;
}

function fromOptimizerPrimitive(prim) {
  if (!prim) return null;

  if (prim.type === 'line') {
    return {
      type: 'line',
      x1: +prim.start.x.toFixed(3),
      y1: +prim.start.y.toFixed(3),
      x2: +prim.end.x.toFixed(3),
      y2: +prim.end.y.toFixed(3)
    };
  }

  const center = prim.center || { x: prim.cx, y: prim.cy } || { x: prim.start.x, y: prim.start.y };
  const cx = typeof center.x === 'number' ? center.x : 0;
  const cy = typeof center.y === 'number' ? center.y : 0;
  const start = prim.start;
  const end = prim.end;
  const radius = prim.r != null ? prim.r : Math.hypot(start.x - cx, start.y - cy);
  const dir = determineArcDirection({ x: cx, y: cy }, start, end);
  return {
    type: 'arc',
    x1: +start.x.toFixed(3),
    y1: +start.y.toFixed(3),
    x2: +end.x.toFixed(3),
    y2: +end.y.toFixed(3),
    cx: +cx.toFixed(3),
    cy: +cy.toFixed(3),
    r: +radius.toFixed(3),
    dir
  };
}

function mergePrimitivesForPlc(primitives, options) {
  const opts = options || {};
  const positionEps = opts.positionEps != null ? opts.positionEps : 0.2;
  const centerEps = opts.centerEps != null ? opts.centerEps : 0.2;
  const radiusEps = opts.radiusEps != null ? opts.radiusEps : 0.3;
  const lineAngleDeg = opts.lineAngleDeg != null ? opts.lineAngleDeg : 4;
  const safePrims = Array.isArray(primitives) ? primitives : [];
  const preMerged = mergeColinearLinePrimitives(safePrims, {
    angleToleranceDeg: lineAngleDeg,
    positionEps
  });

  const merged = [];
  const samePoint = (a, b) => {
    if (!a || !b) return false;
    return distance(a, b) <= positionEps;
  };

  preMerged.forEach((prim) => {
    if (!prim) return;
    const primClone = clonePrimitive(prim);
    if (!primClone) return;
    const last = merged[merged.length - 1];
    if (
      primClone.type === 'arc' &&
      last &&
      last.type === 'arc' &&
      last.dir === primClone.dir &&
      Math.abs((last.r || 0) - (primClone.r || 0)) <= radiusEps &&
      distance({ x: last.cx, y: last.cy }, { x: primClone.cx, y: primClone.cy }) <= centerEps &&
      samePoint({ x: last.x2, y: last.y2 }, { x: primClone.x1, y: primClone.y1 })
    ) {
      last.x2 = primClone.x2;
      last.y2 = primClone.y2;
      return;
    }
    merged.push(primClone);
  });

  return merged;
}

function buildPlcMovements(primitives) {
  const cleanPrims = Array.isArray(primitives) ? primitives.filter(Boolean) : [];
  const commands = [];
  const continuityEps = 0.2;
  let penDown = false;
  let lastEnd = null;

  const isContinuous = (a, b) => {
    if (!a || !b) {
      return false;
    }
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return (dx * dx + dy * dy) <= (continuityEps * continuityEps);
  };

  for (let i = 0; i < cleanPrims.length; i++) {
    const prim = cleanPrims[i];
    const start = { x: prim.x1, y: prim.y1 };
    const end = { x: prim.x2, y: prim.y2 };
    const continuousWithPrev = penDown && lastEnd && isContinuous(lastEnd, start);

    if (!continuousWithPrev) {
      if (penDown && lastEnd) {
        commands.push({ type: 'Z_up', x: lastEnd.x, y: lastEnd.y });
        penDown = false;
      }
      commands.push({ type: 'waypoint', x: start.x, y: start.y, z: 0 });
      commands.push({ type: 'Z_down', x: start.x, y: start.y });
      penDown = true;
    }

    if (prim.type === 'line') {
      commands.push({ type: 'line', x1: prim.x1, y1: prim.y1, x2: prim.x2, y2: prim.y2, primitive: prim });
    } else if (prim.type === 'arc') {
      commands.push({
        type: 'arc',
        x1: prim.x1,
        y1: prim.y1,
        x2: prim.x2,
        y2: prim.y2,
        r: prim.r,
        cx: prim.cx,
        cy: prim.cy,
        dir: prim.dir,
        primitive: prim
      });
    }

    const nextPrim = cleanPrims[i + 1];
    const stayDown = nextPrim && isContinuous(end, { x: nextPrim.x1, y: nextPrim.y1 });
    if (!stayDown && penDown) {
      commands.push({ type: 'Z_up', x: end.x, y: end.y });
      penDown = false;
    }
    lastEnd = end;
  }

  if (penDown && lastEnd) {
    commands.push({ type: 'Z_up', x: lastEnd.x, y: lastEnd.y });
  }

  return commands;
}

function isCorner(points, index) {
  if (!Array.isArray(points) || index <= 0 || index >= points.length - 1) return false;
  const prev = points[index - 1];
  const current = points[index];
  const next = points[index + 1];
  const angle1 = Math.atan2(current.y - prev.y, current.x - prev.x);
  const angle2 = Math.atan2(next.y - current.y, next.x - current.x);
  const angleDiff = Math.abs(angle1 - angle2);
  return angleDiff > Math.PI / 4;
}

function isRectangleStroke(stroke) {
  if (!Array.isArray(stroke) || stroke.length < 5) return false;
  const first = stroke[0];
  const last = stroke[stroke.length - 1];
  if (distance(first, last) > 5) return false;
  const corners = [];
  for (let i = 0; i < stroke.length - 1; i++) {
    if (i === 0 || isCorner(stroke, i)) {
      corners.push(stroke[i]);
    }
  }
  if (corners.length !== 4) return false;
  const sides = [
    distance(corners[0], corners[1]),
    distance(corners[1], corners[2]),
    distance(corners[2], corners[3]),
    distance(corners[3], corners[0])
  ];
  const opposite1Equal = Math.abs(sides[0] - sides[2]) < 10;
  const opposite2Equal = Math.abs(sides[1] - sides[3]) < 10;
  return opposite1Equal && opposite2Equal;
}

function createRectanglePrimitives(stroke, minLength = MIN_PRIMITIVE_LENGTH) {
  if (!Array.isArray(stroke)) return [];
  const corners = [];
  for (let i = 0; i < stroke.length - 1; i++) {
    if (i === 0 || isCorner(stroke, i)) {
      corners.push(stroke[i]);
    }
  }
  if (corners.length !== 4) return createPolylinePrimitives(stroke, minLength);
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const start = corners[i];
    const end = corners[(i + 1) % 4];
    const line = createLinePrimitive(start, end, minLength);
    if (line) lines.push(line);
  }
  return lines;
}

function keyNumber(value) {
  return Number.isFinite(value) ? value.toFixed(3) : 'null';
}

function buildPrimitiveKey(prim) {
  if (!prim || !prim.type) {
    return 'unknown';
  }
  if (prim.type === 'line') {
    const a = keyNumber(prim.x1) + ',' + keyNumber(prim.y1);
    const b = keyNumber(prim.x2) + ',' + keyNumber(prim.y2);
    return (a <= b ? 'line:' + a + '|' + b : 'line:' + b + '|' + a);
  }
  if (prim.type === 'arc') {
    const start = keyNumber(prim.x1) + ',' + keyNumber(prim.y1);
    const end = keyNumber(prim.x2) + ',' + keyNumber(prim.y2);
    const ordered = start <= end ? [start, end] : [end, start];
    const center = keyNumber(prim.cx) + ',' + keyNumber(prim.cy);
    const radius = keyNumber(prim.r);
    return 'arc:' + ordered[0] + '|' + ordered[1] + '|' + center + '|' + radius;
  }
  return JSON.stringify(prim);
}

function createPolylinePrimitives(points, minLength = MIN_PRIMITIVE_LENGTH) {
  const lines = [];
  if (!Array.isArray(points)) return lines;
  for (let i = 0; i < points.length - 1; i++) {
    const line = createLinePrimitive(points[i], points[i + 1], minLength);
    if (line) lines.push(line);
  }
  return lines;
}

export function createExtractionService(state, snapManager, outputController) {
  function extractAll() {
    try {
      console.time('extraction');

      const canvas = state.elements.canvas;
      const strokes = state.drawing.strokes;
      const mmWidth = state.workspace.widthMm || 100;
      const mmHeight = state.workspace.heightMm || 100;
      const pxWidth = canvas?.clientWidth || canvas?.width || 0;
      const pxHeight = canvas?.clientHeight || canvas?.height || 0;
      const pxToMmX = pxWidth > 0 ? mmWidth / pxWidth : 0;
      const pxToMmY = pxHeight > 0 ? mmHeight / pxHeight : 0;
      const uniformFactor = (pxToMmX + pxToMmY) / 2;

      const primitives = [];
      const primitiveSources = [];
      const primitivesPerStroke = [];
      const paths = [];
      const strokesPoints = [];
      const strokesPointsMm = [];

      if (!Array.isArray(strokes) || strokes.length === 0) {
        outputController.setOutput('', []);
        state.extraction.last = null;
        snapManager.markAnchorsDirty();
        console.timeEnd('extraction');
        return;
      }

      for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
        const stroke = strokes[strokeIndex];
        if (!stroke || stroke.length < 2) {
          primitivesPerStroke.push([]);
          continue;
        }
        const resStep = stroke.length > 200 ? 8 : stroke.length > 100 ? 6 : 4;
        const resampledPoints = resample(stroke, resStep);
        strokesPoints.push(resampledPoints);
        const resampledPointsMm = resampledPoints.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) }));
        strokesPointsMm.push(resampledPointsMm);

        let strokePrimitives = [];
        const strokeTool = stroke.tool || stroke.sourceTool || null;

        if (strokeTool === 'line' && stroke.length >= 2) {
          const directLine = createLinePrimitive(stroke[0], stroke[stroke.length - 1]);
          if (directLine) {
            strokePrimitives = [directLine];
          }
        } else if (strokeTool === 'arc' && stroke.arcInfo) {
          const arcInfo = {
            start: stroke.arcInfo.start,
            end: stroke.arcInfo.end,
            center: stroke.arcInfo.center,
            radius: stroke.arcInfo.radius,
            dir: stroke.arcInfo.dir,
            referencePoints: stroke
          };
          const directArc = createArcPrimitive(arcInfo);
          if (directArc) {
            strokePrimitives = [directArc];
          }
        } else if (strokeTool === 'polygon') {
          strokePrimitives = createPolylinePrimitives(stroke);
        } else if (isRectangleStroke(stroke)) {
          strokePrimitives = createRectanglePrimitives(stroke);
        } else {
          const extracted = PrimitiveExtractor.extractPrimitives(resampledPoints, EXTRACTOR_DEFAULTS) || [];
          strokePrimitives = extracted
            .map((prim) => normalizeExtractedPrimitive(prim, resampledPoints))
            .filter(Boolean);
          if (strokePrimitives.length === 0) {
            const fallback = createLinePrimitive(stroke[0], stroke[stroke.length - 1]);
            if (fallback) {
              strokePrimitives.push(fallback);
            }
          }
        }

        strokePrimitives = mergeColinearLinePrimitives(strokePrimitives, {
          angleToleranceDeg: 6,
          positionEps: 0.35
        });

        strokePrimitives.forEach((prim) => {
          primitives.push(prim);
          primitiveSources.push({ strokeIndex, strokeTool });
        });
        primitivesPerStroke.push(strokePrimitives);

        const startPt = stroke[0];
        const endPt = stroke[stroke.length - 1];
        paths.push({
          start: { x: +startPt.x.toFixed(3), y: +startPt.y.toFixed(3) },
          end: { x: +endPt.x.toFixed(3), y: +endPt.y.toFixed(3) },
          length: stroke.length
        });
      }

      const primitivesMm = primitives.map(toMmPrimitive);
      const primitiveSourcesByKey = new Map();
      primitivesMm.forEach((prim, idx) => {
        const key = buildPrimitiveKey(prim);
        if (!primitiveSourcesByKey.has(key)) {
          primitiveSourcesByKey.set(key, []);
        }
        primitiveSourcesByKey.get(key).push(primitiveSources[idx] || null);
      });
      const primitivesPerStrokeMm = primitivesPerStroke.map((list) => list.map(toMmPrimitive));
      const allMergedPrimitivesMm = primitivesPerStrokeMm.flat();

      const pathsMm = paths.map((path) => ({
        start: { x: path.start.x, y: path.start.y, z: 1 },
        end: { x: path.end.x, y: path.end.y, z: 0 },
        length: path.length
      }));

      paths.forEach((p) => {
        p.start.z = 1;
        p.end.z = 0;
      });
      strokesPoints.forEach((sp) => {
        if (sp.length > 0) {
          sp[0].z = 1;
          if (sp.length > 1) {
            sp[sp.length - 1].z = 0;
          }
        }
      });
      strokesPointsMm.forEach((sp) => {
        if (sp.length > 0) {
          sp[0].z = 1;
          if (sp.length > 1) {
            sp[sp.length - 1].z = 0;
          }
        }
      });

      const optimizerInput = allMergedPrimitivesMm
        .filter((prim) => prim && (prim.type !== 'line' || lineLength(prim) >= MIN_PRIMITIVE_LENGTH))
        .map(toOptimizerPrimitive)
        .filter(Boolean);

      const optimizedSequenceRaw = optimizerInput.length ? PathOptimizer.optimize(optimizerInput).order : [];
      const optimizedPrimitivesMm = optimizedSequenceRaw.map(fromOptimizerPrimitive).filter(Boolean);

      const effectivePrimitivesMm = (optimizedPrimitivesMm.length > 0 ? optimizedPrimitivesMm : allMergedPrimitivesMm)
        .filter((prim) => prim && (prim.type !== 'line' || lineLength(prim) >= MIN_PRIMITIVE_LENGTH));

      const activePrimitives = effectivePrimitivesMm.map((prim) => {
        const key = buildPrimitiveKey(prim);
        const sources = primitiveSourcesByKey.get(key);
        const source = sources && sources.length ? (sources.shift() || null) : null;
        return {
          ...prim,
          _id: primitiveIdCounter++,
          _sourceStrokeIndex: source?.strokeIndex ?? null,
          _sourceStrokeTool: source?.strokeTool ?? null
        };
      });

      const plcReadyPrimitives = mergePrimitivesForPlc(activePrimitives);
      const plcMovements = buildPlcMovements(plcReadyPrimitives);

      const circles = primitives
        .filter((p) => p && p.type === 'arc')
        .map((a) => ({
          radius: a.r,
          start: { x: a.x1, y: a.y1 },
          end: { x: a.x2, y: a.y2 },
          center: { x: a.cx, y: a.cy },
          direction: a.dir
        }));

      const circlesMm = primitivesMm
        .filter((p) => p && p.type === 'arc')
        .map((a) => ({
          radius: a.r,
          start: { x: a.x1, y: a.y1 },
          end: { x: a.x2, y: a.y2 },
          center: { x: a.cx, y: a.cy },
          direction: a.dir
        }));

      const out = {
        units: 'mm',
        width: Math.round(pxWidth),
        height: Math.round(pxHeight),
        mm_width: mmWidth,
        mm_height: mmHeight,
        px_to_mm_x: +pxToMmX.toFixed(6),
        px_to_mm_y: +pxToMmY.toFixed(6),
        primitives,
        primitives_mm: primitivesMm,
        circles,
        circles_mm: circlesMm,
        paths,
        paths_mm: pathsMm,
        strokes_points: strokesPoints,
        strokes_points_mm: strokesPointsMm,
        optimized_primitives_mm: optimizedPrimitivesMm,
        active_primitives: activePrimitives,
        plc_movements: plcMovements
      };

      const plcText = formatPlcMovements(plcMovements);
      outputController.setOutput(plcText, plcMovements);

      state.extraction.last = {
        ...out,
        merged_primitives: allMergedPrimitivesMm,
        deleted_primitive_ids: [],
        total_active_primitives: activePrimitives.length,
        pxToMmX,
        pxToMmY,
        uniformFactor
      };

      if (state.deletion) {
        state.deletion.markedPrimitiveId = null;
        state.deletion.markedPrimitiveData = null;
      }

      snapManager.markAnchorsDirty();
      console.timeEnd('extraction');
      return out;
    } catch (error) {
      console.error(error);
      outputController.setOutput(`Error during extraction: ${error.message}`, []);
      throw error;
    }
  }

  function getActivePrimitives() {
    const current = state.extraction.last;
    if (!current || !Array.isArray(current.active_primitives)) {
      return [];
    }
    return current.active_primitives;
  }

  function recomputeActivePrimitiveOutputs() {
    const current = state.extraction.last;
    if (!current) {
      return;
    }
    const active = Array.isArray(current.active_primitives) ? current.active_primitives.filter(Boolean) : [];
    const plcReady = mergePrimitivesForPlc(active);
    const plcMovements = buildPlcMovements(plcReady);
    current.plc_movements = plcMovements;
    current.total_active_primitives = active.length;
    outputController.setOutput(formatPlcMovements(plcMovements), plcMovements);
  }

  function deletePrimitiveById(id) {
    const current = state.extraction.last;
    if (!current || !Array.isArray(current.active_primitives)) {
      return null;
    }
    const index = current.active_primitives.findIndex((prim) => prim && prim._id === id);
    if (index === -1) {
      return null;
    }
    const [removed] = current.active_primitives.splice(index, 1);
    if (!Array.isArray(current.deleted_primitive_ids)) {
      current.deleted_primitive_ids = [];
    }
    current.deleted_primitive_ids.push(id);
    if (state.deletion && state.deletion.markedPrimitiveId === id) {
      state.deletion.markedPrimitiveId = null;
      state.deletion.markedPrimitiveData = null;
    }
    recomputeActivePrimitiveOutputs();
    return removed || null;
  }

  return { extractAll, deletePrimitiveById, getActivePrimitives };
}
