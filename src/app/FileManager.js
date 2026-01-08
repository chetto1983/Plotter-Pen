/**
 * File Manager - Handles Import/Export of drawings
 */

import { applyDrawingData, buildDrawingData } from "./file/drawingData.js";
import { downloadLegacy, pickFileLegacy } from "./file/fileHelpers.js";
import { DXFImporter } from "../import/DXFImporter.js";

export class FileManager {
  constructor(app) {
    this.app = app;
    this.fileHandle = null;
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
      let file;

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
        file = await handle.getFile();
      } else {
        file = await pickFileLegacy(".json,.dxf");
        this.fileHandle = null;
      }

      if (!file) return;

      const fileName = file.name.toLowerCase();
      const content = await file.text();

      if (fileName.endsWith(".dxf") || this.looksLikeDXF(content)) {
        await this.loadFromDXF(file, content);
      } else {
        await this.loadFromJSON(file, content);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Load failed:", err);
        this.app.ui.updateStatus("Errore durante il caricamento");
      }
    }
  }

  async loadFromJSON(file, contentOverride = null) {
    this.app.ui.updateStatus(`Caricamento ${file.name}...`);
    const content = contentOverride ?? await file.text();

    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      throw new Error("Formato JSON non valido");
    }

    applyDrawingData(this.app, data);
    this.app.ui.updateStatus("File caricato con successo");
  }

  async loadFromDXF(file, contentOverride = null) {
    this.app.ui.updateStatus(`Caricamento DXF ${file.name}...`);
    const content = contentOverride ?? await file.text();
    const importer = new DXFImporter();
    const { primitives, bounds } = await importer.parse(content);

    if (!primitives || primitives.length === 0) {
      this.app.ui.updateStatus("DXF senza entita importabili");
      return;
    }

    this.app.state.pushState();
    this.app.primitives = primitives;
    this.app.selectedPrimitives.clear();
    this.app.highlightedPrimitive = null;

    this.applyDXFBounds(bounds);

    this.app.ui.updateStats();
    this.app.render();
    this.app.refreshPLCOutput();
    this.app.renderer.resetView();
    this.app.ui.updateStatus("DXF importato con successo");
  }

  applyDXFBounds(bounds) {
    if (!bounds) return;

    const padding = 10;
    const offsetX = bounds.minX < 0 ? -bounds.minX + padding : 0;
    const offsetY = bounds.minY < 0 ? -bounds.minY + padding : 0;

    if (offsetX || offsetY) {
      for (const primitive of this.app.primitives) {
        primitive.translate(offsetX, offsetY);
      }
    }

    const maxX = bounds.maxX + offsetX;
    const maxY = bounds.maxY + offsetY;
    const nextWidth = Math.max(this.app.workspaceWidth, Math.ceil(maxX + padding));
    const nextHeight = Math.max(this.app.workspaceHeight, Math.ceil(maxY + padding));

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
}

export default FileManager;
