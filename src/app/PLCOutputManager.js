import { PLCOutputGenerator, PathOptimizer } from "../plc/extraction.js";

export class PLCOutputManager {
  constructor(app) {
    this.app = app;
  }

  refreshPLCOutput() {
    if (this.app.primitives.length > 0) {
      this.extractPLC();
      return;
    }

    this.app.plcCommands = [];
    this.app.plcOutput = [];
    this.app.ui.displayPLCOutput([], this.app);
  }

  extractPLC() {
    if (this.app.primitives.length === 0) {
      this.app.ui.updateStatus("Nessuna primitiva da estrarre");
      return;
    }

    const supportedTypes = new Set(["line", "arc", "circle", "rectangle", "polygon", "polyline"]);
    const primitivesWithData = this.app.primitives
      .filter((p) => supportedTypes.has(p.type))
      .map((p) => {
        const copy = p.clone();
        copy.sourcePrimitive = p;

        if (copy.type === "line") {
          copy.plcData = { type: 1, x1: copy.x1, y1: copy.y1, x2: copy.x2, y2: copy.y2 };
        } else if (copy.type === "arc") {
          copy.plcData = {
            type: copy.isClockwise ? 2 : 3,
            x1: copy.x1, y1: copy.y1, x2: copy.x2, y2: copy.y2, cx: copy.cx, cy: copy.cy,
          };
        } else if (copy.type === "circle") {
          const cx = copy.center?.x ?? copy.cx;
          const cy = copy.center?.y ?? copy.cy;
          const r = copy.radius ?? copy._radius;
          copy.plcData = {
            type: 3,
            x1: cx + r, y1: cy,
            x2: cx + r, y2: cy,
            cx: cx, cy: cy,
          };
        } else if (copy.type === "rectangle") {
          copy.plcData = { type: "rectangle", x: copy.x, y: copy.y, width: copy.width, height: copy.height };
        } else if (copy.type === "polygon" || copy.type === "polyline") {
          copy.plcData = { type: copy.type, points: copy.points, closed: copy.closed };
        }

        return copy;
      });

    // Use primitives directly, do NOT expand polygons/rectangles into thousands of lines
    // This optimization prevents O(N^2) path finding on huge datasets
    const optimizedPrimitives = PathOptimizer.optimizeOrder(primitivesWithData);
    // Get speed from UI or default to 100
    const speedInput = document.getElementById('simWorkSpeed');
    const rapidInput = document.getElementById('simRapidSpeed');
    const defaultSpeed = speedInput ? parseFloat(speedInput.value) : 100.0;
    const rapidSpeed = rapidInput ? parseFloat(rapidInput.value) : 1000.0;

    const generator = new PLCOutputGenerator({ defaultSpeed, rapidSpeed });
    const commands = generator.generate(optimizedPrimitives);
    for (const cmd of commands) {
      if (cmd.primitive?.sourcePrimitive) {
        cmd.primitive = cmd.primitive.sourcePrimitive;
      }
    }
    this.app.plcCommands = commands;
    this.app.plcOutput = commands.map((c) => c.command);

    // Limit UI display to avoid DOM freeze with massive outputs
    const displayCommands = this.app.plcCommands.length > 2000
      ? this.app.plcCommands.slice(0, 2000).concat([{ command: `... (${this.app.plcCommands.length - 2000} more commands)` }])
      : this.app.plcCommands;

    this.app.ui.displayPLCOutput(displayCommands, this.app);
    this.app.ui.updateStats();
    this.app.ui.updateStatus(`Estratte ${this.app.plcOutput.length} istruzioni PLC`);
  }

  async copyOutput() {
    if (this.app.plcOutput.length === 0) {
      this.app.ui.updateStatus("Nessun output da copiare");
      return;
    }

    try {
      await navigator.clipboard.writeText(this.app.plcOutput.join("\n"));
      this.app.ui.updateStatus("Output copiato negli appunti");
    } catch (err) {
      console.error(err);
      this.app.ui.updateStatus("Errore nella copia");
    }
  }

