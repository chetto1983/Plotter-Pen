/**
 * File Manager - Handles Import/Export of drawings
 * DXF import is intentionally disabled.
 */

import { applyDrawingData, buildDrawingData } from "./file/drawingData.js";
import { downloadLegacy, pickFileLegacy } from "./file/fileHelpers.js";

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
          }],
          excludeAcceptAllOption: false,
          multiple: false,
        });

        this.fileHandle = handle;
        file = await handle.getFile();
      } else {
        file = await pickFileLegacy(".json");
        this.fileHandle = null;
      }

      if (!file) return;

      this.app.ui.updateStatus(`Caricamento ${file.name}...`);
      const content = await file.text();

      let data;
      try {
        data = JSON.parse(content);
      } catch (err) {
        throw new Error("Formato JSON non valido");
      }

      applyDrawingData(this.app, data);
      this.app.ui.updateStatus("File caricato con successo");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Load failed:", err);
        this.app.ui.updateStatus("Errore durante il caricamento");
      }
    }
  }
}

export default FileManager;
