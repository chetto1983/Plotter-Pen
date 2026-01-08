export function buildDrawingData(app) {
  return {
    version: "1.0",
    created: new Date().toISOString(),
    workspace: {
      width: app.workspaceWidth,
      height: app.workspaceHeight,
      gridSpacing: app.gridSpacing,
    },
    primitives: app.primitives.map((p) => p.toJSON()),
  };
}

export function applyDrawingData(app, data) {
  if (!data || !data.version || !data.primitives) {
    throw new Error("Formato file non valido");
  }

  app.state.pushState();
  app.primitives = [];
  app.selectedPrimitives.clear();
  app.highlightedPrimitive = null;

  if (data.workspace) {
    app.workspaceWidth = data.workspace.width || 600;
    app.workspaceHeight = data.workspace.height || 600;
    app.gridSpacing = data.workspace.gridSpacing || 10;

    app.renderer.setWorkspaceSize(app.workspaceWidth, app.workspaceHeight);

    if (app.snapManager?.options) {
      app.snapManager.options.gridSpacing = app.gridSpacing;
    }
    if (app.snapManager?.gridSize !== undefined) {
      app.snapManager.gridSize = app.gridSpacing;
    }

    const widthInput = document.getElementById("workspaceWidth");
    const heightInput = document.getElementById("workspaceHeight");
    const gridInput = document.getElementById("gridSpacing");
    if (widthInput) widthInput.value = app.workspaceWidth;
    if (heightInput) heightInput.value = app.workspaceHeight;
    if (gridInput) gridInput.value = app.gridSpacing;
  }

  if (Array.isArray(data.primitives)) {
    const primitivesJson = JSON.stringify(data.primitives);
    app.primitives = app.state.deserializePrimitives(primitivesJson);
  } else {
    throw new Error("Primitives deve essere un array");
  }

  app.ui.updateStats();
  app.render();
  app.refreshPLCOutput();
  app.renderer.resetView();
}
