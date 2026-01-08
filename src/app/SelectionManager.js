/**
 * Selection Manager - Handles selection, clipboard, and transforms
 */

export class SelectionManager {
  constructor(app) {
    this.app = app;
  }

  /**
   * Handle selection at position
   * @param {Object} position - Click position
   * @param {boolean} addToSelection - If true, add to existing selection (Shift+Click)
   */
  handleSelection(position, addToSelection = false) {
    const hitDistance = 5 / this.app.renderer.view.zoom; // 5 pixels in world space
    let found = null;

    // Find primitive closest to click
    for (const prim of this.app.primitives) {
      const dist = prim.distanceToPoint ? prim.distanceToPoint(position) : Infinity;
      if (dist < hitDistance) {
        found = prim;
        break;
      }
    }

    if (found) {
      if (addToSelection) {
        // Shift+Click: toggle this primitive in selection
        if (this.app.selectedPrimitives.has(found)) {
          this.app.selectedPrimitives.delete(found);
          this.app.ui.updateStatus('Elemento deselezionato');
        } else {
          this.app.selectedPrimitives.add(found);
          this.app.ui.updateStatus(`Selezionati: ${this.app.selectedPrimitives.size} elementi`);
        }
      } else {
        // Normal click: replace selection
        if (this.app.selectedPrimitives.has(found) && this.app.selectedPrimitives.size === 1) {
          // Clicking on already selected single item - deselect
          this.app.selectedPrimitives.clear();
          this.app.ui.updateStatus('Elemento deselezionato');
        } else {
          // Select only this item
          this.app.selectedPrimitives.clear();
          this.app.selectedPrimitives.add(found);
          this.app.ui.updateStatus(`Selezionato: ${found.type}`);
        }
      }
    } else {
      // Click on empty space - clear selection and highlight
      this.app.selectedPrimitives.clear();
      this.app.clearHighlight();
      this.app.ui.updateStatus('Selezione cancellata');
    }

    this.app.render();
  }

  /**
   * Update hovered primitive based on mouse position
   */
  updateHover(position) {
    if (!this.app.selectMode) {
      if (this.app.hoveredPrimitive) {
        this.app.hoveredPrimitive = null;
        this.app.renderer.setHovered(null);
        this.app.canvas.style.cursor = 'crosshair';
      }
      return;
    }

    const hitDistance = 5 / this.app.renderer.view.zoom; // 5 pixels in world space
    let found = null;
    let minDist = Infinity;

    // Find closest primitive to cursor
    for (const prim of this.app.primitives) {
      const dist = prim.distanceToPoint ? prim.distanceToPoint(position) : Infinity;
      if (dist < hitDistance && dist < minDist) {
        found = prim;
        minDist = dist;
      }
    }

    if (found !== this.app.hoveredPrimitive) {
      this.app.hoveredPrimitive = found;
      // Convert to render format for the renderer
      this.app.renderer.setHovered(found ? this.app.toRenderFormat(found) : null);
      // Update cursor
      this.app.canvas.style.cursor = found ? 'pointer' : 'default';
    }
  }

  /**
   * Delete selected primitives
   */
  deleteSelected() {
    if (this.app.selectedPrimitives.size === 0) {
      this.app.ui.updateStatus('Nessun elemento selezionato');
      return;
    }

    this.app.state.pushState();
    this.app.primitives = this.app.primitives.filter(p => !this.app.selectedPrimitives.has(p));
    this.app.selectedPrimitives.clear();
    this.app.highlightedPrimitive = null;
    this.app.ui.updateStats();
    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus('Elementi eliminati');
  }

  /**
   * Move selected primitives by dx, dy (in world units)
   */
  moveSelected(dx, dy) {
    if (this.app.selectedPrimitives.size === 0) return;

    this.app.state.pushState();
    for (const primitive of this.app.selectedPrimitives) {
      primitive.translate(dx, dy);
    }
    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus(`Spostato: ${dx.toFixed(1)}, ${dy.toFixed(1)} mm`);
  }

  /**
   * Copy selected primitives to clipboard
   */
  copySelected() {
    if (this.app.selectedPrimitives.size === 0) {
      this.app.ui.updateStatus('Nessuna selezione da copiare');
      return;
    }

    // Serialize selected primitives
    this.app.clipboard = [];
    for (const primitive of this.app.selectedPrimitives) {
      this.app.clipboard.push(primitive.toJSON());
    }

    this.app.ui.updateStatus(`Copiati: ${this.app.clipboard.length} elementi`);
  }

  /**
   * Cut selected primitives (copy + delete)
   */
  cutSelected() {
    if (this.app.selectedPrimitives.size === 0) {
      this.app.ui.updateStatus('Nessuna selezione da tagliare');
      return;
    }

    this.copySelected();
    this.deleteSelected();
    this.app.ui.updateStatus(`Tagliati: ${this.app.clipboard.length} elementi`);
  }

