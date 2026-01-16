/**
 * File Manager - Handles Import/Export of drawings
 */

import { applyDrawingData, buildDrawingData } from "./file/drawingData.js";
import { downloadLegacy, pickFileLegacy } from "./file/fileHelpers.js";

import { createPrimitiveFromJSON } from "../geometry/primitives.js";

export class FileManager {
  constructor(app) {
    this.app = app;
    this.fileHandle = null;
    this.importRequestId = 0;
  }

  /**
   * Save current drawing to file.
   * @param {boolean} saveAs - If true, force "Save As" dialog.
   */
  async saveToFile(saveAs = false) {
    const data = buildDrawingData(this.app);
    const jsonContent = JSON.stringify(data, null, 2);

    try {
      if (window.showSaveFilePicker) {
        if (saveAs || !this.fileHandle) {
          const opts = {
            types: [{
              description: "Plotter Pen Drawing",
              accept: { "application/json": [".json"] },
            }],
            suggestedName: `drawing_${new Date().toISOString().slice(0, 10)}.json`,
          };
          this.fileHandle = await window.showSaveFilePicker(opts);
        }

        const writable = await this.fileHandle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        this.app.ui.updateStatus("Disegno salvato con successo");
        return;
      }

      downloadLegacy(jsonContent, "drawing.json", "application/json");
      this.app.ui.updateStatus("File scaricato (Legacy mode)");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Save failed:", err);
        this.app.ui.updateStatus("Errore durante il salvataggio");
      }
    }
  }

  /**
   * Load drawing from JSON file.
   */
  async loadFromFile() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: "Plotter Pen Drawing",
            accept: { "application/json": [".json"] },
          }, {
            description: "DXF File",
            accept: {
              "application/dxf": [".dxf"],
              "application/x-dxf": [".dxf"],
              "application/x-autocad": [".dxf"],
              "text/plain": [".dxf"],
            },
          }],
          excludeAcceptAllOption: false,
          multiple: false,
        });

        this.fileHandle = handle;
        const file = await handle.getFile();
        await this.processFile(file);
      } else {
        const file = await pickFileLegacy(".json,.dxf");
        this.fileHandle = null;
        if (file) await this.processFile(file);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Load failed:", err);
        this.app.ui.updateStatus("Errore durante il caricamento");
      }
    }
  }

  /**
   * Process a selected file (JSON or DXF)
   * @param {File} file 
   */
  async processFile(file) {
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();
      const content = await file.text();

      if (fileName.endsWith(".dxf") || this.looksLikeDXF(content)) {
        await this.loadFromDXF(file, content);
      } else {
        await this.loadFromJSON(file, content);
      }
    } catch (err) {
      console.error("File processing failed:", err);
      this.app.ui.updateStatus(`Errore elaborazione file: ${err.message}`);
      throw err;
    }
  }

  async loadFromJSON(file, contentOverride = null) {
    this.app.ui.updateStatus(`Caricamento ${file.name}...`);
    const content = contentOverride ?? await file.text();

    let data;
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error("Formato JSON non valido");
    }

    applyDrawingData(this.app, data);
    this.app.ui.updateStatus("File caricato con successo");
  }

  async loadFromDXF(file, contentOverride = null) {
    const requestId = ++this.importRequestId;
    this.app.ui.updateStatus(`Caricamento DXF ${file.name}...`);
    const content = contentOverride ?? await file.text();

    // BACKEND EXTRACTION (Smart Import)
    // We send raw DXF to server, it parses and optimizes it, returning Primitives + PLC Commands
    try {
      this.app.ui.updateStatus('Elaborazione backend (Smart Import)...');

      const response = await fetch('/api/smart-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: content
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Import failed');
      }

      this.app.ui.updateStatus('Download risultati...');
      const result = await response.json();
      if (requestId !== this.importRequestId) {
        return;
      }

      this.app.ui.updateStatus(`Ricevute ${result.primitives.length} primitive. Ricostruzione oggetti...`);

      // Rehydrate instances for Rendering (Chunked)
      const primitives = await this.createPrimitivesFromDataAsync(result.primitives);
      if (requestId !== this.importRequestId) {
        return;
      }

      if (!primitives || primitives.length === 0) {
        this.app.ui.updateStatus("DXF senza entità importabili");
        return;
      }

      // Optimize history for large files
      if (primitives.length < 10000) {
        this.app.state.pushState();
      } else {
        console.warn('Import too large for Undo history, skipping pushState');
        // We don't push state, but we should probably clear previous history to avoid mixed state issues
        // or just accept that "Undo" won't go back to "Empty".
      }
      this.app.primitives = primitives;

      // Note: Backend provides result.plcCommands, but these are based on the original DXF coordinates
      // (normalized to positive quadrant 1,1). We will translate the primitives to center them,
      // so we must REGENERATE the PLC commands after translation to match the visual output.
      // Ignoring result.plcCommands / result.plcOutput from backend.

      this.app.selectedPrimitives.clear();
      this.app.highlightedPrimitive = null;

      this.app.ui.updateStatus('Applicazione bounds...');
      await this.applyDXFBoundsAsync(result.bounds);

      this.app.ui.updateStats();
      this.app.ui.updateStatus(`Rendering...`);
      await new Promise(r => setTimeout(r, 0));

      if (this.app.renderer) this.app.renderer.invalidateCache();
      if (this.app.snapManager) this.app.snapManager.setPrimitives(this.app.primitives);
      this.app.render();

      this.app.renderer.resetView();
      this.app.ui.updateStatus(`DXF importato: ${primitives.length} primitive`);

      // REGENERATE PLC OUTPUT with correct origin
      // This ensures that the generated G-code matches the centered drawing on screen
      this.app.ui.updateStatus('Rigenerazione percorso PLC...');
      await new Promise(r => setTimeout(r, 0));
      this.app.plcOutputManager.refreshPLCOutput();

    } catch (error) {
      console.error('DXF import error:', error);
      this.app.ui.updateStatus(`Errore: ${error.message}`);
    }
  }

  /**
   * Create primitive instances from raw data with chunked processing
   */
  async createPrimitivesFromDataAsync(data) {
    const primitives = [];
    const CHUNK_SIZE = 10; // Small chunks for responsive UI
    const total = data.length;
    const supportedTypes = new Set(['line', 'arc', 'circle', 'rectangle', 'polygon', 'polyline']);
    const yieldToMain = () => new Promise(r => setTimeout(r, 0));

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, total);

      for (let j = i; j < end; j++) {
        const d = data[j];
        if (d && supportedTypes.has(d.type)) {
          primitives.push(createPrimitiveFromJSON(d));
        }
      }

      // Yield to browser event loop - truly non-blocking
      await yieldToMain();

      // Update progress less frequently to reduce overhead
      if (i % 100 === 0) {
        this.app.ui.updateStatus(`Creazione primitive ${end}/${total}...`);
      }
    }

    return primitives;
  }

  async applyDXFBoundsAsync(bounds) {
    if (!bounds) return;

    // Calculate drawing dimensions
    const drawingWidth = bounds.maxX - bounds.minX;
    const drawingHeight = bounds.maxY - bounds.minY;

    // Expand workspace if needed
    const padding = 20;
    const requiredWidth = drawingWidth + padding * 2;
    const requiredHeight = drawingHeight + padding * 2;

    const nextWidth = Math.max(this.app.workspaceWidth, Math.ceil(requiredWidth));
    const nextHeight = Math.max(this.app.workspaceHeight, Math.ceil(requiredHeight));

    // Calculate centering offset
    const centerX = (nextWidth - drawingWidth) / 2;
    const centerY = (nextHeight - drawingHeight) / 2;
    const offsetX = centerX - bounds.minX;
    const offsetY = centerY - bounds.minY;

    if (Math.abs(offsetX) > 0.01 || Math.abs(offsetY) > 0.01) {
      // Chunked translation - small chunks with setTimeout(0) for true event loop yielding
      const CHUNK_SIZE = 50;
      const prims = this.app.primitives;
      const yieldToMain = () => new Promise(r => setTimeout(r, 0));

      for (let i = 0; i < prims.length; i += CHUNK_SIZE) {
        const end = Math.min(i + CHUNK_SIZE, prims.length);
        for (let j = i; j < end; j++) {
          prims[j].translate(offsetX, offsetY);
        }
        // Yield to browser event loop - truly non-blocking
        await yieldToMain();
      }
    }

    if (nextWidth !== this.app.workspaceWidth || nextHeight !== this.app.workspaceHeight) {
      this.app.workspaceWidth = nextWidth;
      this.app.workspaceHeight = nextHeight;
      this.app.renderer.setWorkspaceSize(this.app.workspaceWidth, this.app.workspaceHeight);

      const widthInput = document.getElementById("workspaceWidth");
      const heightInput = document.getElementById("workspaceHeight");
      if (widthInput) widthInput.value = this.app.workspaceWidth;
      if (heightInput) heightInput.value = this.app.workspaceHeight;
    }
  }

  looksLikeDXF(content) {
    const head = content.slice(0, 4096);
    return /(^|\r?\n)\s*0\s*\r?\n\s*SECTION\b/i.test(head);
  }

  /**
   * Export current drawing to DXF file via backend
   */
  async exportDXF() {
    try {
      this.app.ui.updateStatus('Esportazione DXF...');

      // Get layer data from LayerManager
      const layers = this.app.layerManager ? this.app.layerManager.getAllLayers() : [];

      // Serialize primitives to JSON
      const primitives = this.app.primitives.map(p => p.toJSON());

      // Call backend
      const response = await fetch('/api/export-dxf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primitives, layers })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Export failed');
      }

      // Get DXF content as blob
      const blob = await response.blob();

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `drawing_${timestamp}.dxf`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.app.ui.updateStatus(`Esportato ${filename}`);
    } catch (err) {
      console.error('DXF export error:', err);
      this.app.ui.updateStatus('Errore esportazione DXF');
    }
  }

  /**
   * DATABASE OPERATIONS
   */

  async saveToDatabase(name) {
    if (!name) return;
    this.app.ui.updateStatus(`Salvataggio "${name}" nel database...`);

    try {
      const data = buildDrawingData(this.app);

      // Generate preview
      let preview = null;
      if (this.app.renderer && this.app.renderer.canvas) {
        // Temporarily render without grid/ui for clean preview? 
        // For now, simple snapshot
        preview = this.app.renderer.canvas.toDataURL('image/jpeg', 0.5);
      }

      const response = await fetch('/api/drawings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, data, preview })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Save failed');
      }

      this.app.ui.updateStatus(`Disegno "${name}" salvato`);
      return true;
    } catch (err) {
      console.error('DB Save error:', err);
      this.app.ui.updateStatus(`Errore salvataggio: ${err.message}`);
      return false;
    }
  }

  async listDrawings() {
    try {
      const response = await fetch('/api/drawings');
      if (!response.ok) throw new Error('Failed to fetch list');
      const res = await response.json();
      return res.data || [];
    } catch (err) {
      console.error('DB List error:', err);
      this.app.ui.updateStatus('Errore recupero lista disegni');
      return [];
    }
  }

  async loadFromDatabase(name) {
    this.app.ui.updateStatus(`Caricamento "${name}"...`);
    try {
      const response = await fetch(`/api/drawings/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error('Failed to load drawing');

      const res = await response.json();
      const data = res.data;

      if (!data) throw new Error('Empty data');

      applyDrawingData(this.app, data);
      this.app.ui.updateStatus(`Disegno "${name}" caricato`);
      return true;
    } catch (err) {
      console.error('DB Load error:', err);
      this.app.ui.updateStatus(`Errore caricamento: ${err.message}`);
      return false;
    }
  }

  async deleteDrawing(name) {
    try {
      const response = await fetch(`/api/drawings/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Delete failed');
      this.app.ui.updateStatus(`Disegno "${name}" eliminato`);
      return true;
    } catch (err) {
      console.error('DB Delete error:', err);
      this.app.ui.updateStatus(`Errore eliminazione: ${err.message}`);
      return false;
    }
  }
}

export default FileManager;
