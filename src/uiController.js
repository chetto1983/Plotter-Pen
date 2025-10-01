import { distanceToArc, distanceToLineSegment } from "./geometry.js";

export function createUiController({
  state,
  renderer,
  snapManager,
  strokeManager,
  toolController,
  pointerHelper,
  extractionService,
  outputController,
  hoverManager
}) {
  function getActivePrimitives() {
    if (typeof extractionService.getActivePrimitives === 'function') {
      return extractionService.getActivePrimitives() || [];
    }
    const current = state.extraction.last;
    if (!current || !Array.isArray(current.active_primitives)) {
      return [];
    }
    return current.active_primitives;
  }

  function findPrimitiveAtPosition(point) {
    const primitives = getActivePrimitives();
    if (!point || primitives.length === 0) {
      return null;
    }
    const scale = state.view.scaleFactor * (state.view.zoom || 1);
    const mmToleranceLine = scale ? 8 / scale : 8;
    const mmToleranceArc = scale ? 12 / scale : 12;
    let best = null;
    let bestDistance = Infinity;
    for (const prim of primitives) {
      if (!prim) {
        continue;
      }
      let dist = Infinity;
      if (prim.type === 'line') {
        dist = distanceToLineSegment(prim.x1, prim.y1, prim.x2, prim.y2, point.x, point.y);
        if (dist <= mmToleranceLine && dist < bestDistance) {
          bestDistance = dist;
          best = prim;
        }
      } else if (prim.type === 'arc') {
        dist = distanceToArc(prim, point);
        if (dist <= mmToleranceArc && dist < bestDistance) {
          bestDistance = dist;
          best = prim;
        }
      }
    }
    return best;
  }

  function updateDeletionInfo() {
    const infoEl = state.elements.deleteInfo;
    if (!infoEl) {
      return;
    }
    const current = state.extraction.last;
    const total = current?.total_active_primitives ?? getActivePrimitives().length;
    const marked = state.deletion?.markedPrimitiveData;
    if (!total) {
      infoEl.textContent = 'Nessuna primitiva attiva.';
      return;
    }
    const formatPoint = (x, y) => {
      const fx = Number.isFinite(x) ? x.toFixed(1) : '?';
      const fy = Number.isFinite(y) ? y.toFixed(1) : '?';
      return `(${fx}, ${fy})`;
    };
    const parts = [`Primitive attive: ${total}`];
    if (marked) {
      if (marked.type === 'line') {
        parts.push(`Linea ${formatPoint(marked.x1, marked.y1)} -> ${formatPoint(marked.x2, marked.y2)}`);
      } else if (marked.type === 'arc') {
        const radius = Number.isFinite(marked.r) ? marked.r.toFixed(1) : '?';
        parts.push(`Arco R=${radius} mm`);
      } else {
        parts.push('Selezione attiva');
      }
    } else {
      parts.push('Nessuna selezionata');
    }
    infoEl.textContent = parts.join(' | ');
  }

  function setMarkedPrimitive(primitive) {
    if (!state.deletion) {
      return;
    }
    if (primitive && primitive._id != null) {
      state.deletion.markedPrimitiveId = primitive._id;
      state.deletion.markedPrimitiveData = {
        type: primitive.type,
        x1: primitive.x1,
        y1: primitive.y1,
        x2: primitive.x2,
        y2: primitive.y2,
        r: primitive.r,
        dir: primitive.dir
      };
    } else {
      state.deletion.markedPrimitiveId = null;
      state.deletion.markedPrimitiveData = null;
    }
    updateDeletionInfo();
  }

  function approxEqual(a, b, eps = 0.35) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return false;
    }
    return Math.abs(a - b) <= eps;
  }

  function pointsEqual(p, q, eps = 0.35) {
    if (!p || !q) {
      return false;
    }
    return approxEqual(p.x, q.x, eps) && approxEqual(p.y, q.y, eps);
  }

  function removePrimitiveFromDrawing(primitive) {
    if (!primitive) {
      return false;
    }
    const strokes = state.drawing.strokes;
    if (!Array.isArray(strokes) || strokes.length === 0) {
      return false;
    }

    const strokeIndex = Number.isInteger(primitive._sourceStrokeIndex) ? primitive._sourceStrokeIndex : null;
    if (strokeIndex != null && strokeIndex >= 0 && strokeIndex < strokes.length) {
      strokes.splice(strokeIndex, 1);
      snapManager.markAnchorsDirty();
      state.hover.isHovering = false;
      state.hover.lastPrimitive = null;
      return true;
    }

    const segmentMatches = (a, b) => {
      if (!a || !b) {
        return false;
      }
      return (pointsEqual(a, { x: primitive.x1, y: primitive.y1 }) && pointsEqual(b, { x: primitive.x2, y: primitive.y2 })) ||
        (pointsEqual(a, { x: primitive.x2, y: primitive.y2 }) && pointsEqual(b, { x: primitive.x1, y: primitive.y1 }));
    };

    for (let i = 0; i < strokes.length; i++) {
      const stroke = strokes[i];
      if (!Array.isArray(stroke) || stroke.length < 2) {
        continue;
      }

      if (primitive.type === 'line') {
        let matches = false;
        if (stroke.tool === 'line' || stroke.length <= 2) {
          matches = segmentMatches(stroke[0], stroke[stroke.length - 1]);
        }
        if (!matches) {
          for (let j = 1; j < stroke.length; j++) {
            if (segmentMatches(stroke[j - 1], stroke[j])) {
              matches = true;
              break;
            }
          }
        }
        if (matches) {
          strokes.splice(i, 1);
          snapManager.markAnchorsDirty();
          state.hover.isHovering = false;
          state.hover.lastPrimitive = null;
          return true;
        }
      } else if (primitive.type === 'arc') {
        const arcInfo = stroke.arcInfo;
        if (!arcInfo && stroke.tool !== 'arc') {
          continue;
        }
        const start = arcInfo?.start || stroke[0];
        const end = arcInfo?.end || stroke[stroke.length - 1];
        const center = arcInfo?.center;
        const radius = arcInfo?.radius;
        const matchesEndpoints = (pointsEqual(start, { x: primitive.x1, y: primitive.y1 }) && pointsEqual(end, { x: primitive.x2, y: primitive.y2 })) ||
          (pointsEqual(start, { x: primitive.x2, y: primitive.y2 }) && pointsEqual(end, { x: primitive.x1, y: primitive.y1 }));
        const matchesCenter = center ? pointsEqual(center, { x: primitive.cx, y: primitive.cy }, 0.5) : true;
        const matchesRadius = Number.isFinite(radius) ? approxEqual(radius, primitive.r, 0.5) : true;
        const matchesDir = !primitive.dir || !arcInfo?.dir || primitive.dir === arcInfo.dir;
        if (matchesEndpoints && matchesCenter && matchesRadius && matchesDir) {
          strokes.splice(i, 1);
          snapManager.markAnchorsDirty();
          state.hover.isHovering = false;
          state.hover.lastPrimitive = null;
          return true;
        }
      }
    }
    return false;
  }

  function deleteMarkedPrimitive() {
    if (!state.deletion || state.deletion.markedPrimitiveId == null) {
      return false;
    }
    if (typeof extractionService.deletePrimitiveById !== 'function') {
      return false;
    }
    const id = state.deletion.markedPrimitiveId;
    const removed = extractionService.deletePrimitiveById(id);
    let removedFromDrawing = false;
    if (removed) {
      removedFromDrawing = removePrimitiveFromDrawing(removed);
    }
    setMarkedPrimitive(null);
    if (removedFromDrawing && typeof extractionService.extractAll === 'function') {
      extractionService.extractAll();
      updateDeletionInfo();
    }
    renderer.redrawAll();
    return true;
  }

  function setupPointerEvents() {
    const { canvas } = state.elements;
    if (!canvas) {
      return;
    }

    canvas.addEventListener('mousedown', (e) => {
      if (state.drawing.currentTool === 'delete') {
        if (e.button === 2) {
          if (!deleteMarkedPrimitive()) {
            updateDeletionInfo();
          }
          e.preventDefault();
          return;
        }
        if (e.button !== 0) {
          return;
        }
        const rawPos = pointerHelper.getPosition(e);
        const target = findPrimitiveAtPosition(rawPos);
        setMarkedPrimitive(target);
        renderer.redrawAll();
        e.preventDefault();
        return;
      }

      if (e.button === 2) {
        state.view.isPanning = true;
        state.view.lastPanX = e.clientX;
        state.view.lastPanY = e.clientY;
        e.preventDefault();
        return;
      }

      if (e.button !== 0) {
        return;
      }

      const rawPos = pointerHelper.getPosition(e);
      const snapResult = snapManager.applySnap(rawPos);
      snapManager.updateSnapUI(e, rawPos, snapResult);

      switch (state.drawing.currentTool) {
        case 'freehand':
          strokeManager.beginStroke(snapResult.point.x, snapResult.point.y);
          break;
        case 'polygon': {
          const { finished } = toolController.handlePolygonClick(rawPos);
          if (finished) {
            snapManager.markAnchorsDirty();
          }
          break;
        }
        default: {
          const started = toolController.startShape(rawPos, { snappedPoint: snapResult.point });
          state.drawing.isDrawing = !!started;
          break;
        }
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rawPos = pointerHelper.getPosition(e);
      const snapResult = snapManager.applySnap(rawPos);

      if (state.view.isPanning) {
        const dx = e.clientX - state.view.lastPanX;
        const dy = e.clientY - state.view.lastPanY;
        state.view.panX += dx;
        state.view.panY += dy;
        state.view.lastPanX = e.clientX;
        state.view.lastPanY = e.clientY;
        renderer.redrawAll();
      } else if ((e.buttons & 1) && state.drawing.isDrawing) {
        if (state.drawing.currentTool === 'freehand') {
          strokeManager.extendStroke(snapResult.point.x, snapResult.point.y);
        } else {
          toolController.updateCurrentShape(rawPos, { snappedPoint: snapResult.point });
        }
      }

      if (state.drawing.currentTool === 'polygon' && state.drawing.isDrawingPolygon) {
        toolController.updatePolygonPreview(rawPos);
      }

      if (state.drawing.currentTool === 'arc') {
        toolController.updateArcBuilder(rawPos, { snappedPoint: snapResult.point });
      }

      snapManager.updateSnapUI(e, rawPos, snapResult);
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        if (state.drawing.currentTool === 'freehand') {
          strokeManager.endStroke();
        } else if (state.drawing.currentTool !== 'polygon' && state.drawing.isDrawing) {
          const endPos = pointerHelper.getPosition(e);
          const snapResult = snapManager.applySnap(endPos);
          toolController.finishShape(endPos, { snappedPoint: snapResult.point });
          state.drawing.isDrawing = false;
          snapManager.updateSnapUI(e, endPos, snapResult);
        }
      }
      state.view.isPanning = false;
    });

    canvas.addEventListener('dblclick', (e) => {
      if (state.drawing.currentTool === 'polygon') {
        toolController.finishPolygon();
        snapManager.markAnchorsDirty();
        e.preventDefault();
      }
    });

    canvas.addEventListener('contextmenu', (e) => {
      if (state.drawing.currentTool === 'delete') {
        if (!deleteMarkedPrimitive()) {
          updateDeletionInfo();
        }
        e.preventDefault();
        return;
      }
      if (state.drawing.currentTool === 'polygon' && state.drawing.isDrawingPolygon) {
        toolController.cancelPolygon();
        e.preventDefault();
      } else {
        e.preventDefault();
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const scale = e.deltaY < 0 ? 1.1 : 0.9;
      state.view.zoom = Math.max(0.2, Math.min(5, state.view.zoom * scale));
      renderer.redrawAll();
    }, { passive: false });

    canvas.addEventListener('mouseleave', () => {
      state.view.isPanning = false;
      snapManager.hideSnapUI();
    });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (state.drawing.currentTool !== 'freehand') {
        return;
      }
      const rawPos = pointerHelper.getPosition(e);
      const snapped = snapManager.snapPointToGrid(rawPos);
      strokeManager.beginStroke(snapped.x, snapped.y);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (state.drawing.currentTool !== 'freehand') {
        return;
      }
      const rawPos = pointerHelper.getPosition(e);
      const snapped = snapManager.snapPointToGrid(rawPos);
      strokeManager.extendStroke(snapped.x, snapped.y);
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (state.drawing.currentTool === 'freehand') {
        strokeManager.endStroke();
      }
      e.preventDefault();
    }, { passive: false });
  }

  function setupControls() {
    const {
      penSizeInput,
      mmWidthInput,
      mmHeightInput,
      gridToggle,
      snapToggle,
      snapAnchorsToggle,
      gridSpacingInput,
      gridMajorEveryInput,
      btnFreehand,
      btnLine,
      btnArc,
      btnRectangle,
      btnPolygon,
      btnDeletePrimitives,
      btnClear,
      btnUndo,
      btnResetView,
      btnExtract,
      btnCopy,
      btnDownload
    } = state.elements;

    const activateTool = (tool) => {
      toolController.setActiveTool(tool);
      if (tool === 'delete') {
        const noExtraction = !state.extraction.last || !Array.isArray(state.extraction.last.active_primitives) || state.extraction.last.active_primitives.length === 0;
        const hasStrokes = Array.isArray(state.drawing.strokes) && state.drawing.strokes.length > 0;
        if (noExtraction && hasStrokes && typeof extractionService.extractAll === 'function') {
          extractionService.extractAll();
        }
      }
      setMarkedPrimitive(null);
      renderer.redrawAll();
      updateDeletionInfo();
    };

    if (penSizeInput) {
      penSizeInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        state.drawing.penSize = Number.isFinite(value) ? value : state.drawing.penSize;
      });
    }

    const sanitizeMmInput = (input, fallback, targetKey) => {
      if (!input) return;
      input.addEventListener('input', () => {
        const raw = parseFloat(input.value);
        if (Number.isFinite(raw) && raw > 0) {
          state.workspace[targetKey] = Math.min(5000, Math.max(1, raw));
        }
        input.value = state.workspace[targetKey].toString();
        renderer.resizeCanvas();
      });
      state.workspace[targetKey] = parseFloat(input.value) || fallback;
    };

    sanitizeMmInput(mmWidthInput, 600, 'widthMm');
    sanitizeMmInput(mmHeightInput, 600, 'heightMm');

    const applyGridSettings = (options = {}) => {
      const { redraw = true } = options;
      if (gridSpacingInput) {
        const raw = parseFloat(gridSpacingInput.value);
        if (Number.isFinite(raw) && raw > 0) {
          state.grid.spacingMm = Math.min(500, Math.max(0.5, raw));
        }
        gridSpacingInput.value = state.grid.spacingMm.toString();
      }
      if (gridMajorEveryInput) {
        const raw = parseInt(gridMajorEveryInput.value, 10);
        if (Number.isFinite(raw) && raw >= 1) {
          state.grid.majorEvery = Math.min(100, Math.max(1, raw));
        }
        gridMajorEveryInput.value = Math.round(state.grid.majorEvery).toString();
      }
      renderer.updateDpiInfo();
      if (redraw) {
        renderer.redrawAll();
      }
    };

    if (gridToggle) {
      state.grid.show = !!gridToggle.checked;
      gridToggle.addEventListener('change', (e) => {
        state.grid.show = !!e.target.checked;
        renderer.redrawAll();
      });
    }

    if (snapToggle) {
      state.grid.snapToGrid = !!snapToggle.checked;
      snapToggle.addEventListener('change', (e) => {
        state.grid.snapToGrid = !!e.target.checked;
        if (state.grid.snapToGrid && gridToggle && !gridToggle.checked) {
          state.grid.show = true;
          gridToggle.checked = true;
        }
        renderer.redrawAll();
      });
    }



    if (snapAnchorsToggle) {
      state.snap.anchorSnapEnabled = !!snapAnchorsToggle.checked;
      snapAnchorsToggle.addEventListener('change', (e) => {
        state.snap.anchorSnapEnabled = !!e.target.checked;
        const lastRaw = state.snap.lastPointerRaw;
        if (lastRaw) {
          const snapResult = snapManager.applySnap(lastRaw);
          snapManager.updateSnapUI(null, lastRaw, snapResult);
        } else if (!state.snap.anchorSnapEnabled) {
          state.snap.lastInfo = { type: 'none', active: false, x: 0, y: 0, rawX: 0, rawY: 0 };
          snapManager.updateSnapUI(null, null);
        }
      });
    }
    if (gridSpacingInput) {
      gridSpacingInput.addEventListener('input', () => {
        applyGridSettings();
        if (snapToggle && snapToggle.checked && gridToggle && !gridToggle.checked) {
          state.grid.show = true;
          gridToggle.checked = true;
        }
      });
    }

    if (gridMajorEveryInput) {
      gridMajorEveryInput.addEventListener('input', () => applyGridSettings());
    }

    applyGridSettings({ redraw: false });

    if (btnFreehand) btnFreehand.addEventListener('click', () => activateTool('freehand'));
    if (btnLine) btnLine.addEventListener('click', () => activateTool('line'));
    if (btnArc) btnArc.addEventListener('click', () => activateTool('arc'));
    if (btnRectangle) btnRectangle.addEventListener('click', () => activateTool('rectangle'));
    if (btnPolygon) btnPolygon.addEventListener('click', () => activateTool('polygon'));
    if (btnDeletePrimitives) btnDeletePrimitives.addEventListener('click', () => activateTool('delete'));

    if (btnResetView) {
      btnResetView.addEventListener('click', () => renderer.resetView());
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        state.drawing.strokes.length = 0;
        state.drawing.currentStroke = [];
        state.hover.isHovering = false;
        state.hover.lastPrimitive = null;
        if (state.hover.timeoutId) {
          clearTimeout(state.hover.timeoutId);
          state.hover.timeoutId = null;
        }
        renderer.hideHoverTooltip();
        state.extraction.last = null;
        setMarkedPrimitive(null);
        snapManager.markAnchorsDirty();
        renderer.redrawAll();
        outputController.setOutput('', []);
      });
    }

    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        if (state.drawing.isDrawing) {
          strokeManager.endStroke();
        }
        state.drawing.strokes.pop();
        setMarkedPrimitive(null);
        snapManager.markAnchorsDirty();
        renderer.redrawAll();
      });
    }

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        btnUndo?.click();
        e.preventDefault();
      }
    });

    if (btnExtract) {
      btnExtract.addEventListener('click', () => {
        extractionService.extractAll();
        setMarkedPrimitive(null);
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const text = state.elements.outText?.value || '';
        outputController.copyToClipboard(text).catch(() => {
          // fallback handled inside copyToClipboard; nothing more to do
        });
      });
    }

    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        const text = state.elements.outText?.value || '';
        outputController.downloadText(text);
      });
    }
  }

  function init() {
    setupPointerEvents();
    setupControls();
    window.addEventListener('resize', () => renderer.resizeCanvas());
    renderer.resizeCanvas();
    renderer.redrawAll();
    snapManager.updateSnapUI(null, { x: 0, y: 0 });
    outputController.setOutput('', []);
    hoverManager.attach();
    updateDeletionInfo();
  }

  return { init };
}
