import { SNAP_DISTANCE_MM, SNAP_LABELS } from "./constants.js";
import { distance } from "./geometry.js";

export function createSnapManager(state) {
  function markAnchorsDirty() {
    state.snap.anchorsDirty = true;
  }

  function resolveSnapLabel(type) {
    return SNAP_LABELS[type] || type;
  }

  function rebuildAnchors() {
    const anchors = [];
    const addAnchor = (x, y, type) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      anchors.push({ x, y, type });
    };

    for (const stroke of state.drawing.strokes) {
      if (!stroke || stroke.length < 1) {
        continue;
      }
      const tool = stroke.tool || stroke.sourceTool || null;
      if (tool === 'line' && stroke.length >= 2) {
        const start = stroke[0];
        const end = stroke[stroke.length - 1];
        addAnchor(start.x, start.y, 'line-start');
        addAnchor((start.x + end.x) / 2, (start.y + end.y) / 2, 'line-mid');
        addAnchor(end.x, end.y, 'line-end');
      } else if (tool === 'arc') {
        const arcInfo = stroke.arcInfo || null;
        const start = (arcInfo && arcInfo.start) || stroke[0];
        const end = (arcInfo && arcInfo.end) || stroke[stroke.length - 1];
        addAnchor(start.x, start.y, 'arc-start');
        if (arcInfo && arcInfo.center) {
          addAnchor(arcInfo.center.x, arcInfo.center.y, 'arc-center');
        }
        addAnchor(end.x, end.y, 'arc-end');
      }
    }

    const merged = state.extraction.last && Array.isArray(state.extraction.last.merged_primitives)
      ? state.extraction.last.merged_primitives
      : [];

    for (const prim of merged) {
      if (!prim) {
        continue;
      }
      if (prim.type === 'line') {
        addAnchor(prim.x1, prim.y1, 'line-start');
        addAnchor((prim.x1 + prim.x2) / 2, (prim.y1 + prim.y2) / 2, 'line-mid');
        addAnchor(prim.x2, prim.y2, 'line-end');
      } else if (prim.type === 'arc') {
        addAnchor(prim.x1, prim.y1, 'arc-start');
        if (prim.cx != null && prim.cy != null) {
          addAnchor(prim.cx, prim.cy, 'arc-center');
        }
        addAnchor(prim.x2, prim.y2, 'arc-end');
      }
    }

    state.snap.anchorsCache = anchors;
    state.snap.anchorsDirty = false;
    return anchors;
  }

  function getAnchors() {
    if (state.snap.anchorsDirty) {
      return rebuildAnchors();
    }
    return state.snap.anchorsCache;
  }

  function findNearestAnchor(point) {
    const anchors = getAnchors();
    let best = null;
    for (const anchor of anchors) {
      const d = distance(anchor, point);
      if (!best || d < best.distance) {
        best = { ...anchor, distance: d };
      }
    }
    return (best && best.distance <= SNAP_DISTANCE_MM) ? best : null;
  }

  function computeGridSnap(point) {
    const base = { x: point.x, y: point.y };
    if (!state.grid.snapToGrid) {
      return {
        snapped: base,
        distance: 0,
        info: { type: 'none', active: false, x: base.x, y: base.y, rawX: base.x, rawY: base.y }
      };
    }

    const spacing = Math.max(0.5, state.grid.spacingMm || 1);
    const mmW = state.workspace.widthMm || 100;
    const mmH = state.workspace.heightMm || 100;
    const snappedX = Math.round(point.x / spacing) * spacing;
    const snappedY = Math.round(point.y / spacing) * spacing;
    const clampedX = Math.max(0, Math.min(mmW, snappedX));
    const clampedY = Math.max(0, Math.min(mmH, snappedY));
    const diff = Math.hypot(clampedX - base.x, clampedY - base.y);

    return {
      snapped: { x: clampedX, y: clampedY },
      distance: diff,
      info: { type: 'grid', active: diff > 0.05, x: clampedX, y: clampedY, rawX: base.x, rawY: base.y }
    };
  }

  function snapPointToGrid(point) {
    const result = computeGridSnap(point);
    state.snap.lastInfo = result.info;
    state.snap.lastPointerRaw = { x: point.x, y: point.y };
    return result.snapped;
  }

  function applySnap(rawPos) {
    if (!rawPos) {
      return { point: rawPos, info: state.snap.lastInfo };
    }
    const allowAnchorSnap = !!state.snap.anchorSnapEnabled;
    const anchorSnap = allowAnchorSnap ? findNearestAnchor(rawPos) : null;
    const gridResult = computeGridSnap(rawPos);

    let snappedPoint = { x: rawPos.x, y: rawPos.y };
    let info = {
      type: 'none',
      active: false,
      x: rawPos.x,
      y: rawPos.y,
      rawX: rawPos.x,
      rawY: rawPos.y
    };

    if (anchorSnap) {
      snappedPoint = { x: anchorSnap.x, y: anchorSnap.y };
      info = {
        type: anchorSnap.type,
        active: true,
        x: anchorSnap.x,
        y: anchorSnap.y,
        rawX: rawPos.x,
        rawY: rawPos.y
      };
    } else if (gridResult.info.type === 'grid') {
      snappedPoint = gridResult.snapped;
      info = gridResult.info;
    } else if (gridResult.info.type === 'none') {
      info = gridResult.info;
    }

    state.snap.lastInfo = info;
    state.snap.lastPointerRaw = { x: rawPos.x, y: rawPos.y };
    return { point: snappedPoint, info };
  }

  function updateSnapUI(evt, rawPos, snapResult) {
    const raw = rawPos || state.snap.lastPointerRaw;
    if (state.elements.coordDisplay && raw) {
      state.elements.coordDisplay.textContent = `X ${raw.x.toFixed(2)} mm, Y ${raw.y.toFixed(2)} mm`;
    }

    const info = snapResult?.info || state.snap.lastInfo;
    if (state.elements.snapDisplay) {
      if (info && info.active) {
        const label = resolveSnapLabel(info.type);
        state.elements.snapDisplay.textContent = `Snap: ${label} (${info.x.toFixed(2)}, ${info.y.toFixed(2)})`;
      } else {
        state.elements.snapDisplay.textContent = 'Snap: Nessuno';
      }
    }

    const tooltipEl = state.elements.snapTooltip;
    if (!tooltipEl || !evt || !raw) {
      return;
    }

    const rect = state.elements.canvas.getBoundingClientRect();
    const offsetX = Math.min(rect.width - 12, Math.max(0, evt.clientX - rect.left + 12));
    const offsetY = Math.min(rect.height - 24, Math.max(0, evt.clientY - rect.top + 12));
    const displayPoint = (info && info.active) ? { x: info.x, y: info.y } : raw;

    const parts = [`X ${displayPoint.x.toFixed(2)}`, `Y ${displayPoint.y.toFixed(2)}`];
    if (info && info.active) {
      parts.push(resolveSnapLabel(info.type));
    }

    tooltipEl.textContent = parts.join('  ');
    tooltipEl.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    tooltipEl.classList.remove('hidden');
  }

  function hideSnapUI() {
    const tooltipEl = state.elements.snapTooltip;
    if (tooltipEl) {
      tooltipEl.classList.add('hidden');
    }
  }

  return {
    markAnchorsDirty,
    getAnchors,
    findNearestAnchor,
    computeGridSnap,
    snapPointToGrid,
    applySnap,
    updateSnapUI,
    hideSnapUI,
    resolveSnapLabel
  };
}
