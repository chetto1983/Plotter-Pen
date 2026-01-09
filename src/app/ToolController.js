/**
 * Tool Controller - Manages active tool selection
 */

import { LineTool, ArcTool, CircleTool, RectangleTool, PolygonTool, DimensionTool, FilletTool } from '../tools/toolManager.js';

export class ToolController {
  constructor(app) {
    this.app = app;
  }

  getToolManager() {
    return {
      addPrimitive: (primitive) => this.app.addPrimitive(primitive),
      setReferencePoint: (point) => { this.app.lastReferencePoint = point; },
      referencePoint: this.app.lastReferencePoint || { x: 0, y: 0 }
    };
  }

  selectTool(toolName) {
    if (this.app.currentTool) {
      this.app.currentTool.cancel();
    }

    const manager = this.getToolManager();

    this.app.selectMode = false; // Reset select mode for all tools

    switch (toolName) {
      case 'line':
        this.app.currentTool = new LineTool(manager);
        break;
      case 'arc':
        this.app.currentTool = new ArcTool(manager);
        if (this.app.arcMode) this.app.currentTool.setMode(this.app.arcMode);
        break;
      case 'circle':
        this.app.currentTool = new CircleTool(manager);
        break;
      case 'rectangle':
        this.app.currentTool = new RectangleTool(manager);
        break;
      case 'polygon':
        this.app.currentTool = new PolygonTool(manager);
        break;
      case 'dimension':
        this.app.currentTool = new DimensionTool(manager);
        break;
      case 'fillet':
        this.app.currentTool = new FilletTool(manager);
        break;
      case 'select':
        this.app.currentTool = null;
        this.app.selectMode = true;
        break;
      case 'delete':
        this.app.currentTool = null;
        this.app.selectMode = false;
        this.app.selectionManager.deleteSelected();
        break;
      default:
        this.app.currentTool = null;
        this.app.selectMode = false;
    }

    this.app.ui.updateToolUI(toolName);
    if (this.app.selectMode) {
      this.app.ui.updateStatus('Modalita selezione - clicca su una primitiva');
    } else {
      this.app.ui.updateStatus(this.app.currentTool ? `Strumento: ${toolName}` : 'Nessuno strumento');
    }
    this.app.render();
  }
}

export default ToolController;
