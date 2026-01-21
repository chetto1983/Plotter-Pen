import { PLCSimulator3D } from '../plc/PLCSimulator3D.js';
import { PLC3DAnimator } from '../plc/PLC3DAnimator.js';
import { getPLCSettingsFromUI, setPLCSettingsToUI, getPLCSettingsFromModal, setPLCSettingsToModal } from './plcSettingsUtils.js';

export class PLCOutputManager {
  constructor(app) {
    this.app = app;
    this.simulator3D = null;
    this.animator3D = null;
    this._is3DInitialized = false;
    this._saveTimeout = null;
  }

  /**
   * Initialize simulation settings from database and wire change handlers
   */
  async initSimulationSettings() {
    // Wire change handlers for hidden simulation settings inputs
    const inputs = [
      'simWorkSpeed',
      'simRapidSpeed',
      'simSafeZ',
      'simWorkZ',
      'simWaitTime'
    ];

    inputs.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('change', () => this.onSimSettingsChange());
      }
    });

    // Initialize PLC settings modal
    this.initPLCSettingsModal();

    // Initialize collapsible PLC panel
    this.initCollapsiblePLCPanel();

    // Load saved settings from database
    await this.loadSimulationSettings();
  }

  /**
   * Initialize PLC settings modal and wire event handlers
   */
  initPLCSettingsModal() {
    const modal = document.getElementById('plcSettingsModal');
    const openBtn = document.getElementById('btnPLCSettings');
    const closeBtn = document.getElementById('btnClosePLCSettings');
    const cancelBtn = document.getElementById('btnCancelPLCSettings');
    const saveBtn = document.getElementById('btnSavePLCSettings');

    if (!modal) return;

    // Open modal button
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openPLCSettingsModal());
    }

    // Close modal buttons
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePLCSettingsModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closePLCSettingsModal());
    }

    // Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePLCSettingsFromModal());
    }

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closePLCSettingsModal();
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) {
        this.closePLCSettingsModal();
      }
    });
  }

  /**
   * Open PLC settings modal and populate with current values
   */
  openPLCSettingsModal() {
    const modal = document.getElementById('plcSettingsModal');
    if (!modal) return;

    // Populate modal with current settings from hidden inputs
    const currentSettings = getPLCSettingsFromUI();
    setPLCSettingsToModal(currentSettings);

    modal.classList.add('open');
  }

  /**
   * Close PLC settings modal
   */
  closePLCSettingsModal() {
    const modal = document.getElementById('plcSettingsModal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  /**
   * Save PLC settings from modal to hidden inputs and database
   */
  async savePLCSettingsFromModal() {
    // Get settings from modal
    const settings = getPLCSettingsFromModal();

    // Update hidden inputs (for backward compatibility)
    setPLCSettingsToUI(settings);

    // Close modal
    this.closePLCSettingsModal();

    // Trigger settings change (saves to DB and re-extracts PLC)
    this.onSimSettingsChange();
  }

  /**
   * Initialize collapsible PLC panel
   */
  initCollapsiblePLCPanel() {
    const panel = document.getElementById('plcPanel');
    const collapseBtn = document.getElementById('btnCollapsePLC');
    const header = document.getElementById('plcPanelHeader');

    if (!panel || !collapseBtn) return;

    // Load saved collapse state
    const savedState = localStorage.getItem('plcPanelCollapsed');
    if (savedState === 'true') {
      panel.classList.add('collapsed');
    }

    // Toggle on button click
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePLCPanelCollapse();
    });

    // Toggle on header click (but not on action buttons)
    if (header) {
      header.addEventListener('click', (e) => {
        // Only toggle if clicking on header title area, not action buttons
        if (e.target.closest('.cad-panel-actions')) return;
        this.togglePLCPanelCollapse();
      });
    }
  }

  /**
   * Toggle PLC panel collapse state
   */
  togglePLCPanelCollapse() {
    const panel = document.getElementById('plcPanel');
    if (!panel) return;

    panel.classList.toggle('collapsed');
    const isCollapsed = panel.classList.contains('collapsed');
    localStorage.setItem('plcPanelCollapsed', isCollapsed);

    // Resize canvas after transition completes
    setTimeout(() => {
      this.app.renderer?.resize();
      this.app.render();
    }, 320); // Slightly longer than CSS transition (300ms)
  }

  /**
   * Load simulation settings from database
   */
  async loadSimulationSettings() {
    try {
      const response = await fetch('/api/plc/settings');
      if (!response.ok) return;

      const result = await response.json();
      if (result.data) {
        setPLCSettingsToUI(result.data);
      }
    } catch {
      // Silent fail - settings will use defaults
    }
  }

  /**
   * Handle simulation settings change - save and re-extract
   */
  onSimSettingsChange() {
    // Debounce saves to avoid excessive API calls
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }

    this._saveTimeout = setTimeout(async () => {
      await this.saveSimulationSettings();
      // Re-extract PLC output with new settings
      if (this.app.primitives && this.app.primitives.length > 0) {
        this.extractPLC();
      }
    }, 300);
  }

  /**
   * Save current simulation settings to database
   */
  async saveSimulationSettings() {
    const settings = getPLCSettingsFromUI();
    try {
      await fetch('/api/plc/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch {
      // Silent fail - non-critical operation
    }
  }

  /**
   * Initialize 3D simulator and wire event handlers
   */
  init3DSimulator() {
    if (this._is3DInitialized) return;

    const canvas = document.getElementById('plcSimulation3DCanvas');
    const overlay = document.getElementById('plc3dOverlay');

    if (!canvas || !overlay) {
      return;
    }

    // Create simulator and animator
    try {
      this.simulator3D = new PLCSimulator3D(canvas);
      this.animator3D = new PLC3DAnimator(this.simulator3D);
    } catch {
      // Continue to wire buttons even if 3D fails
    }

    // Wire 3D toggle button (in sidebar)
    const btnToggle = document.getElementById('btn3DToggle');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => this.toggle3DView());
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

    // Wire 3D zoom controls
    const btnZoomIn = document.getElementById('btn3DZoomIn');
    const btnZoomOut = document.getElementById('btn3DZoomOut');
    const btnZoomExtent = document.getElementById('btn3DZoomExtent');

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => this.simulator3D?.zoomIn());
    }
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => this.simulator3D?.zoomOut());
    }
    if (btnZoomExtent) {
      btnZoomExtent.addEventListener('click', () => this.simulator3D?.zoomExtent());
    }

    // Wire 3D rotation controls
    const btnRotateCCW = document.getElementById('btn3DRotateCCW');
    const btnRotateCW = document.getElementById('btn3DRotateCW');

    if (btnRotateCCW) {
      btnRotateCCW.addEventListener('click', () => {
        if (this.simulator3D) {
          this.simulator3D.rotate90CCW();
        }
      });
    }
    if (btnRotateCW) {
      btnRotateCW.addEventListener('click', () => {
        if (this.simulator3D) {
          this.simulator3D.rotate90CW();
        }
      });
    }

    // Listen for animation progress
    this.animator3D.onUpdate = (currentIndex, total) => {
      // Update 3D progress bar
      const progressBar = overlay.querySelector('.cad-3d-progress-bar');
      if (progressBar && total > 0) {
        const percent = Math.round((currentIndex / total) * 100);
        progressBar.style.width = `${percent}%`;
      }
      // Highlight current command in PLC output panel (auto-scroll)
      if (this.app.ui) {
        this.app.ui.highlightPLCCommand(currentIndex);
      }
    };

    this.animator3D.onComplete = () => {
      if (btnPlay) {
        btnPlay.textContent = '▶';
        btnPlay.classList.remove('playing');
      }
      const progressBar = overlay.querySelector('.cad-3d-progress-bar');
      if (progressBar) progressBar.style.width = '100%';
      // Clear highlights when complete
      if (this.app.ui) {
        this.app.ui.clearPLCHighlights();
      }
    };

    // ESC key to close 3D view
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        this.toggle3DView();
      }
    });

    this._is3DInitialized = true;
  }

  /**
   * Toggle 3D view visibility (main canvas overlay)
   */
  toggle3DView() {
    const overlay = document.getElementById('plc3dOverlay');
    const btnToggle = document.getElementById('btn3DToggle');

    if (!overlay) {
      return;
    }

    const isVisible = overlay.style.display !== 'none';
    overlay.style.display = isVisible ? 'none' : 'block';

    if (btnToggle) {
      btnToggle.classList.toggle('active', !isVisible);
    }

    // Update simulator with current commands when shown
    if (!isVisible && this.app.plcOutput && this.app.plcOutput.length > 0) {
      this.update3DSimulation();
      // Set initial view rotated 180 degrees for better front view
      if (this.simulator3D?.controls) {
        this.simulator3D.controls.theta = Math.PI + Math.PI / 4;  // 180° + 45° = 225°
        this.simulator3D.controls.phi = Math.PI / 3;  // 60° elevation
        this.simulator3D.updateCameraFromControls();
      }
      // Trigger resize after display change
      setTimeout(() => this.simulator3D?.resize(), 50);
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
    const settings = getPLCSettingsFromUI();
    const { workSpeed: defaultSpeed, rapidSpeed, safeZ, workZ, waitTime } = settings;

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
      // Serialize points to plain {x, y} objects for JSON
      req.points = p.points.map(pt => ({ x: pt.x, y: pt.y }));
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
    } catch {
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
