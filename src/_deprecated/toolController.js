import { TOOL_HINTS } from "./constants.js";
import { distance } from "./geometry.js";

const TWO_PI = Math.PI * 2;
const MIN_RECT_SIDE = 0.05;
const MIN_ARC_CHORD = 0.25;
const ARC_EPSILON = 1e-6;

const DEFAULT_ARC_BUILDER = () => ({
  phase: 'idle',
  start: null,
  end: null,
  control: null,
  geometry: null
});

function clonePoint(point) {
  return point ? { x: point.x, y: point.y } : null;
}

function circleFromThreePoints(p1, p2, p3) {
  if (!p1 || !p2 || !p3) {
    return null;
  }
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-6) {
    return null;
  }
  const p1Sq = p1.x * p1.x + p1.y * p1.y;
  const p2Sq = p2.x * p2.x + p2.y * p2.y;
  const p3Sq = p3.x * p3.x + p3.y * p3.y;
  const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
  const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
  const r = Math.hypot(p1.x - cx, p1.y - cy);
  if (!Number.isFinite(r) || r < 1e-3) {
    return null;
  }
  return { cx, cy, r };
}

function computeSignedDistanceToChord(start, end, point) {
  if (!start || !end || !point) {
    return 0;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const norm = Math.hypot(dx, dy);
  if (norm < 1e-6) {
    return 0;
  }
  const numerator = (dx * (point.y - start.y)) - (dy * (point.x - start.x));
  return numerator / norm;
}

function buildArcGeometry(start, through, end) {
  if (!start || !through || !end) {
    return null;
  }
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(chord) || chord < MIN_ARC_CHORD) {
    return null;
  }
  // work in math coordinates (y up) to avoid canvas inversion issues
  const toMath = (p) => ({ x: p.x, y: -p.y });
  const startM = toMath(start);
  const throughM = toMath(through);
  const endM = toMath(end);

  const circleM = circleFromThreePoints(startM, throughM, endM);
  const circle = circleM ? { cx: circleM.cx, cy: -circleM.cy, r: circleM.r } : null;
  if (!circle) {
    return null;
  }

  const normalizePos = (a) => {
    let ang = a % TWO_PI;
    if (ang < 0) ang += TWO_PI;
    return ang;
  };

  // angles in math coordinates
  const startAngM = normalizePos(Math.atan2(startM.y - circleM.cy, startM.x - circleM.cx));
  const throughAngM = normalizePos(Math.atan2(throughM.y - circleM.cy, throughM.x - circleM.cx));
  const endAngM = normalizePos(Math.atan2(endM.y - circleM.cy, endM.x - circleM.cx));

  const ccwSpan = normalizePos(endAngM - startAngM); // 0..2pi
  const cwSpan = TWO_PI - ccwSpan; // 0..2pi
  const throughFromStart = normalizePos(throughAngM - startAngM);
  const useCCW = throughFromStart <= ccwSpan + 1e-6;

  const sweepMath = useCCW ? Math.max(ccwSpan, ARC_EPSILON) : -Math.max(cwSpan, ARC_EPSILON);

  // convert to canvas angles (y down): flip sweep sign, keep start at canvas
  const startCanvas = Math.atan2(start.y - circle.cy, start.x - circle.cx);
  const sweepCanvas = -sweepMath;

  if (!Number.isFinite(sweepCanvas) || Math.abs(sweepCanvas) < 1e-4) {
    return null;
  }
  const dir = sweepCanvas < 0 ? "CCW" : "CW";

  return {
    cx: circle.cx,
    cy: circle.cy,
    r: circle.r,
    dir,
    startAngle: startCanvas,
    endAngle: startCanvas + sweepCanvas,
    sweep: sweepCanvas
  };
}

function sampleArcPoints(geometry) {
  const totalAngle = geometry.sweep;
  if (!Number.isFinite(totalAngle) || Math.abs(totalAngle) < 1e-4) {
    return [];
  }
  const stepAngle = Math.PI / 36;
  const steps = Math.max(16, Math.ceil(Math.abs(totalAngle) / stepAngle));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = geometry.startAngle + totalAngle * t;
    const x = geometry.cx + geometry.r * Math.cos(angle);
    const y = geometry.cy + geometry.r * Math.sin(angle);
    points.push({ x, y });
  }
  return points;
}

