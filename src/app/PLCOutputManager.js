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
      if (p.type === "line") {
        p.plcData = { type: 1, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
      } else if (p.type === "arc") {
        p.plcData = {
          type: p.isClockwise ? 2 : 3,
          x1: p.x1,
          y1: p.y1,
          x2: p.x2,
          y2: p.y2,
          cx: p.cx,
          cy: p.cy,
        };
      } else if (p.type === "circle") {
        p.plcData = {
          type: 3,
          x1: p.center.x + p.radius,
          y1: p.center.y,
          x2: p.center.x + p.radius,
          y2: p.center.y,
          cx: p.center.x,
          cy: p.center.y,
        };
      } else if (p.type === "rectangle") {
        p.plcData = { type: "rectangle", x: p.x, y: p.y, width: p.width, height: p.height };
      }
      return p;
    });

    const expandedPrimitives = [];
    for (const p of primitivesWithData) {
      if (p.type === "rectangle") {
        const x = p.x;
        const y = p.y;
        const w = p.width;
        const h = p.height;
        expandedPrimitives.push(
          { type: "line", x1: x, y1: y, x2: x + w, y2: y, plcData: { type: 1, x1: x, y1: y, x2: x + w, y2: y } },
          { type: "line", x1: x + w, y1: y, x2: x + w, y2: y + h, plcData: { type: 1, x1: x + w, y1: y, x2: x + w, y2: y + h } },
          { type: "line", x1: x + w, y1: y + h, x2: x, y2: y + h, plcData: { type: 1, x1: x + w, y1: y + h, x2: x, y2: y + h } },
          { type: "line", x1: x, y1: y + h, x2: x, y2: y, plcData: { type: 1, x1: x, y1: y + h, x2: x, y2: y } }
        );
      } else if (p.type === "polygon" && p.points && p.points.length > 1) {
        for (let i = 0; i < p.points.length - 1; i++) {
          const p1 = p.points[i];
          const p2 = p.points[i + 1];
          expandedPrimitives.push({
            type: "line",
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            plcData: { type: 1, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
          });
        }
        if (p.closed && p.points.length > 2) {
          const first = p.points[0];
          const last = p.points[p.points.length - 1];
          expandedPrimitives.push({
            type: "line",
            x1: last.x,
            y1: last.y,
            x2: first.x,
            y2: first.y,
            plcData: { type: 1, x1: last.x, y1: last.y, x2: first.x, y2: first.y },
          });
        }
      } else if (p.type === "line" || p.type === "arc" || p.type === "circle") {
        expandedPrimitives.push(p);
      }
    }

    const optimizedPrimitives = PathOptimizer.optimizeOrder(expandedPrimitives);
    const generator = new PLCOutputGenerator();
    const commands = generator.generate(optimizedPrimitives);
    this.app.plcCommands = commands;
    this.app.plcOutput = commands.map((c) => c.command);

    this.app.ui.displayPLCOutput(this.app.plcCommands, this.app);
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
      this.app.ui.updateStatus("Simulazione fermata");
      if (controlsEl) controlsEl.style.display = "none";
      if (btnSimulate) {
        btnSimulate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
      return;
    }

    if (controlsEl) controlsEl.style.display = "block";
    if (btnSimulate) {
      btnSimulate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }

    const speed = sliderEl ? parseInt(sliderEl.value, 10) : 80;
    this.app.ui.updateStatus("Simulazione in corso...");

    this.app.renderer.startSimulation(this.app.plcCommands, {
      speed,
      onComplete: () => {
        this.app.ui.updateStatus("Simulazione completata");
        if (controlsEl) controlsEl.style.display = "none";
        if (btnSimulate) {
          btnSimulate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
      },
      onUpdate: () => {},
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
