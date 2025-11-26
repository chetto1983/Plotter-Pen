/**
 * Input Handler - Mouse, Touch, and Keyboard event handling
 */

import { Vector2 } from '../geometry/core.js';

export class InputHandler {
  constructor(app) {
    this.app = app;
    this.isDragging = false;
    this.lastMousePos = new Vector2(0, 0);
    this.currentMousePos = new Vector2(0, 0);
  }

  /**
   * Setup all input event listeners
   */
  setup() {
    const canvas = this.app.canvas;
    console.log('=== InputHandler.setup() called ===');
    console.log('Canvas element:', canvas);

    // Canvas events
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    console.log('mousedown listener attached');
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('wheel', this.handleWheel.bind(this));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch events
    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Window resize
    window.addEventListener('resize', () => this.app.renderer.resizeCanvas());
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX, screenY) {
    const rect = this.app.canvas.getBoundingClientRect();
    const point = this.app.renderer.screenToModel({
      x: screenX - rect.left,
      y: screenY - rect.top
    });
    return new Vector2(point.x, point.y);
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(e) {
    console.log('=== handleMouseDown called ===', e.button, e.clientX, e.clientY);
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    console.log('World position:', worldPos);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle button or Alt+Left for panning
      this.isDragging = true;
      this.lastMousePos.set(e.clientX, e.clientY);
      this.app.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 0) {
      // Left button - tool action
      const snappedPos = this.app.getSnappedPosition(worldPos);
      console.log('Left click - snapped pos:', snappedPos, 'current tool:', this.app.currentTool);
      this.app.handleToolClick(snappedPos, e.shiftKey);
    }
  }

  /**
   * Handle mouse move event
   */
  handleMouseMove(e) {
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    this.currentMousePos.copy(worldPos);

    if (this.isDragging) {
      // Pan view using renderer's pan method
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.lastMousePos.set(e.clientX, e.clientY);
      this.app.renderer.pan(dx, dy);
      this.app.ui.updateZoomDisplay();
      return;
    }

    // Update snap position (this also updates lastSnapResult for indicator)
    const snappedPos = this.app.getSnappedPosition(worldPos);

    // Update coordinate display
    this.app.ui.updateCoordinates(snappedPos);

    // Update hover detection for select mode
    this.app.updateHover(snappedPos);

    // Update tool preview if tool is active
    if (this.app.currentTool) {
      this.app.currentTool.onMouseMove(snappedPos);
    }

    // Always render to show snap indicators and preview
    this.app.render();
  }

  /**
   * Handle mouse up event
   */
  handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.app.canvas.style.cursor = 'crosshair';
    }
  }

  /**
   * Handle mouse wheel event
   */
  handleWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = this.app.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Use renderer's setZoom with center point
    const newZoom = this.app.renderer.view.zoom * delta;
    this.app.renderer.setZoom(newZoom, mouseX, mouseY);
    this.app.ui.updateZoomDisplay();
  }

  /**
   * Handle touch events
   */
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
    }
  }

  handleTouchMove(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  handleTouchEnd(e) {
    this.handleMouseUp({ button: 0 });
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(e) {
    // Don't handle if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'l':
        this.app.selectTool('line');
        break;
      case 'a':
        this.app.selectTool('arc');
        break;
      case 'c':
        this.app.selectTool('circle');
        break;
      case 'r':
        this.app.selectTool('rectangle');
        break;
      case 'p':
        this.app.selectTool('polygon');
        break;
      case 's':
        this.app.selectTool('select');
        break;
      case 'delete':
      case 'backspace':
        this.app.deleteSelected();
        break;
      case 'escape':
        this.app.cancelCurrentOperation();
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            this.app.state.redo();
          } else {
            this.app.state.undo();
          }
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.app.state.redo();
        }
        break;
      case 'g':
        this.app.toggleGrid();
        break;
      case 'f':
        this.app.zoomFit();
        break;
      case '+':
      case '=':
        this.app.zoomIn();
        break;
      case '-':
        this.app.zoomOut();
        break;
      case 'f1':
        e.preventDefault();
        document.getElementById('shortcutsModal')?.removeAttribute('hidden');
        break;
    }
  }
}

export default InputHandler;
