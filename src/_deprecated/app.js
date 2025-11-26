import initNavigation from "./navigation.js";
import { collectElements, createAppState } from "./state.js";
import { createSnapManager } from "./snapManager.js";
import { createCanvasRenderer } from "./canvasRenderer.js";
import { createStrokeManager } from "./strokeManager.js";
import { createToolController } from "./toolController.js";
import { createPointerHelper } from "./pointerHelper.js";
import { createExtractionService } from "./extractionService.js";
import { createOutputController } from "./outputController.js";
import { createHoverManager } from "./hoverManager.js";
import { createUiController } from "./uiController.js";

function bootstrap() {
  initNavigation();

  const elements = collectElements();
  const state = createAppState(elements);

  const snapManager = createSnapManager(state);
  const renderer = createCanvasRenderer(state);
  const strokeManager = createStrokeManager(state, renderer, snapManager);
  const toolController = createToolController(state, renderer, snapManager);
  const pointerHelper = createPointerHelper(state);
  const outputController = createOutputController(state, renderer);
  const extractionService = createExtractionService(state, snapManager, outputController);
  const hoverManager = createHoverManager(state, pointerHelper, renderer);
  const uiController = createUiController({
    state,
    renderer,
    snapManager,
    strokeManager,
    toolController,
    pointerHelper,
    extractionService,
    outputController,
    hoverManager
  });

  toolController.setActiveTool(state.drawing.currentTool);
  uiController.init();
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', bootstrap) : bootstrap();