  /**
   * Paste primitives from clipboard
   */
  pasteClipboard() {
    if (this.app.clipboard.length === 0) {
      this.app.ui.updateStatus('Appunti vuoti');
      return;
    }

    this.app.state.pushState();

    // Deserialize and add primitives with offset
    const newPrimitives = this.app.state.deserializePrimitives(JSON.stringify(this.app.clipboard));

    // Offset pasted primitives by 10mm so they're visible
    for (const prim of newPrimitives) {
      prim.translate(10, 10);
    }

    // Add to scene and select
    this.app.selectedPrimitives.clear();
    for (const prim of newPrimitives) {
      this.app.primitives.push(prim);
      this.app.selectedPrimitives.add(prim);
    }

    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus(`Incollati: ${newPrimitives.length} elementi`);
  }

  /**
   * Rotate selected primitives around their center
   * @param {number} angle - Rotation angle in degrees
   */
  rotateSelected(angle) {
    if (this.app.selectedPrimitives.size === 0) {
      this.app.ui.updateStatus('Nessuna selezione da ruotare');
      return;
    }

    this.app.state.pushState();

    // Calculate center of selection
    const center = this.getSelectionCenter();
    const radians = (angle * Math.PI) / 180;

    for (const primitive of this.app.selectedPrimitives) {
      primitive.rotate(center.x, center.y, radians);
    }

    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus(`Ruotato: ${angle}\u00b0`);
  }

  /**
   * Scale selected primitives from their center
   * @param {number} factor - Scale factor (1.0 = no change)
   */
  scaleSelected(factor) {
    if (this.app.selectedPrimitives.size === 0) {
      this.app.ui.updateStatus('Nessuna selezione da scalare');
      return;
    }

    this.app.state.pushState();

    // Calculate center of selection
    const center = this.getSelectionCenter();

    for (const primitive of this.app.selectedPrimitives) {
      primitive.scale(center.x, center.y, factor);
    }

    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus(`Scalato: ${(factor * 100).toFixed(0)}%`);
  }

  /**
   * Mirror selected primitives
   * @param {string} axis - 'x' for horizontal mirror, 'y' for vertical mirror
   */
  mirrorSelected(axis) {
    if (this.app.selectedPrimitives.size === 0) {
      this.app.ui.updateStatus('Nessuna selezione da specchiare');
      return;
    }

    this.app.state.pushState();

    // Calculate center of selection
    const center = this.getSelectionCenter();

    for (const primitive of this.app.selectedPrimitives) {
      primitive.mirror(center.x, center.y, axis);
    }

    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus(`Specchiato: asse ${axis.toUpperCase()}`);
  }

  /**
   * Get the center point of all selected primitives
   */
  getSelectionCenter() {
    if (this.app.selectedPrimitives.size === 0) {
      return { x: 0, y: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const primitive of this.app.selectedPrimitives) {
      const bbox = primitive.getBoundingBox();
      minX = Math.min(minX, bbox.minX);
      minY = Math.min(minY, bbox.minY);
      maxX = Math.max(maxX, bbox.maxX);
      maxY = Math.max(maxY, bbox.maxY);
    }

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2
    };
  }

  /**
   * Select primitives inside a box (rubber band selection)
   * @param {number} minX - Min X in world coordinates
   * @param {number} minY - Min Y in world coordinates
   * @param {number} maxX - Max X in world coordinates
   * @param {number} maxY - Max Y in world coordinates
   * @param {boolean} crossing - If true, select any intersecting primitive (crossing mode)
   * @param {boolean} additive - If true, add to existing selection (Shift held)
   */
  boxSelect(minX, minY, maxX, maxY, crossing = false, additive = false) {
    // Clear selection if not additive
    if (!additive) {
      this.app.selectedPrimitives.clear();
    }

    // Select primitives based on mode
    for (const primitive of this.app.primitives) {
      const intersects = primitive.intersectsBox(minX, minY, maxX, maxY);

      if (crossing) {
        // Crossing mode: select any primitive that intersects the box
        if (intersects) {
          this.app.selectedPrimitives.add(primitive);
        }
      } else {
        // Window mode: select only primitives fully inside the box
        const bbox = primitive.getBoundingBox();
        const fullyInside = bbox.minX >= minX && bbox.maxX <= maxX &&
                          bbox.minY >= minY && bbox.maxY <= maxY;
        if (fullyInside) {
          this.app.selectedPrimitives.add(primitive);
        }
      }
    }

    const count = this.app.selectedPrimitives.size;
    const mode = crossing ? 'attraversamento' : 'finestra';
    this.app.ui.updateStatus(count > 0 ? `Selezionati: ${count} (${mode})` : 'Nessun elemento selezionato');
    this.app.render();
  }

  /**
   * Clear all primitives
   */
  clearAll() {
    if (this.app.primitives.length === 0) return;

    this.app.state.pushState();
    this.app.primitives = [];
    this.app.selectedPrimitives.clear();
    this.app.highlightedPrimitive = null;
    this.app.ui.updateStats();
    this.app.render();
    this.app.refreshPLCOutput();
    this.app.ui.updateStatus('Area di lavoro pulita');
  }
}

export default SelectionManager;
