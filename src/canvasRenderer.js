import { UI_DPI } from "./constants.js";

export function createCanvasRenderer(state) {
  const { canvas, ctx } = state.elements;
  const TWO_PI = Math.PI * 2;
  const ARC_EPSILON = 1e-6;

  function getEffectiveScale() {
    return state.view.scaleFactor * state.dpr * state.view.zoom;
  }

  function applyViewTransform() {
    const scale = getEffectiveScale();
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      state.view.panX * state.dpr,
      state.view.panY * state.dpr
    );
    return scale;
  }

  function withViewContext(drawer) {
    ctx.save();
    const scale = applyViewTransform();
    try {
      drawer(ctx, scale);
    } finally {
      ctx.restore();
    }
  }

  function drawDot(x, y) {
    withViewContext((viewCtx, scale) => {
      viewCtx.save();
      viewCtx.lineCap = 'round';
      viewCtx.lineJoin = 'round';
      viewCtx.strokeStyle = '#c8d8ff';
      viewCtx.lineWidth = state.drawing.penSize / scale;
      viewCtx.beginPath();
      viewCtx.moveTo(x, y);
      viewCtx.lineTo(x + 0.01, y + 0.01);
      viewCtx.stroke();
      viewCtx.restore();
    });
  }

  function drawSegment(x1, y1, x2, y2) {
    withViewContext((viewCtx, scale) => {
      viewCtx.save();
      viewCtx.lineCap = 'round';
      viewCtx.lineJoin = 'round';
      viewCtx.strokeStyle = '#c8d8ff';
      viewCtx.lineWidth = state.drawing.penSize / scale;
      viewCtx.beginPath();
      viewCtx.moveTo(x1, y1);
      viewCtx.lineTo(x2, y2);
      viewCtx.stroke();
      viewCtx.restore();
    });
  }

  function drawGrid(viewCtx, width, height, scale) {
    const spacing = Math.max(0.5, state.grid.spacingMm || 1);
    const majorEvery = Math.max(1, Math.floor(state.grid.majorEvery || 1));
    const majorSpacing = spacing * majorEvery;
    const lineWidth = 1 / Math.max(scale, 1e-6);

    viewCtx.save();
    viewCtx.lineWidth = lineWidth;
    viewCtx.setLineDash([]);
    viewCtx.strokeStyle = 'rgba(200, 215, 255, 0.12)';
    viewCtx.beginPath();
    for (let x = 0; x <= width; x += spacing) {
      viewCtx.moveTo(x, 0);
      viewCtx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += spacing) {
      viewCtx.moveTo(0, y);
      viewCtx.lineTo(width, y);
    }
    viewCtx.stroke();

    if (majorEvery > 1) {
      viewCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      viewCtx.lineWidth = 1.5 * lineWidth;
      viewCtx.beginPath();
      for (let x = 0; x <= width; x += majorSpacing) {
        viewCtx.moveTo(x, 0);
        viewCtx.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += majorSpacing) {
        viewCtx.moveTo(0, y);
        viewCtx.lineTo(width, y);
      }
      viewCtx.stroke();
    }

    viewCtx.restore();
  }

  function computeArcRenderData(arc) {
    if (!arc || !Number.isFinite(arc.cx) || !Number.isFinite(arc.cy) || !Number.isFinite(arc.r) || arc.r <= 0) {
      return { startAngle: 0, endAngle: 0, anticlockwise: false };
    }

    const dir = (arc.dir || 'CW').toUpperCase();
    const hasStoredAngles = Number.isFinite(arc.startAngle) && Number.isFinite(arc.endAngle);

    const startAngle = hasStoredAngles
      ? arc.startAngle
      : Math.atan2(arc.y1 - arc.cy, arc.x1 - arc.cx);
    const rawEndAngle = hasStoredAngles
      ? arc.endAngle
      : Math.atan2(arc.y2 - arc.cy, arc.x2 - arc.cx);

    let sweep = rawEndAngle - startAngle;

    if (!hasStoredAngles) {
      if (dir === 'CCW') {
        while (sweep <= 0) {
          sweep += TWO_PI;
        }
      } else {
        while (sweep >= 0) {
          sweep -= TWO_PI;
        }
      }
    }

    const sweepMagnitudeRaw = Math.abs(sweep) % TWO_PI;
    const sweepMagnitude = sweepMagnitudeRaw < ARC_EPSILON ? TWO_PI : sweepMagnitudeRaw;

    if (dir === 'CCW') {
      return {
        startAngle,
        endAngle: startAngle + sweepMagnitude,
        anticlockwise: true
      };
    }

    return {
      startAngle,
      endAngle: startAngle - sweepMagnitude,
      anticlockwise: false
    };
  }

  function computeArcMidpoint(arc, renderData) {
    if (!arc || !Number.isFinite(arc.cx) || !Number.isFinite(arc.cy) || !Number.isFinite(arc.r) || arc.r <= 0) {
      return null;
    }
    if (!Number.isFinite(arc.x1) || !Number.isFinite(arc.y1) || !Number.isFinite(arc.x2) || !Number.isFinite(arc.y2)) {
      return null;
    }
    const render = renderData || computeArcRenderData(arc);
    const midAngle = render.startAngle + (render.endAngle - render.startAngle) / 2;
    return {
      x: arc.cx + arc.r * Math.cos(midAngle),
      y: arc.cy + arc.r * Math.sin(midAngle)
    };
  }

  function drawArcMidpointMarker(viewCtx, point, scale) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    const effectiveScale = scale && scale > 0 ? scale : getEffectiveScale();
    const radius = Math.max(2.5 / effectiveScale, (state.drawing.penSize * 0.6) / effectiveScale);
    viewCtx.save();
    viewCtx.fillStyle = '#20c060';
    viewCtx.beginPath();
    viewCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    viewCtx.fill();
    viewCtx.lineWidth = Math.max(1 / effectiveScale, 0.5 / effectiveScale);
    viewCtx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    viewCtx.stroke();
    viewCtx.restore();
  }

  function drawArcEndpointMarker(viewCtx, point, scale) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return;
    }
    const effectiveScale = scale && scale > 0 ? scale : getEffectiveScale();
    const radius = Math.max(3 / effectiveScale, (state.drawing.penSize * 0.75) / effectiveScale);
    viewCtx.save();
    viewCtx.fillStyle = '#20c060';
    viewCtx.beginPath();
    viewCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    viewCtx.fill();
    viewCtx.lineWidth = Math.max(1 / effectiveScale, 0.5 / effectiveScale);
    viewCtx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    viewCtx.stroke();
    viewCtx.restore();
  }

  function getMarkedPrimitive() {
    if (!state.deletion || !state.deletion.markedPrimitiveId) {
      return null;
    }
    const current = state.extraction.last;
    if (!current || !Array.isArray(current.active_primitives)) {
      return null;
    }
    return current.active_primitives.find((prim) => prim && prim._id === state.deletion.markedPrimitiveId) || null;
  }

  function renderPrimitive(viewCtx, primitive, options = {}) {
    if (!primitive) {
      return;
    }
    const style = options.style || 'selection';
    const showMarkers = style !== 'delete';
    const baseLineWidth = style === 'hover' ? 4 : 5;
    const strokeStyle = style === 'hover' ? '#52a8ff' : style === 'delete' ? '#ffaa4d' : '#ff4d4d';
    const lineDash = style === 'delete' ? [8, 6] : [];
    const scale = getEffectiveScale();

    viewCtx.save();
    viewCtx.lineWidth = baseLineWidth;
    viewCtx.strokeStyle = strokeStyle;
    viewCtx.setLineDash(lineDash);
    if (primitive.type === 'line') {
      viewCtx.beginPath();
      viewCtx.moveTo(primitive.x1, primitive.y1);
      viewCtx.lineTo(primitive.x2, primitive.y2);
      viewCtx.stroke();
    } else if (primitive.type === 'arc') {
      viewCtx.beginPath();
      const render = computeArcRenderData(primitive);
      viewCtx.arc(primitive.cx, primitive.cy, primitive.r, render.startAngle, render.endAngle, render.anticlockwise);
      viewCtx.stroke();
      if (showMarkers) {
        const midPoint = computeArcMidpoint(primitive, render);
        if (midPoint) {
          drawArcMidpointMarker(viewCtx, midPoint, scale);
        }
        drawArcEndpointMarker(viewCtx, { x: primitive.x1, y: primitive.y1 }, scale);
        drawArcEndpointMarker(viewCtx, { x: primitive.x2, y: primitive.y2 }, scale);
      }
    }
    viewCtx.restore();
  }

  function drawTempShape() {
    const tempShape = state.drawing.tempShape;
    if (!tempShape) {
      return;
    }
    withViewContext((viewCtx, scale) => {
      viewCtx.save();
      viewCtx.lineCap = 'round';
      viewCtx.lineJoin = 'round';
      viewCtx.strokeStyle = '#c8d8ff';
      viewCtx.lineWidth = state.drawing.penSize / scale;
      viewCtx.setLineDash([5, 3]);

      switch (tempShape.type) {
        case 'line':
          viewCtx.beginPath();
          viewCtx.moveTo(tempShape.x1, tempShape.y1);
          viewCtx.lineTo(tempShape.x2, tempShape.y2);
          viewCtx.stroke();
          break;
        case 'arc': {
          viewCtx.beginPath();
          const { startAngle, endAngle, anticlockwise } = computeArcRenderData(tempShape);
          viewCtx.arc(tempShape.cx, tempShape.cy, tempShape.r, startAngle, endAngle, anticlockwise);
          viewCtx.stroke();
          drawArcMidpointMarker(viewCtx, state.drawing.arcControlPoint, scale);
          break;
        }
        case 'rectangle':
          viewCtx.beginPath();
          viewCtx.rect(tempShape.x, tempShape.y, tempShape.width, tempShape.height);
          viewCtx.stroke();
          break;
        case 'polygon':
          if (Array.isArray(tempShape.points) && tempShape.points.length > 1) {
            viewCtx.beginPath();
            viewCtx.moveTo(tempShape.points[0].x, tempShape.points[0].y);
            for (let i = 1; i < tempShape.points.length; i++) {
              viewCtx.lineTo(tempShape.points[i].x, tempShape.points[i].y);
            }
            viewCtx.stroke();
          }
          break;
        default:
          break;
      }

      viewCtx.restore();
    });
  }

  function drawStrokes(viewCtx, scale) {
    for (const stroke of state.drawing.strokes) {
      for (let i = 1; i < stroke.length; i++) {
        viewCtx.save();
        viewCtx.lineCap = 'round';
        viewCtx.lineJoin = 'round';
        viewCtx.strokeStyle = '#c8d8ff';
        viewCtx.lineWidth = state.drawing.penSize / scale;
        viewCtx.beginPath();
        viewCtx.moveTo(stroke[i - 1].x, stroke[i - 1].y);
        viewCtx.lineTo(stroke[i].x, stroke[i].y);
        viewCtx.stroke();
        viewCtx.restore();
      }

      const arcInfo = stroke && stroke.arcInfo;
      let markerPoint = null;
      if (arcInfo) {
        markerPoint = arcInfo.control || arcInfo.middle || arcInfo.mid || arcInfo.through || null;
        if (!markerPoint && arcInfo.start && arcInfo.end && arcInfo.center && arcInfo.radius) {
          markerPoint = computeArcMidpoint({
            x1: arcInfo.start.x,
            y1: arcInfo.start.y,
            x2: arcInfo.end.x,
            y2: arcInfo.end.y,
            cx: arcInfo.center.x,
            cy: arcInfo.center.y,
            r: arcInfo.radius,
            dir: arcInfo.dir
          });
        }
      } else if (stroke && stroke.tool === 'arc' && stroke.length >= 3) {
        markerPoint = stroke[Math.floor(stroke.length / 2)];
      }

      if (markerPoint && Number.isFinite(markerPoint.x) && Number.isFinite(markerPoint.y)) {
        drawArcMidpointMarker(viewCtx, markerPoint, scale);
      }
    }
  }

  function redrawAll() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.strokeStyle = 'rgba(82,168,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, canvas.clientWidth - 1, canvas.clientHeight - 1);
    ctx.restore();

    const mmWidth = state.workspace.widthMm || 100;
    const mmHeight = state.workspace.heightMm || 100;

    withViewContext((viewCtx, scale) => {
      viewCtx.save();
      viewCtx.fillStyle = 'rgba(20, 25, 40, 0.3)';
      viewCtx.fillRect(0, 0, mmWidth, mmHeight);
      viewCtx.restore();

      viewCtx.save();
      viewCtx.beginPath();
      viewCtx.rect(0, 0, mmWidth, mmHeight);
      viewCtx.clip();

      if (state.grid.show) {
        drawGrid(viewCtx, mmWidth, mmHeight, scale);
      }

      drawStrokes(viewCtx, scale);

      if (state.selection.primitive) {
        renderPrimitive(viewCtx, state.selection.primitive, { style: 'selection' });
      }

      const markedPrimitive = getMarkedPrimitive();
      if (markedPrimitive) {
        renderPrimitive(viewCtx, markedPrimitive, { style: 'delete' });
      }

      viewCtx.restore();

      viewCtx.save();
      viewCtx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
      viewCtx.lineWidth = 3 / scale;
      viewCtx.setLineDash([]);
      viewCtx.strokeRect(0, 0, mmWidth, mmHeight);
      viewCtx.restore();
    });
  }

  function resizeCanvas() {
    const mmWidth = Math.max(1, state.workspace.widthMm || 1);
    const mmHeight = Math.max(1, state.workspace.heightMm || 1);
    const canvasWidth = canvas.clientWidth || canvas.width;
    const canvasHeight = canvas.clientHeight || canvas.height;
    const scaleX = canvasWidth / mmWidth;
    const scaleY = canvasHeight / mmHeight;
    state.view.scaleFactor = Math.min(scaleX, scaleY);

    canvas.width = Math.floor(canvasWidth * state.dpr);
    canvas.height = Math.floor(canvasHeight * state.dpr);

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    redrawAll();
    updateDpiInfo();
  }

  function resetView() {
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    redrawAll();
    updateDpiInfo();
  }

  function updateDpiInfo() {
    if (!state.elements.dpiInfo) {
      return;
    }
    const dpiLabel = UI_DPI.toFixed(0);
    state.elements.dpiInfo.textContent = `DPI fisso: ${dpiLabel} (${dpiLabel} x ${dpiLabel})`;
  }

  function hideHoverTooltip() {
    if (!state.elements.hoverTooltip) {
      return;
    }
    state.elements.hoverTooltip.style.display = 'none';
  }

  return {
    resizeCanvas,
    redrawAll,
    resetView,
    drawDot,
    drawSegment,
    drawTempShape,
    renderPrimitive,
    hideHoverTooltip,
    updateDpiInfo,
    getEffectiveScale,
    withViewContext
  };
}



