/**
 * Tool Controller - Manages active tool selection
 */

import { LineTool, ArcTool, CircleTool, RectangleTool, PolygonTool, DimensionTool, AngularDimensionTool, RadiusDimensionTool, FilletTool, ChamferTool, TrimTool, ArrayTool } from '../tools/toolManager.js';

export class ToolController {
  constructor(app) {
    this.app = app;
  }

  getToolManager() {
    return {
      app: this.app,
      addPrimitive: (primitive) => this.app.addPrimitive(primitive),
      setReferencePoint: (point) => { this.app.lastReferencePoint = point; },
      referencePoint: this.app.lastReferencePoint || { x: 0, y: 0 },
      notifyHintChanged: () => { }, // Mock notification
      notifyPreviewChanged: () => { } // Mock notification
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
      case 'linear_dimension':
        this.app.currentTool = new DimensionTool(manager);
        break;
      case 'angular_dimension':
        this.app.currentTool = new AngularDimensionTool(manager);
        break;
      case 'radius_dimension':
        this.app.currentTool = new RadiusDimensionTool(manager);
        break;
      case 'fillet':
        this.app.currentTool = new FilletTool(manager);
        break;
      case 'chamfer':
        this.app.currentTool = new ChamferTool(manager);
        break;
      case 'trim':
        this.app.currentTool = new TrimTool(manager);
        break;
      case 'array':
        this.app.currentTool = new ArrayTool(manager);
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