  downloadOutput() {
    if (this.app.plcOutput.length === 0) {
      this.app.ui.updateStatus("Nessun output da scaricare");
      return;
    }

    const blob = new Blob([this.app.plcOutput.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plc_output_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.app.ui.updateStatus("File scaricato");
  }

  simulatePath() {
    if (!this.app.plcCommands || this.app.plcCommands.length === 0) {
      this.app.ui.updateStatus("Nessun percorso da simulare");
      return;
    }

    const controlsEl = document.getElementById("simulationControls");
    const sliderEl = document.getElementById("simSpeedSlider");
    const btnSimulate = document.getElementById("btnSimulate");

    if (this.app.renderer.simulation && this.app.renderer.simulation.running) {
      this.app.renderer.stopSimulation();
      if (btnSimulate) {
        btnSimulate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
      return;
    }

    if (controlsEl) controlsEl.style.display = "block";
    if (btnSimulate) {
      btnSimulate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>';
    }

    const speed = sliderEl ? parseInt(sliderEl.value, 10) : 80;
    this.app.ui.updateStatus("Simulazione in corso... (premi ESC per fermare)");

    this.app.renderer.startSimulation(this.app.plcCommands, {
      speed,
      onComplete: () => {
        this.app.ui.updateStatus("Simulazione completata");
        // controlsEl.style.display = "none"; // Always visible
        if (btnSimulate) {
          btnSimulate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
        const active = document.querySelector('.cad-output-item.executing');
        if (active) active.classList.remove('executing');
      },
      onUpdate: (state) => {
        const index = state.index;
        const grid = document.getElementById('outputGrid');
        if (this._lastSimIndex !== index) {
          this._lastSimIndex = index;
          const prev = grid.querySelector('.cad-output-item.executing');
          if (prev) prev.classList.remove('executing');

          const current = grid.querySelector(`.cad-output-item[data-index="${index}"]`);
          if (current) {
            current.classList.add('executing');
            current.scrollIntoView({ block: 'nearest', behavior: 'auto' });
          }
        }
      },
    });
  }

  /**
   * Send output to PLC via WebSocket chunked transfer
   * Falls back to HTTP if WebSocket is not connected
   */
  async sendToPLC() {
    if (this.app.plcOutput.length === 0) {
      this.app.ui.updateStatus("Nessun output da inviare");
      return;
    }

    const ws = this.app.wsService;

    // Use WebSocket if connected, otherwise fall back to HTTP
    if (ws && ws.isConnected()) {
      this.sendViawWebSocket(ws);
    } else {
      this.sendViaHTTP();
    }
  }

  /**
   * Send via WebSocket chunked transfer (preferred)
   */
  sendViawWebSocket(ws) {
    this.app.ui.updateOPCUAStatus("Avvio trasferimento...", "info");

    const success = ws.transfer(this.app.plcOutput);
    if (!success) {
      this.app.ui.updateOPCUAStatus("WebSocket non pronto", "error");
      // Fall back to HTTP
      this.sendViaHTTP();
    }
  }

  /**
   * Send via HTTP POST (fallback)
   */
  async sendViaHTTP() {
    this.app.ui.updateOPCUAStatus("Invio HTTP...", "info");

    try {
      const response = await fetch("/api/opcua/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: this.app.plcOutput }),
      });

      if (response.ok) {
        this.app.ui.updateOPCUAStatus("Inviato con successo", "success");
        this.app.ui.updateStatus("Comandi inviati al PLC");
      } else {
        throw new Error("Errore nella risposta");
      }
    } catch (err) {
      this.app.ui.updateOPCUAStatus(`Errore: ${err.message}`, "error");
      this.app.ui.updateStatus("Errore invio PLC");
    }
  }
}

export default PLCOutputManager;
