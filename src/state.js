export function collectElements() {
  const byId = (id) => document.getElementById(id);
  const canvas = byId('pad');
  if (!canvas) {
    throw new Error('Elemento canvas con id "pad" non trovato');
  }

  return {
    canvas,
    ctx: canvas.getContext('2d'),
    coordDisplay: byId('coordDisplay'),
    snapDisplay: byId('snapDisplay'),
    snapTooltip: byId('snapCursorTooltip'),
    hoverTooltip: byId('hoverTooltip'),
    penSizeInput: byId('penSize'),
    mmWidthInput: byId('mmWidth'),
    mmHeightInput: byId('mmHeight'),
    gridToggle: byId('cbShowGrid'),
    snapToggle: byId('cbSnapGrid'),
    snapAnchorsToggle: byId('cbSnapAnchors'),
    gridSpacingInput: byId('gridSpacing'),
    gridMajorEveryInput: byId('gridMajorEvery'),
    hint: byId('hint'),
    dpiInfo: byId('dpiInfo'),
    toolButtons: Array.from(document.querySelectorAll('.tool-btn')),
    btnFreehand: byId('btnFreehand'),
    btnLine: byId('btnLine'),
    btnArc: byId('btnArc'),
    btnRectangle: byId('btnRectangle'),
    btnPolygon: byId('btnPolygon'),
    btnClear: byId('btnClear'),
    btnUndo: byId('btnUndo'),
    btnResetView: byId('btnResetView'),
    btnExtract: byId('btnExtract'),
    btnCopy: byId('btnCopy'),
    btnDownload: byId('btnDownload'),
    outText: byId('outText'),
    outGrid: byId('outGrid')
  };
}

export function createAppState(elements) {
  const penSize = parseInt(elements.penSizeInput?.value, 10) || 3;
  const gridSpacingMm = parseFloat(elements.gridSpacingInput?.value) || 10;
  const gridMajorEvery = parseInt(elements.gridMajorEveryInput?.value, 10) || 5;
  const mmWidth = parseFloat(elements.mmWidthInput?.value) || 600;
  const mmHeight = parseFloat(elements.mmHeightInput?.value) || 600;
  const anchorSnapEnabled = elements.snapAnchorsToggle ? !!elements.snapAnchorsToggle.checked : false;

  return {
    elements,
    dpr: Math.max(1, window.devicePixelRatio || 1),
    view: {
      scaleFactor: 1,
      zoom: 1,
      panX: 0,
      panY: 0,
      isPanning: false,
      lastPanX: 0,
      lastPanY: 0
    },
    workspace: {
      widthMm: mmWidth,
      heightMm: mmHeight
    },
    grid: {
      spacingMm: gridSpacingMm,
      majorEvery: gridMajorEvery,
      show: elements.gridToggle ? !!elements.gridToggle.checked : true,
      snapToGrid: elements.snapToggle ? !!elements.snapToggle.checked : false
    },
    drawing: {
      penSize,
      isDrawing: false,
      currentStroke: [],
      strokes: [],
      currentTool: 'freehand',
      startPoint: null,
      tempShape: null,
      arcPointerHistory: [],
      arcControlPoint: null,
      arcControlInfo: null,
      arcBuilder: { phase: 'idle', start: null, end: null, through: null, geometry: null },
      polygonPoints: [],
      isDrawingPolygon: false
    },
    snap: {
      anchorsDirty: true,
      anchorsCache: [],
      anchorSnapEnabled,
      lastInfo: { type: 'none', active: false, x: 0, y: 0, rawX: 0, rawY: 0 },
      lastPointerRaw: null
    },
    selection: {
      primitive: null,
      plcIndex: null
    },
    extraction: {
      last: null
    },
    hover: {
      timeoutId: null,
      lastPrimitive: null,
      isHovering: false
    }
  };
}
