import * as Flatten from "../node_modules/@flatten-js/core/dist/main.mjs";
import { MAGNET_SNAP_DISTANCE_MM, COLLISION_TOLERANCE_MM } from "./constants.js";
import { normalizeArcAngles } from "./geometry.js";

const TWO_PI = Math.PI * 2;

function normAngle(angle) {
  let a = angle % TWO_PI;
  if (a < 0) {
    a += TWO_PI;
  }
  return a;
}

function toFlattenArc(arc) {
  if (
    !arc ||
    !Number.isFinite(arc.cx) ||
    !Number.isFinite(arc.cy) ||
    !Number.isFinite(arc.r) ||
    arc.r <= 0
  ) {
    return null;
  }
  const normalized = normalizeArcAngles(arc);
  if (!normalized) {
    return null;
  }
  const startAngle = normAngle(normalized.startAngle);
  const endAngle = normAngle(startAngle + normalized.sweep);
  return new Flatten.Arc(
    new Flatten.Point(arc.cx, arc.cy),
    arc.r,
    startAngle,
    endAngle,
    normalized.dir === "CCW"
  );
}

function toFlattenSegment(line) {
  if (
    !line ||
    !Number.isFinite(line.x1) ||
    !Number.isFinite(line.y1) ||
    !Number.isFinite(line.x2) ||
    !Number.isFinite(line.y2)
  ) {
    return null;
  }
  if (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) < 1e-6) {
    return null;
  }
  return new Flatten.Segment(new Flatten.Point(line.x1, line.y1), new Flatten.Point(line.x2, line.y2));
}

function convertPrimitiveToShape(prim) {
  if (!prim) {
    return null;
  }
  if (prim.type === "line") {
    const shape = toFlattenSegment(prim);
    return shape ? { shape, kind: "magnet-edge", source: prim } : null;
  }
  if (prim.type === "arc") {
    const shape = toFlattenArc(prim);
    return shape ? { shape, kind: "magnet-arc", source: prim } : null;
  }
  return null;
}

function dedupePoints(points, eps = 0.1) {
  const out = [];
  for (const pt of points) {
    const exists = out.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= eps);
    if (!exists) {
      out.push(pt);
    }
  }
  return out;
}

function fromStroke(stroke) {
  const prims = [];
  if (!stroke || !Array.isArray(stroke)) {
    return prims;
  }
  const tool = stroke.tool || stroke.sourceTool || null;
  if (tool === "line" && stroke.length >= 2) {
    prims.push({
      type: "line",
      x1: stroke[0].x,
      y1: stroke[0].y,
      x2: stroke[stroke.length - 1].x,
      y2: stroke[stroke.length - 1].y
    });
    return prims;
  }
  if (tool === "arc" && stroke.arcInfo) {
    const a = stroke.arcInfo;
    prims.push({
      type: "arc",
      x1: a.start?.x,
      y1: a.start?.y,
      x2: a.end?.x,
      y2: a.end?.y,
      cx: a.center?.x,
      cy: a.center?.y,
      r: a.radius,
      dir: a.dir || "CW",
      startAngle: a.startAngle,
      endAngle: a.endAngle
    });
    return prims;
  }
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1];
    const b = stroke[i];
    prims.push({
      type: "line",
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y
    });
  }
  return prims;
}

function gatherAllPrimitives(state) {
  const primitives = [];
  const active = state.extraction.last?.active_primitives;
  if (Array.isArray(active) && active.length > 0) {
    for (const prim of active) {
      if (prim) {
        primitives.push(prim);
      }
    }
  }
  if (Array.isArray(state.drawing.strokes)) {
    for (const stroke of state.drawing.strokes) {
      primitives.push(...fromStroke(stroke));
    }
  }
  return primitives;
}

function computeIntersections(shapes) {
  const points = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i].shape;
      const b = shapes[j].shape;
      if (!a || !b || typeof a.intersect !== "function") {
        continue;
      }
      try {
        const inters = a.intersect(b) || [];
        inters.forEach((pt) => {
          if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
            points.push({ x: pt.x, y: pt.y });
          }
        });
      } catch {
        // ignore malformed intersections
      }
    }
  }
  return dedupePoints(points, 0.25);
}

export function createMagnetHelper(state) {
  let cache = { shapes: [], intersections: [], dirty: true };

  function invalidate() {
    cache.dirty = true;
  }

  function rebuild() {
    const primitives = gatherAllPrimitives(state);
    const shapes = primitives
      .map(convertPrimitiveToShape)
      .filter(Boolean);
    const intersections = computeIntersections(shapes);
    cache = { shapes, intersections, dirty: false };
    return cache;
  }

  function ensureCache() {
    if (cache.dirty) {
      return rebuild();
    }
    return cache;
  }

  function pickIntersection(point, intersections) {
    let best = null;
    for (const pt of intersections) {
      const dist = Math.hypot(pt.x - point.x, pt.y - point.y);
      if (dist <= MAGNET_SNAP_DISTANCE_MM && (!best || dist < best.distance)) {
        best = {
          type: "intersection",
          point: { x: pt.x, y: pt.y },
          distance: dist
        };
      }
    }
    return best;
  }

  function pickEdge(point, shapes) {
    const target = new Flatten.Point(point.x, point.y);
    let best = null;
    for (const entry of shapes) {
      const result = entry.shape.distanceTo(target);
      if (!Array.isArray(result) || result.length < 2) {
        continue;
      }
      const [distance, shortest] = result;
      if (!shortest || !shortest.ps) {
        continue;
      }
      if (!Number.isFinite(distance) || distance > MAGNET_SNAP_DISTANCE_MM) {
        continue;
      }
      const snapPoint = shortest.ps;
      if (!Number.isFinite(snapPoint.x) || !Number.isFinite(snapPoint.y)) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = {
          type: entry.kind,
          point: { x: snapPoint.x, y: snapPoint.y },
          distance,
          source: entry.source
        };
      }
    }
    return best;
  }

  function findMagnet(point) {
    const { shapes, intersections } = ensureCache();
    const intersectionCandidate = pickIntersection(point, intersections);
    const edgeCandidate = pickEdge(point, shapes);
    if (intersectionCandidate) {
      return intersectionCandidate;
    }
    return edgeCandidate || null;
  }

  function detectCollision(tempShape) {
    const { shapes } = ensureCache();
    const candidate = convertPrimitiveToShape(tempShape);
    if (!candidate || !candidate.shape || typeof candidate.shape.intersect !== "function") {
      return null;
    }
    const points = [];
    for (const entry of shapes) {
      if (!entry || !entry.shape || typeof entry.shape.intersect !== "function") {
        continue;
      }
      try {
        const inters = candidate.shape.intersect(entry.shape) || [];
        inters.forEach((p) => {
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
            points.push({ x: p.x, y: p.y });
          }
        });
      } catch {
        // ignore bad geometries
      }
      if (points.length) {
        break;
      }
    }
    if (!points.length) {
      return null;
    }
    const unique = dedupePoints(points, COLLISION_TOLERANCE_MM);
    return { active: true, points: unique, count: unique.length };
  }

  return {
    invalidate,
    findMagnet,
    detectCollision
  };
}
