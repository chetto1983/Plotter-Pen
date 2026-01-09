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

    // Box selection state
    this.isBoxSelecting = false;
    this.boxStartScreen = null;
    this.boxStartWorld = null;
    this.selectionBoxEl = null;

    // Drag move state
    this.isMovingSelection = false;
    this.moveStartWorld = null;
    this.moveHasMoved = false;

    // Optimization
    this.renderRequested = false;
    this.inputTicking = false;
    this.pendingMouseEvent = null;
  }

  /**
   * Setup all input event listeners
   */
  setup() {
    const canvas = this.app.canvas;

    // Get selection box element
    this.selectionBoxEl = document.getElementById('selectionBox');

    // Canvas events
    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
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
   * Clamps result to workspace boundaries
   */
  screenToWorld(screenX, screenY) {
    const rect = this.app.canvas.getBoundingClientRect();
    const point = this.app.renderer.screenToModel({
      x: screenX - rect.left,
      y: screenY - rect.top
    });

    // Clamp to workspace boundaries
    const x = Math.max(0, Math.min(this.app.workspaceWidth, point.x));
    const y = Math.max(0, Math.min(this.app.workspaceHeight, point.y));

    return new Vector2(x, y);
  }

  /**
   * Handle mouse down event
   */
  handleMouseDown(e) {
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle button or Alt+Left for panning
      this.isDragging = true;
      this.lastMousePos.set(e.clientX, e.clientY);
      this.app.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 0) {
      // In select mode, check if clicking on empty space to start box selection
      if (this.app.selectMode) {
        const snappedPos = this.app.getSnappedPosition(worldPos);
        const hitDistance = 5 / this.app.renderer.view.zoom;
        let found = null;
        let foundIsSelected = false;

        for (const prim of this.app.primitives) {
          const dist = prim.distanceToPoint ? prim.distanceToPoint(snappedPos) : Infinity;
          if (dist < hitDistance) {
            found = prim;
            foundIsSelected = this.app.selectedPrimitives.has(prim);
            break;
          }
        }

        // If clicking on a selected primitive, start drag move
        if (found && foundIsSelected) {
          this.isMovingSelection = true;
          this.moveStartWorld = { x: snappedPos.x, y: snappedPos.y };
          this.moveHasMoved = false;
          this.app.canvas.style.cursor = 'move';
          return;
        }

        if (!found) {
          // Start box selection
          this.isBoxSelecting = true;
          this.boxStartScreen = { x: screenX, y: screenY };
          this.boxStartWorld = { x: snappedPos.x, y: snappedPos.y };
          this.updateSelectionBox(screenX, screenY);
          if (this.selectionBoxEl) {
            this.selectionBoxEl.classList.add('active');
          }
          return;
        }
      }

      // Left button - tool action
      const snappedPos = this.app.getSnappedPosition(worldPos);
      this.app.handleToolClick(snappedPos, e.shiftKey);
    }
  }

  /**
   * Handle double click event
   */
  handleDoubleClick(e) {
    if (this.app.currentTool && typeof this.app.currentTool.onDoubleClick === 'function') {
      const worldPos = this.screenToWorld(e.clientX, e.clientY);
      const snappedPos = this.app.getSnappedPosition(worldPos);
      this.app.currentTool.onDoubleClick(snappedPos, e);
      this.app.render();
    }
  }

  /**
   * Update selection box position and size
   */
  updateSelectionBox(currentX, currentY) {
    if (!this.selectionBoxEl) {
      console.warn('Selection box element not found');
      this.selectionBoxEl = document.getElementById('selectionBox');
      if (!this.selectionBoxEl) return;
    }
    if (!this.boxStartScreen) return;

    const left = Math.min(this.boxStartScreen.x, currentX);
    const top = Math.min(this.boxStartScreen.y, currentY);
    const width = Math.abs(currentX - this.boxStartScreen.x);
    const height = Math.abs(currentY - this.boxStartScreen.y);

    // Ensure minimum size for visibility
    const minSize = 2;
    const finalWidth = Math.max(width, minSize);
    const finalHeight = Math.max(height, minSize);

    this.selectionBoxEl.style.left = left + 'px';
    this.selectionBoxEl.style.top = top + 'px';
    this.selectionBoxEl.style.width = finalWidth + 'px';
    this.selectionBoxEl.style.height = finalHeight + 'px';

    // Window selection (left-to-right) vs Crossing selection (right-to-left)
    const isCrossing = currentX < this.boxStartScreen.x;
    this.selectionBoxEl.classList.toggle('crossing', isCrossing);
  }

  /**
   * Handle mouse move event
   */
  handleMouseMove(e) {
    // 1. Buffer the latest event
    this.pendingMouseEvent = e;

    // 2. Request processing frame if not already ticking
    if (!this.inputTicking) {
      this.inputTicking = true;
      requestAnimationFrame(() => {
        this.processMouseMove();
        this.inputTicking = false;
      });
    }
  }

  processMouseMove() {
    const e = this.pendingMouseEvent;
    if (!e) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = this.screenToWorld(e.clientX, e.clientY);
    this.currentMousePos.copy(worldPos);

    if (this.isDragging) {
      // Pan view using renderer's pan method
      const dx = e.clientX - this.lastMousePos.x;
      const dy = e.clientY - this.lastMousePos.y;
      this.lastMousePos.set(e.clientX, e.clientY);
      this.app.renderer.pan(dx, dy);
      this.app.ui.updateZoomDisplay();
      this.requestRender();
      return;
    }

    // Update box selection if active
    if (this.isBoxSelecting) {
      this.updateSelectionBox(screenX, screenY);
      return;
    }

    // Handle drag move of selection
    if (this.isMovingSelection && this.moveStartWorld) {
      const snappedPos = this.app.getSnappedPosition(worldPos);
      const dx = snappedPos.x - this.moveStartWorld.x;
      const dy = snappedPos.y - this.moveStartWorld.y;

      if (dx !== 0 || dy !== 0) {
        // Save state only on first actual move
        if (!this.moveHasMoved) {
          this.app.state.pushState();
          this.moveHasMoved = true;
        }

        // Move all selected primitives
        for (const primitive of this.app.selectedPrimitives) {
          primitive.translate(dx, dy);
        }

        this.moveStartWorld = { x: snappedPos.x, y: snappedPos.y };
        if (this.app.renderer) this.app.renderer.invalidateCache();
        this.requestRender();
      }
      return;
    }

    // Update snap position (this also updates lastSnapResult for indicator)
    const snappedPos = this.app.getSnappedPosition(worldPos);

    // Update coordinate display
    this.app.ui.updateCoordinates(snappedPos);

    // Update hover detection for select mode
    this.app.selectionManager.updateHover(snappedPos);

    // Update tool preview if tool is active
    if (this.app.currentTool) {
      this.app.currentTool.onMouseMove(snappedPos);
    }

    // Always render to show snap indicators and preview
    this.requestRender();
  }

  requestRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      requestAnimationFrame(() => {
        this.app.render();
        this.renderRequested = false;
      });
    }
  }

  /**
   * Handle mouse up event
   */
  handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.app.canvas.style.cursor = 'crosshair';
    }

    // Finish drag move
    if (this.isMovingSelection) {
      // Update PLC output if we actually moved something
      if (this.moveHasMoved) {
        this.app.plcOutputManager.refreshPLCOutput();
      }
      this.isMovingSelection = false;
      this.moveStartWorld = null;
      this.moveHasMoved = false;
      this.app.canvas.style.cursor = 'crosshair';

      // Invalidate cache and update snap manager because primitives moved
      if (this.app.renderer) this.app.renderer.invalidateCache();
      if (this.app.snapManager) this.app.snapManager.setPrimitives(this.app.primitives);

      this.app.render();
    }

    // Finish box selection
    if (this.isBoxSelecting) {
      const rect = this.app.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;

      // Hide selection box
      this.selectionBoxEl.classList.remove('active', 'crossing');

      // Get end position in world coordinates
      const endWorld = this.app.renderer.screenToModel({ x: screenX, y: screenY });

      // Determine if it's crossing or window selection
      const isCrossing = screenX < this.boxStartScreen.x;

      // Calculate selection bounds in world coordinates
      const minX = Math.min(this.boxStartWorld.x, endWorld.x);
      const maxX = Math.max(this.boxStartWorld.x, endWorld.x);
      const minY = Math.min(this.boxStartWorld.y, endWorld.y);
      const maxY = Math.max(this.boxStartWorld.y, endWorld.y);

      // Select primitives
      this.app.selectionManager.boxSelect(minX, minY, maxX, maxY, isCrossing, e.shiftKey);

      // Reset box selection state
      this.isBoxSelecting = false;
      this.boxStartScreen = null;
      this.boxStartWorld = null;
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
    this.app.render();
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

  handleTouchEnd(_e) {
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

    // Move amount: 1mm normal, 10mm with shift
    const moveAmount = e.shiftKey ? 10 : 1;

    switch (e.key) {
      case 'ArrowUp':
        if (this.app.selectedPrimitives.size > 0) {
          e.preventDefault();
          this.app.selectionManager.moveSelected(0, -moveAmount);
        }
        break;
      case 'ArrowDown':
        if (this.app.selectedPrimitives.size > 0) {
          e.preventDefault();
          this.app.selectionManager.moveSelected(0, moveAmount);
        }
        break;
      case 'ArrowLeft':
        if (this.app.selectedPrimitives.size > 0) {
          e.preventDefault();
          this.app.selectionManager.moveSelected(-moveAmount, 0);
        }
        break;
      case 'ArrowRight':
        if (this.app.selectedPrimitives.size > 0) {
          e.preventDefault();
          this.app.selectionManager.moveSelected(moveAmount, 0);
        }
        break;
    }

    switch (e.key.toLowerCase()) {
      case 'l':
        this.app.selectTool('line');
        break;
      case 'a':
        this.app.selectTool('arc');
        break;
      case 'r':
        // R = Rotate CW if selection exists, otherwise Rectangle tool
        if (this.app.selectedPrimitives.size > 0) {
          this.app.selectionManager.rotateSelected(-90);  // CW = negative in math convention
        } else {
          this.app.selectTool('rectangle');
        }
        break;
      case 'q':
        // Q = Rotate 90° CCW (counter-clockwise, positive in math convention)
        if (this.app.selectedPrimitives.size > 0) {
          this.app.selectionManager.rotateSelected(90);
        }
        break;
      case 'e':
        // E = Rotate 90° CW (clockwise, negative in math convention)
        if (this.app.selectedPrimitives.size > 0) {
          this.app.selectionManager.rotateSelected(-90);
        }
        break;
      case 'm':
        // M = Mirror X (horizontal)
        if (this.app.selectedPrimitives.size > 0) {
          this.app.selectionManager.mirrorSelected('x');
        }
        break;
      case 'p':
        this.app.selectTool('polygon');
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.app.fileManager.saveToFile();
        } else {
          this.app.selectTool('select');
        }
        break;
      case 'o':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.app.fileManager.loadFromFile();
        }
        break;
      case 'delete':
      case 'backspace':
        this.app.selectionManager.deleteSelected();
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
      case 'c':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.app.selectionManager.copySelected();
        } else {
          this.app.selectTool('circle');
        }
        break;
      case 'v':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.app.selectionManager.pasteClipboard();
        }
        break;
      case 'x':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.app.selectionManager.cutSelected();
        }
        break;
      case 'g':
        this.app.viewManager.toggleGrid();
        break;
      case 'f':
        this.app.viewManager.zoomFit();
        break;
      case '+':
      case '=':
        this.app.viewManager.zoomIn();
        break;
      case '-':
        this.app.viewManager.zoomOut();
        break;
      case 'f1':
        e.preventDefault();
        document.getElementById('shortcutsModal')?.removeAttribute('hidden');
        break;
    }
  }
}

export default InputHandler;