export function createToolController(state, renderer, snapManager) {
  function ensureArcBuilder() {
    if (!state.drawing.arcBuilder) {
      state.drawing.arcBuilder = DEFAULT_ARC_BUILDER();
    }
    return state.drawing.arcBuilder;
  }

  ensureArcBuilder();

  function refreshTempCollision() {
    if (typeof snapManager.detectCollision !== 'function') {
      return;
    }
    if (!state.drawing.tempShape) {
      state.snap.lastCollision = null;
      return;
    }
    const collision = snapManager.detectCollision(state.drawing.tempShape);
    state.drawing.tempShape.collision = collision;
    state.snap.lastCollision = collision;
  }

  function getEffectivePoint(rawPoint, options = {}) {
    const candidate = options && options.snappedPoint;
    if (candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y)) {
      return { x: candidate.x, y: candidate.y };
    }
    if (rawPoint && Number.isFinite(rawPoint.x) && Number.isFinite(rawPoint.y)) {
      return { x: rawPoint.x, y: rawPoint.y };
    }
    return null;
  }

  function resetArcTracking() {
    state.drawing.arcPointerHistory = [];
    state.drawing.arcControlPoint = null;
    state.drawing.arcControlInfo = null;
    state.drawing.arcBuilder = DEFAULT_ARC_BUILDER();
    state.snap.lastCollision = null;
  }

  function startArcSession(startPoint) {
    resetArcTracking();
    const builder = ensureArcBuilder();
    builder.phase = 'setEnd';
    builder.start = clonePoint(startPoint);
    builder.end = null;
    builder.control = null;
    builder.geometry = null;
    state.drawing.startPoint = clonePoint(startPoint);
    state.drawing.isDrawing = true;
    state.drawing.tempShape = null;
    state.drawing.arcControlPoint = null;
    state.drawing.arcControlInfo = null;
    refreshTempCollision();
  }

  function setArcEndPoint(endPoint) {
    const builder = ensureArcBuilder();
    builder.end = clonePoint(endPoint);
    builder.phase = 'setBulge';
    state.drawing.isDrawing = false;
    state.drawing.startPoint = builder.start ? clonePoint(builder.start) : null;
    state.drawing.tempShape = {
      type: 'line',
      x1: builder.start?.x ?? endPoint.x,
      y1: builder.start?.y ?? endPoint.y,
      x2: endPoint.x,
      y2: endPoint.y
    };
    state.drawing.arcControlPoint = null;
    state.drawing.arcControlInfo = null;
    refreshTempCollision();
    renderer.redrawAll();
    renderer.drawTempShape();
  }

  function updateArcBuilder(rawPoint, options = {}) {
    if (state.drawing.currentTool !== 'arc') {
      return;
    }
    const point = getEffectivePoint(rawPoint, options);
    if (!point) {
      return;
    }
    const builder = ensureArcBuilder();

    if (builder.phase === 'setEnd' && builder.start) {
      state.drawing.startPoint = clonePoint(builder.start);
      state.drawing.tempShape = {
        type: 'line',
        x1: builder.start.x,
        y1: builder.start.y,
        x2: point.x,
        y2: point.y
      };
      state.drawing.isDrawing = true;
      refreshTempCollision();
      renderer.redrawAll();
      renderer.drawTempShape();
      return;
    }

    if (builder.phase !== 'setBulge' || !builder.start || !builder.end) {
      return;
    }

    const control = { x: point.x, y: point.y };
    const geometry = buildArcGeometry(builder.start, control, builder.end);
    builder.control = clonePoint(control);
    builder.geometry = geometry;

    if (!geometry) {
      state.drawing.tempShape = {
        type: 'line',
        x1: builder.start.x,
        y1: builder.start.y,
        x2: builder.end.x,
        y2: builder.end.y
      };
      state.drawing.arcControlPoint = null;
      state.drawing.arcControlInfo = null;
      refreshTempCollision();
      renderer.redrawAll();
      renderer.drawTempShape();
      return;
    }

    const signed = computeSignedDistanceToChord(builder.start, builder.end, control);
    state.drawing.arcControlPoint = clonePoint(control);
    state.drawing.arcControlInfo = {
      point: clonePoint(control),
      signedDistance: signed
    };
    state.drawing.tempShape = {
      type: 'arc',
      x1: builder.start.x,
      y1: builder.start.y,
      x2: builder.end.x,
      y2: builder.end.y,
      cx: geometry.cx,
      cy: geometry.cy,
      r: geometry.r,
      dir: geometry.dir,
      startAngle: geometry.startAngle,
      endAngle: geometry.endAngle,
      control: clonePoint(control)
    };
    refreshTempCollision();
    renderer.redrawAll();
    renderer.drawTempShape();
  }

  function commitArcBuilder() {
    const builder = ensureArcBuilder();
    if (!builder.start || !builder.end) {
      return false;
    }

    let geometry = builder.geometry;
    if (!geometry && builder.control) {
      geometry = buildArcGeometry(builder.start, builder.control, builder.end);
    }

    if (!geometry) {
      const fallbackLine = [
        { x: builder.start.x, y: builder.start.y },
        { x: builder.end.x, y: builder.end.y }
      ];
      fallbackLine.tool = 'line';
      state.drawing.strokes.push(fallbackLine);
      snapManager.markAnchorsDirty();
      resetArcTracking();
      state.drawing.isDrawing = false;
      state.drawing.tempShape = null;
      state.drawing.startPoint = null;
      renderer.redrawAll();
      return true;
    }

    const arcPoints = sampleArcPoints(geometry);
    if (!arcPoints.length) {
      const fallbackLine = [
        { x: builder.start.x, y: builder.start.y },
        { x: builder.end.x, y: builder.end.y }
      ];
      fallbackLine.tool = 'line';
      state.drawing.strokes.push(fallbackLine);
      snapManager.markAnchorsDirty();
      resetArcTracking();
      state.drawing.tempShape = null;
      state.drawing.startPoint = null;
      renderer.redrawAll();
      return true;
    }

    arcPoints[0] = { x: builder.start.x, y: builder.start.y };
    arcPoints[arcPoints.length - 1] = { x: builder.end.x, y: builder.end.y };
    const controlPoint = builder.control ? clonePoint(builder.control) : null;
    const signed = controlPoint ? computeSignedDistanceToChord(builder.start, builder.end, controlPoint) : 0;
    arcPoints.tool = 'arc';
    arcPoints.arcInfo = {
      start: { x: builder.start.x, y: builder.start.y },
      end: { x: builder.end.x, y: builder.end.y },
      center: { x: geometry.cx, y: geometry.cy },
      radius: geometry.r,
      dir: geometry.dir,
      startAngle: geometry.startAngle,
      endAngle: geometry.endAngle,
      sweep: geometry.sweep,
      control: controlPoint,
      controlSignedDistance: signed
    };
    state.drawing.strokes.push(arcPoints);
    snapManager.markAnchorsDirty();
    resetArcTracking();
    state.drawing.isDrawing = false;
    state.drawing.tempShape = null;
    state.drawing.startPoint = null;
    renderer.redrawAll();
    return true;
  }

  function setActiveTool(tool) {
    state.drawing.currentTool = tool;
    for (const btn of state.elements.toolButtons || []) {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    }
    if (state.elements.hint && TOOL_HINTS[tool]) {
      state.elements.hint.textContent = TOOL_HINTS[tool];
    }

    if (state.deletion) {
      state.deletion.active = tool === "delete";
      state.deletion.markedPrimitiveId = null;
      state.deletion.markedPrimitiveData = null;
    }

    if (tool === "delete") {
      state.drawing.isDrawing = false;
      state.drawing.tempShape = null;
      state.drawing.startPoint = null;
      cancelPolygon();
      resetArcTracking();
      renderer.redrawAll();
      return;
    }

    if (tool !== "polygon") {
      cancelPolygon();
    }
    if (tool !== "arc") {
      resetArcTracking();
    }
  }

  function startShape(startPoint, options = {}) {
    const point = getEffectivePoint(startPoint, options);
    if (!point) {
      return false;
    }
    if (state.drawing.currentTool === "arc") {
      const builder = ensureArcBuilder();
      if (builder.phase === 'setBulge' && builder.start && builder.end) {
        updateArcBuilder(startPoint, options);
        if (!commitArcBuilder()) {
          resetArcTracking();
          renderer.redrawAll();
        }
        return false;
      }
      startArcSession(point);
      return true;
    }
    state.drawing.startPoint = { x: point.x, y: point.y };
    state.drawing.isDrawing = true;
    state.drawing.tempShape = null;
    resetArcTracking();
    return true;
  }
  function updateCurrentShape(currentPoint, options = {}) {
    if (state.drawing.currentTool === "arc") {
      updateArcBuilder(currentPoint, options);
      return;
    }
    if (!state.drawing.isDrawing || !state.drawing.startPoint) {
      return;
    }
    const point = getEffectivePoint(currentPoint, options);
    if (!point) {
      return;
    }
    const start = state.drawing.startPoint;
    switch (state.drawing.currentTool) {
      case "line":
        state.drawing.tempShape = {
          type: "line",
          x1: start.x,
          y1: start.y,
          x2: point.x,
          y2: point.y
        };
        break;
      case "rectangle":
        state.drawing.tempShape = {
          type: "rectangle",
          x: Math.min(start.x, point.x),
          y: Math.min(start.y, point.y),
          width: Math.abs(point.x - start.x),
          height: Math.abs(point.y - start.y),
          endX: point.x,
          endY: point.y
        };
        break;
      default:
        state.drawing.tempShape = null;
        break;
    }
    refreshTempCollision();
    renderer.redrawAll();
    renderer.drawTempShape();
  }

  function finishShape(endPoint, options = {}) {
    if (!state.drawing.startPoint) {
      return;
    }
    const point = getEffectivePoint(endPoint, options);
    if (!point) {
      state.drawing.isDrawing = false;
      state.drawing.tempShape = null;
      state.drawing.startPoint = null;
      resetArcTracking();
      renderer.redrawAll();
      return;
    }
    const start = state.drawing.startPoint;
    switch (state.drawing.currentTool) {
      case "line": {
        const lineStroke = [{ x: start.x, y: start.y }, { x: point.x, y: point.y }];
        lineStroke.tool = "line";
        state.drawing.strokes.push(lineStroke);
        snapManager.markAnchorsDirty();
        break;
      }
      case "arc": {
        const builder = ensureArcBuilder();
        if (builder.phase === 'setEnd') {
          setArcEndPoint(point);
        } else if (builder.phase === 'setBulge') {
          updateArcBuilder(point, options);
          commitArcBuilder();
        } else {
          // no active arc, treat as new start->end line fallback
          const fallback = [{ x: start.x, y: start.y }, { x: point.x, y: point.y }];
          fallback.tool = 'line';
          state.drawing.strokes.push(fallback);
          snapManager.markAnchorsDirty();
          resetArcTracking();
          renderer.redrawAll();
        }
        return;
      }
      case "rectangle": {
        const tempRect = state.drawing.tempShape && state.drawing.tempShape.type === "rectangle"
          ? state.drawing.tempShape
          : null;
        const rawEndX = typeof point.x === "number" ? point.x : start.x;
        const rawEndY = typeof point.y === "number" ? point.y : start.y;

        const rectX = tempRect ? tempRect.x : Math.min(start.x, rawEndX);
        const rectY = tempRect ? tempRect.y : Math.min(start.y, rawEndY);
        const rectWidth = tempRect ? tempRect.width : Math.abs(rawEndX - start.x);
        const rectHeight = tempRect ? tempRect.height : Math.abs(rawEndY - start.y);

        if (rectWidth < MIN_RECT_SIDE || rectHeight < MIN_RECT_SIDE) {
          const fallbackEnd = tempRect
            ? { x: typeof tempRect.endX === "number" ? tempRect.endX : rawEndX, y: typeof tempRect.endY === "number" ? tempRect.endY : rawEndY }
            : { x: rawEndX, y: rawEndY };
          const fallbackLine = [{ x: start.x, y: start.y }, { x: fallbackEnd.x, y: fallbackEnd.y }];
          fallbackLine.tool = "line";
          state.drawing.strokes.push(fallbackLine);
        } else {
          const x2 = rectX + rectWidth;
          const y2 = rectY + rectHeight;
          const rectStroke = [
            { x: rectX, y: rectY },
            { x: x2, y: rectY },
            { x: x2, y: y2 },
            { x: rectX, y: y2 },
            { x: rectX, y: rectY }
          ];
          rectStroke.tool = "rectangle";
          rectStroke.bounds = { x: rectX, y: rectY, width: rectWidth, height: rectHeight };
          rectStroke.start = { x: start.x, y: start.y };
          rectStroke.end = tempRect
            ? { x: typeof tempRect.endX === "number" ? tempRect.endX : rawEndX, y: typeof tempRect.endY === "number" ? tempRect.endY : rawEndY }
            : { x: rawEndX, y: rawEndY };
          state.drawing.strokes.push(rectStroke);
        }
        snapManager.markAnchorsDirty();
        break;
      }
      default:
        break;
    }
    state.drawing.isDrawing = false;
    state.drawing.startPoint = null;
    state.drawing.tempShape = null;
    state.snap.lastCollision = null;
    resetArcTracking();
    renderer.redrawAll();
  }

  function handlePolygonClick(point) {
    if (!state.drawing.isDrawingPolygon) {
      state.drawing.isDrawingPolygon = true;
      state.drawing.polygonPoints = [{ x: point.x, y: point.y }];
      state.drawing.tempShape = { type: "polygon", points: [...state.drawing.polygonPoints] };
      renderer.redrawAll();
      renderer.drawTempShape();
      return { finished: false };
    }

    const firstPoint = state.drawing.polygonPoints[0];
    const closeThreshold = 6;
    if (firstPoint && distance(firstPoint, point) <= closeThreshold && state.drawing.polygonPoints.length >= 3) {
      finishPolygon();
      return { finished: true };
    }

    state.drawing.polygonPoints.push({ x: point.x, y: point.y });
    state.drawing.tempShape = { type: "polygon", points: [...state.drawing.polygonPoints] };
    renderer.redrawAll();
    renderer.drawTempShape();
    return { finished: false };
  }

  function updatePolygonPreview(point) {
    if (!state.drawing.isDrawingPolygon || state.drawing.polygonPoints.length === 0) {
      return;
    }
    state.drawing.tempShape = {
      type: "polygon",
      points: [...state.drawing.polygonPoints, { x: point.x, y: point.y }]
    };
    renderer.redrawAll();
    renderer.drawTempShape();
  }

  function finishPolygon() {
    if (state.drawing.polygonPoints.length >= 3) {
      const closedPolygon = [...state.drawing.polygonPoints, state.drawing.polygonPoints[0]];
      closedPolygon.tool = "polygon";
      state.drawing.strokes.push(closedPolygon);
      snapManager.markAnchorsDirty();
    }
    state.drawing.isDrawingPolygon = false;
    state.drawing.polygonPoints = [];
    state.drawing.tempShape = null;
    renderer.redrawAll();
  }

  function cancelPolygon() {
    state.drawing.isDrawingPolygon = false;
    state.drawing.polygonPoints = [];
    state.drawing.tempShape = null;
    renderer.redrawAll();
  }

  return {
    setActiveTool,
    startShape,
    updateCurrentShape,
    finishShape,
    handlePolygonClick,
    updatePolygonPreview,
    finishPolygon,
    cancelPolygon,
    updateArcBuilder
  };
}



