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

    const primitivesWithData = this.app.primitives.map((p) => {
      // Create a shallow copy to attach plcData without polluting original too much
      // (Actually original code modified 'p' directly which is risky but I will stick to it for now or copy)
      // The original code returned 'p' with 'plcData'.

      if (p.type === "line") {
        p.plcData = { type: 1, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
      } else if (p.type === "arc") {
        p.plcData = {
          type: p.isClockwise ? 2 : 3,
          x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, cx: p.cx, cy: p.cy,
        };
      } else if (p.type === "circle") {
        p.plcData = {
          type: 3,
          x1: p.center.x + p.radius, y1: p.center.y,
          x2: p.center.x + p.radius, y2: p.center.y,
          cx: p.center.x, cy: p.center.y,
        };
      } else if (p.type === "rectangle") {
        p.plcData = { type: "rectangle", x: p.x, y: p.y, width: p.width, height: p.height };
      } else if (p.type === "polygon" || p.type === "polyline") {
        // Prepare data for polygon/polyline
        p.plcData = { type: p.type, points: p.points, closed: p.closed };
      }
      return p;
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

  async sendToPLC() {

    if (this.app.plcOutput.length === 0) {
      this.app.ui.updateStatus("Nessun output da inviare");
      return;
    }

    this.app.ui.updateOPCUAStatus("Invio in corso...", "info");

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
