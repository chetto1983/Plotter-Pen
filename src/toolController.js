import { TOOL_HINTS } from "./constants.js";
import { distance } from "./geometry.js";

const TWO_PI = Math.PI * 2;
const MIN_RECT_SIDE = 0.05;

const DEFAULT_ARC_BUILDER = () => ({
  phase: 'idle',
  start: null,
  end: null,
  through: null,
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
  const numerator = dy * point.x - dx * point.y + end.x * start.y - end.y * start.x;
  return numerator / norm;
}

function buildArcGeometry(start, through, end) {
  const circle = circleFromThreePoints(start, through, end);
  if (!circle) {
    return null;
  }
  const vStart = { x: start.x - circle.cx, y: start.y - circle.cy };
  const vThrough = { x: through.x - circle.cx, y: through.y - circle.cy };
  const vEnd = { x: end.x - circle.cx, y: end.y - circle.cy };

  const cross = vStart.x * vThrough.y - vStart.y * vThrough.x;
  if (Math.abs(cross) < 1e-8) {
    return null;
  }

  let startAngle = Math.atan2(vStart.y, vStart.x);
  let throughAngle = Math.atan2(vThrough.y, vThrough.x);
  let endAngle = Math.atan2(vEnd.y, vEnd.x);
  const dir = cross >= 0 ? "CCW" : "CW";

  if (dir === "CCW") {
    while (throughAngle < startAngle) {
      throughAngle += TWO_PI;
    }
    while (endAngle < startAngle) {
      endAngle += TWO_PI;
    }
    if (endAngle < throughAngle) {
      endAngle += TWO_PI;
    }
  } else {
    while (throughAngle > startAngle) {
      throughAngle -= TWO_PI;
    }
    while (endAngle > startAngle) {
      endAngle -= TWO_PI;
    }
    if (endAngle > throughAngle) {
      endAngle -= TWO_PI;
    }
  }

  return {
    cx: circle.cx,
    cy: circle.cy,
    r: circle.r,
    dir,
    startAngle,
    endAngle
  };
}

function sampleArcPoints(geometry) {
  const totalAngle = geometry.endAngle - geometry.startAngle;
  if (!Number.isFinite(totalAngle) || Math.abs(totalAngle) < 1e-4) {
    return [];
  }
  const stepAngle = Math.PI / 36;
  const steps = Math.max(8, Math.ceil(Math.abs(totalAngle) / stepAngle));
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
  }

  function finishArcStep(endPoint, options = {}) {
    const point = getEffectivePoint(endPoint, options);
    if (!point) {
      return;
    }
    const builder = ensureArcBuilder();
    if (builder.phase === 'draggingEnd') {
      builder.end = { x: point.x, y: point.y };
      builder.phase = 'adjusting';
      state.drawing.isDrawing = false;
      state.drawing.startPoint = builder.start ? { x: builder.start.x, y: builder.start.y } : null;
      state.drawing.tempShape = {
        type: 'line',
        x1: builder.start ? builder.start.x : point.x,
        y1: builder.start ? builder.start.y : point.y,
        x2: builder.end.x,
        y2: builder.end.y
      };
      state.drawing.arcControlPoint = null;
      state.drawing.arcControlInfo = null;
      renderer.redrawAll();
      renderer.drawTempShape();
      return;
    }
    if (builder.phase === 'adjusting') {
      updateArcBuilder(endPoint, options);
      commitArcBuilder();
      return;
    }
    const fallbackStart = state.drawing.startPoint
      ? { x: state.drawing.startPoint.x, y: state.drawing.startPoint.y }
      : { x: point.x, y: point.y };
    const fallback = [fallbackStart, { x: point.x, y: point.y }];
    fallback.tool = 'line';
    state.drawing.strokes.push(fallback);
    snapManager.markAnchorsDirty();
    resetArcTracking();
    state.drawing.isDrawing = false;
    state.drawing.tempShape = null;
    state.drawing.startPoint = null;
    renderer.redrawAll();
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
    if (builder.phase !== 'adjusting') {
      return;
    }
    if (!builder.start || !builder.end) {
      return;
    }
    const through = { x: point.x, y: point.y };
    const geometry = buildArcGeometry(builder.start, through, builder.end);
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
      builder.geometry = null;
      builder.through = null;
      renderer.redrawAll();
      renderer.drawTempShape();
      return;
    }
    builder.geometry = geometry;
    builder.through = clonePoint(through);
    const signed = computeSignedDistanceToChord(builder.start, builder.end, through);
    state.drawing.arcControlPoint = clonePoint(through);
    state.drawing.arcControlInfo = {
      point: clonePoint(through),
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
      dir: geometry.dir
    };
    renderer.redrawAll();
    renderer.drawTempShape();
  }

  function commitArcBuilder() {
    const builder = ensureArcBuilder();
    if (!builder.start || !builder.end) {
      return false;
    }
    if (!builder.geometry) {
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
    const arcPoints = sampleArcPoints(builder.geometry);
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
    const controlPoint = builder.through ? clonePoint(builder.through) : null;
    const signed = controlPoint ? computeSignedDistanceToChord(builder.start, builder.end, controlPoint) : 0;
    arcPoints.tool = 'arc';
    arcPoints.arcInfo = {
      start: { x: builder.start.x, y: builder.start.y },
      end: { x: builder.end.x, y: builder.end.y },
      center: { x: builder.geometry.cx, y: builder.geometry.cy },
      radius: builder.geometry.r,
      dir: builder.geometry.dir,
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
      if (!state.deletion.active) {
        state.deletion.markedPrimitiveId = null;
      }
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
      if (builder.phase === 'adjusting') {
        updateArcBuilder(startPoint, options);
        if (!commitArcBuilder()) {
          resetArcTracking();
          renderer.redrawAll();
        }
        return false;
      }
      builder.phase = 'draggingEnd';
      builder.start = { x: point.x, y: point.y };
      builder.end = null;
      builder.through = null;
      builder.geometry = null;
      state.drawing.startPoint = { x: point.x, y: point.y };
      state.drawing.isDrawing = true;
      state.drawing.tempShape = null;
      state.drawing.arcPointerHistory = [{ x: point.x, y: point.y }];
      state.drawing.arcControlPoint = null;
      state.drawing.arcControlInfo = null;
      return true;
    }
    state.drawing.startPoint = { x: point.x, y: point.y };
    state.drawing.isDrawing = true;
    state.drawing.tempShape = null;
    resetArcTracking();
    return true;
  }

  function updateCurrentShape(currentPoint, options = {}) {
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
      case "arc": {
        const builder = ensureArcBuilder();
        if (builder.phase === 'draggingEnd') {
          state.drawing.tempShape = {
            type: "line",
            x1: start.x,
            y1: start.y,
            x2: point.x,
            y2: point.y
          };
        }
        break;
      }
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
        finishArcStep(point, options);
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


