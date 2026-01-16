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

  async extractPLC() {
    if (this.app.primitives.length === 0) {
      this.app.ui.updateStatus("Nessuna primitiva da estrarre");
      return;
    }

    // Get config from UI
    const speedInput = document.getElementById('simWorkSpeed');
    const rapidInput = document.getElementById('simRapidSpeed');
    const safeZInput = document.getElementById('simSafeZ');
    const workZInput = document.getElementById('simWorkZ');

    const defaultSpeed = speedInput ? parseFloat(speedInput.value) : 100.0;
    const rapidSpeed = rapidInput ? parseFloat(rapidInput.value) : 1000.0;
    const safeZ = safeZInput ? parseFloat(safeZInput.value) : 5.0;
    const workZ = workZInput ? parseFloat(workZInput.value) : -2.0;

    // Convert primitives to API format
    const supportedTypes = new Set(["line", "arc", "circle", "rectangle", "polygon", "polyline"]);
    const primitives = this.app.primitives
      .filter((p) => supportedTypes.has(p.type))
      .map((p) => this.primitiveToRequest(p));

    try {
      const response = await fetch("/api/plc/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primitives, defaultSpeed, rapidSpeed, safeZ, workZ })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // Map commands back to source primitives for UI highlighting
      const primMap = new Map(this.app.primitives.map(p => [p.id, p]));
      this.app.plcCommands = result.commands.map(cmd => ({
        command: cmd.command,
        primitive: primMap.get(cmd.primitiveId) || null
      }));
      this.app.plcOutput = result.output;

      // Limit UI display to avoid DOM freeze
      const displayCommands = this.app.plcCommands.length > 2000
        ? this.app.plcCommands.slice(0, 2000).concat([{ command: `... (${this.app.plcCommands.length - 2000} more commands)` }])
        : this.app.plcCommands;

      this.app.ui.displayPLCOutput(displayCommands, this.app);
      this.app.ui.updateStats();
      this.app.ui.updateStatus(`Estratte ${this.app.plcOutput.length} istruzioni PLC`);
    } catch (err) {
      console.error("PLC extraction failed:", err);
      this.app.ui.updateStatus(`Errore estrazione PLC: ${err.message}`);
    }
  }

  // Convert frontend primitive to API request format
  primitiveToRequest(p) {
    const req = { type: p.type, id: p.id };

    if (p.type === "line") {
      req.x1 = p.x1; req.y1 = p.y1;
      req.x2 = p.x2; req.y2 = p.y2;
    } else if (p.type === "arc") {
      req.x1 = p.x1; req.y1 = p.y1;
      req.x2 = p.x2; req.y2 = p.y2;
      req.cx = p.cx; req.cy = p.cy;
      req.isClockwise = p.isClockwise || false;
      req.sweep = p.sweep;
    } else if (p.type === "circle") {
      req.cx = p.center?.x ?? p.cx;
      req.cy = p.center?.y ?? p.cy;
      req.radius = p.radius ?? p._radius;
      req.center = { x: req.cx, y: req.cy };
    } else if (p.type === "rectangle") {
      req.x = p.x; req.y = p.y;
      req.width = p.width; req.height = p.height;
    } else if (p.type === "polygon" || p.type === "polyline") {
      req.points = p.points;
      req.closed = p.closed;
    }

    return req;
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
      this.sendViaWebSocket(ws);
    } else {
      this.sendViaHTTP();
    }
  }

  /**
   * Send via WebSocket chunked transfer (preferred)
   */
  sendViaWebSocket(ws) {
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
