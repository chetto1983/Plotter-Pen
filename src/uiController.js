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
  function setupPointerEvents() {
    const { canvas } = state.elements;
    if (!canvas) {
      return;
    }

    canvas.addEventListener('mousedown', (e) => {
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
      btnClear,
      btnUndo,
      btnResetView,
      btnExtract,
      btnCopy,
      btnDownload
    } = state.elements;

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

    if (btnFreehand) btnFreehand.addEventListener('click', () => toolController.setActiveTool('freehand'));
    if (btnLine) btnLine.addEventListener('click', () => toolController.setActiveTool('line'));
    if (btnArc) btnArc.addEventListener('click', () => toolController.setActiveTool('arc'));
    if (btnRectangle) btnRectangle.addEventListener('click', () => toolController.setActiveTool('rectangle'));
    if (btnPolygon) btnPolygon.addEventListener('click', () => toolController.setActiveTool('polygon'));

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
  }

  return { init };
}
