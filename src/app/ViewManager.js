/**
 * View Manager - Handles zoom and grid toggles
 */

export class ViewManager {
  constructor(app) {
    this.app = app;
  }

  /**
   * Zoom controls
   */
  zoomIn() {
    const newZoom = Math.min(10, this.app.renderer.view.zoom * 1.2);
    this.app.renderer.setZoom(newZoom);
    this.app.ui.updateZoomDisplay();
    this.app.render();
  }

  zoomOut() {
    const newZoom = Math.max(0.1, this.app.renderer.view.zoom / 1.2);
    this.app.renderer.setZoom(newZoom);
    this.app.ui.updateZoomDisplay();
    this.app.render();
  }

  zoomFit() {
    this.app.renderer.resetView();
    this.app.ui.updateZoomDisplay();
    this.app.render();
  }

  /**
   * Toggle grid display
   */
  toggleGrid() {
    this.app.showGrid = !this.app.showGrid;
    this.app.renderer.grid.show = this.app.showGrid;

    const checkbox = document.getElementById('showGrid');
    if (checkbox) checkbox.checked = this.app.showGrid;

    this.app.render();
  }
}

export default ViewManager;
