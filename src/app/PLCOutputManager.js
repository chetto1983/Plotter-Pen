import { PLCSimulator3D } from '../plc/PLCSimulator3D.js';
import { PLC3DAnimator } from '../plc/PLC3DAnimator.js';

export class PLCOutputManager {
  constructor(app) {
    this.app = app;
    this.simulator3D = null;
    this.animator3D = null;
    this._is3DInitialized = false;
  }

  /**
   * Initialize 3D simulator and wire event handlers
   */
  init3DSimulator() {
    if (this._is3DInitialized) return;

    const canvas = document.getElementById('plcSimulation3DCanvas');
    const overlay = document.getElementById('plc3dOverlay');

    // Log DOM state for debugging
    console.log('[PLC3D] init3DSimulator called');
    console.log('[PLC3D] canvas:', canvas ? 'found' : 'NOT FOUND');
    console.log('[PLC3D] overlay:', overlay ? 'found' : 'NOT FOUND');

    if (!canvas || !overlay) {
      console.error('[PLC3D] Missing DOM elements, cannot initialize');
      return;
    }

    // Create simulator and animator with error handling
    try {
      this.simulator3D = new PLCSimulator3D(canvas);
      this.animator3D = new PLC3DAnimator(this.simulator3D);
      console.log('[PLC3D] Simulator created successfully');
    } catch (err) {
      console.error('[PLC3D] Failed to create simulator:', err);
      // Continue to wire buttons even if 3D fails
    }

    // Wire 3D toggle button (in sidebar)
    const btnToggle = document.getElementById('btn3DToggle');
    console.log('[PLC3D] btn3DToggle:', btnToggle ? 'found' : 'NOT FOUND');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        console.log('[PLC3D] Toggle button clicked!');
        this.toggle3DView();
      });
      console.log('[PLC3D] Toggle button wired');
    }

    // Wire close button (in overlay)
    const btnClose = document.getElementById('btn3DClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.toggle3DView());
    }

    // Wire playback controls
    const btnPlay = document.getElementById('btn3DPlay');
    const btnStep = document.getElementById('btn3DStep');
    const btnReset = document.getElementById('btn3DReset');
    const speedSlider = document.getElementById('sim3DSpeed');
    const speedLabel = document.getElementById('sim3DSpeedLabel');

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        if (this.animator3D.isPlaying) {
          this.animator3D.pause();
          btnPlay.textContent = '▶';
          btnPlay.classList.remove('playing');
        } else {
          this.animator3D.play();
          btnPlay.textContent = '⏸';
          btnPlay.classList.add('playing');
        }
      });
    }

    if (btnStep) {
      btnStep.addEventListener('click', () => this.animator3D.step());
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.animator3D.stop();
        if (btnPlay) {
          btnPlay.textContent = '▶';
          btnPlay.classList.remove('playing');
        }
      });
    }

    if (speedSlider) {
      speedSlider.addEventListener('input', () => {
        const speed = parseFloat(speedSlider.value);
        this.animator3D.setSpeed(speed);
        if (speedLabel) speedLabel.textContent = `${speed.toFixed(1)}x`;
      });
    }

    // Wire STL upload
    const stlUpload = document.getElementById('stlToolUpload');
    if (stlUpload) {
      stlUpload.addEventListener('change', (e) => this.handleSTLUpload(e));
    }

    // Listen for animation progress
    this.animator3D.onUpdate = (currentIndex, total) => {
      const progressBar = overlay.querySelector('.cad-3d-progress-bar');
      if (progressBar && total > 0) {
        const percent = Math.round((currentIndex / total) * 100);
        progressBar.style.width = `${percent}%`;
      }
    };

    this.animator3D.onComplete = () => {
      if (btnPlay) {
        btnPlay.textContent = '▶';
        btnPlay.classList.remove('playing');
      }
      const progressBar = overlay.querySelector('.cad-3d-progress-bar');
      if (progressBar) progressBar.style.width = '100%';
    };

    // ESC key to close 3D view
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        this.toggle3DView();
      }
    });

    this._is3DInitialized = true;
    console.log('[PLC3D] init3DSimulator completed successfully');
  }

  /**
   * Toggle 3D view visibility (main canvas overlay)
   */
  toggle3DView() {
    console.log('[PLC3D] toggle3DView called');
    const overlay = document.getElementById('plc3dOverlay');
    const btnToggle = document.getElementById('btn3DToggle');

    console.log('[PLC3D] overlay in toggle:', overlay ? 'found' : 'NOT FOUND');
    if (!overlay) {
      console.error('[PLC3D] Cannot toggle - overlay not found!');
      return;
    }

    const isVisible = overlay.style.display !== 'none';
    console.log('[PLC3D] isVisible:', isVisible, '-> setting to:', isVisible ? 'none' : 'block');
    overlay.style.display = isVisible ? 'none' : 'block';

    if (btnToggle) {
      btnToggle.classList.toggle('active', !isVisible);
    }

    // Update simulator with current commands when shown
    if (!isVisible && this.app.plcOutput && this.app.plcOutput.length > 0) {
      this.update3DSimulation();
      // Trigger resize after display change
      setTimeout(() => this.simulator3D?.resize(), 50);
    }
  }

  /**
   * Handle STL file upload for custom tool model
   */
  async handleSTLUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !this.simulator3D) return;

    try {
      await this.simulator3D.loadToolSTL(file);
      this.app.ui.updateStatus('Modello STL caricato');
    } catch (err) {
      console.error('STL load failed:', err);
      this.app.ui.updateStatus('Errore caricamento STL');
    }
  }

  /**
   * Update 3D simulation with current PLC output
   */
  update3DSimulation() {
    if (!this.animator3D || !this.app.plcOutput || this.app.plcOutput.length === 0) return;

    // Draw CAD primitives on 3D work surface
    if (this.simulator3D && this.app.primitives && this.app.primitives.length > 0) {
      this.simulator3D.drawPrimitivesOnSurface(this.app.primitives);
    }

    this.animator3D.load(this.app.plcOutput);
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
    const waitInput = document.getElementById('simWaitTime');

    const defaultSpeed = speedInput ? parseFloat(speedInput.value) : 100.0;
    const rapidSpeed = rapidInput ? parseFloat(rapidInput.value) : 1000.0;
    const safeZ = safeZInput ? parseFloat(safeZInput.value) : 5.0;
    const workZ = workZInput ? parseFloat(workZInput.value) : -2.0;
    const waitTime = waitInput ? parseInt(waitInput.value, 10) : 0;

    // Convert primitives to API format
    const supportedTypes = new Set(["line", "arc", "circle", "rectangle", "polygon", "polyline"]);
    const primitives = this.app.primitives
      .filter((p) => supportedTypes.has(p.type))
      .map((p) => this.primitiveToRequest(p));

    try {
      const response = await fetch("/api/plc/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primitives, defaultSpeed, rapidSpeed, safeZ, workZ, waitTime })
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

      // Update 3D simulation if visible
      this.update3DSimulation();
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

  /**
   * Start 3D simulation - opens overlay and plays
   */
  simulatePath() {
    if (!this.app.plcOutput || this.app.plcOutput.length === 0) {
      this.app.ui.updateStatus("Nessun percorso da simulare");
      return;
    }

    // Open 3D view if not already open
    const overlay = document.getElementById('plc3dOverlay');
    if (overlay && overlay.style.display === 'none') {
      this.toggle3DView();
    }

    // Start playing after a short delay for resize
    setTimeout(() => {
      if (this.animator3D && !this.animator3D.isPlaying) {
        this.animator3D.play();
        const btnPlay = document.getElementById('btn3DPlay');
        if (btnPlay) {
          btnPlay.textContent = '⏸';
          btnPlay.classList.add('playing');
        }
      }
    }, 100);
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
