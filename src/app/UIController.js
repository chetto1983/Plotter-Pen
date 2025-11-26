/**
 * UI Controller - Handles all UI bindings and updates
 */

import { parseCommandInput } from '../tools/toolManager.js';

export class UIController {
  constructor(app) {
    this.app = app;
  }

  /**
   * Setup all UI element bindings
   */
  setup() {
    this.setupToolButtons();
    this.setupActionButtons();
    this.setupSettingsInputs();
    this.setupCommandInput();
    this.setupModals();
  }

  /**
   * Setup tool button bindings
   */
  setupToolButtons() {
    // Tool buttons
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const toolName = btn.dataset.tool;
        this.app.selectTool(toolName);
      });
    });

    // Arc mode buttons
    document.querySelectorAll('[data-arc-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.arcMode = btn.dataset.arcMode;
        this.app.selectTool('arc');
        this.updateArcModeUI();
      });
    });
  }

  /**
   * Setup action button bindings
   */
  setupActionButtons() {
    document.getElementById('btnUndo')?.addEventListener('click', () => this.app.state.undo());
    document.getElementById('btnRedo')?.addEventListener('click', () => this.app.state.redo());
    document.getElementById('btnClear')?.addEventListener('click', () => this.app.clearAll());
    document.getElementById('btnZoomIn')?.addEventListener('click', () => this.app.zoomIn());
    document.getElementById('btnZoomOut')?.addEventListener('click', () => this.app.zoomOut());
    document.getElementById('btnZoomFit')?.addEventListener('click', () => this.app.zoomFit());
    document.getElementById('btnCopyOutput')?.addEventListener('click', () => this.app.copyOutput());
    document.getElementById('btnDownloadOutput')?.addEventListener('click', () => this.app.downloadOutput());
    document.getElementById('btnSendPLC')?.addEventListener('click', () => this.app.sendToPLC());
  }

  /**
   * Setup settings input bindings
   */
  setupSettingsInputs() {
    document.getElementById('workspaceWidth')?.addEventListener('change', (e) => {
      this.app.workspaceWidth = parseInt(e.target.value) || 600;
      this.app.renderer.setWorkspaceSize(this.app.workspaceWidth, this.app.workspaceHeight);
      this.app.render();
    });

    document.getElementById('workspaceHeight')?.addEventListener('change', (e) => {
      this.app.workspaceHeight = parseInt(e.target.value) || 600;
      this.app.renderer.setWorkspaceSize(this.app.workspaceWidth, this.app.workspaceHeight);
      this.app.render();
    });

    document.getElementById('gridSpacing')?.addEventListener('change', (e) => {
      this.app.gridSpacing = parseInt(e.target.value) || 10;
      this.app.snapManager.gridSize = this.app.gridSpacing;
      this.app.renderer.grid.spacing = this.app.gridSpacing;
      this.app.render();
    });

    document.getElementById('showGrid')?.addEventListener('change', (e) => {
      this.app.showGrid = e.target.checked;
      this.app.renderer.grid.show = this.app.showGrid;
      this.app.render();
    });

    document.getElementById('snapGrid')?.addEventListener('change', (e) => {
      this.app.snapToGrid = e.target.checked;
      this.app.snapManager.gridEnabled = this.app.snapToGrid;
    });

    document.getElementById('snapObjects')?.addEventListener('change', (e) => {
      this.app.snapToObjects = e.target.checked;
      this.app.snapManager.objectSnapEnabled = this.app.snapToObjects;
    });
  }

  /**
   * Setup command line input
   */
  setupCommandInput() {
    const commandInput = document.getElementById('commandInput');
    commandInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleCommand(commandInput.value);
        commandInput.value = '';
      } else if (e.key === 'Escape') {
        this.app.cancelCurrentOperation();
        commandInput.value = '';
      }
    });
  }

  /**
   * Setup modal dialogs
   */
  setupModals() {
    document.getElementById('closeShortcuts')?.addEventListener('click', () => {
      document.getElementById('shortcutsModal')?.setAttribute('hidden', '');
    });

    // Hamburger menu toggle
    const menuBtn = document.getElementById('menuBtn');
    const hamburgerMenu = document.getElementById('hamburgerMenu');

    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      hamburgerMenu?.classList.toggle('open');
    });

    // Close hamburger menu when clicking outside
    document.addEventListener('click', (e) => {
      if (hamburgerMenu?.classList.contains('open') && !hamburgerMenu.contains(e.target)) {
        hamburgerMenu.classList.remove('open');
      }
    });

    // Shortcuts button in hamburger menu
    document.getElementById('btnShowShortcuts')?.addEventListener('click', () => {
      hamburgerMenu?.classList.remove('open');
      document.getElementById('shortcutsModal')?.removeAttribute('hidden');
    });
  }

  /**
   * Handle command input
   */
  handleCommand(input) {
    if (!input.trim()) return;

    const cmd = input.trim().toLowerCase();

    // Check for tool commands
    if (cmd === 'line' || cmd === 'l') {
      this.app.selectTool('line');
      return;
    }
    if (cmd === 'arc' || cmd === 'a') {
      this.app.selectTool('arc');
      return;
    }
    if (cmd === 'circle' || cmd === 'c') {
      this.app.selectTool('circle');
      return;
    }
    if (cmd === 'rectangle' || cmd === 'rect' || cmd === 'r') {
      this.app.selectTool('rectangle');
      return;
    }
    if (cmd === 'polygon' || cmd === 'p') {
      this.app.selectTool('polygon');
      return;
    }

    // Try to parse as coordinate input
    const coord = parseCommandInput(input, this.app.input.currentMousePos);
    if (coord && this.app.currentTool) {
      this.app.handleToolClick(coord);
      return;
    }

    this.updateStatus(`Comando non riconosciuto: ${input}`);
  }

  /**
   * Update tool button UI
   */
  updateToolUI(activeTool) {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === activeTool);
    });

    const statusTool = document.getElementById('statusTool');
    if (statusTool) {
      statusTool.textContent = activeTool ? activeTool.charAt(0).toUpperCase() + activeTool.slice(1) : 'Nessuno';
    }
  }

  /**
   * Update arc mode UI
   */
  updateArcModeUI() {
    document.querySelectorAll('[data-arc-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.arcMode === this.app.arcMode);
    });
  }

  /**
   * Update coordinate display
   */
  updateCoordinates(pos) {
    const coordX = document.getElementById('coordX');
    const coordY = document.getElementById('coordY');
    const statusX = document.getElementById('statusX');
    const statusY = document.getElementById('statusY');

    if (coordX) coordX.textContent = pos.x.toFixed(2);
    if (coordY) coordY.textContent = pos.y.toFixed(2);
    if (statusX) statusX.textContent = `X: ${pos.x.toFixed(2)}`;
    if (statusY) statusY.textContent = `Y: ${pos.y.toFixed(2)}`;
  }

  /**
   * Update snap info display
   */
  updateSnapInfo(snapType) {
    const snapInfo = document.getElementById('snapInfo');
    if (snapInfo) {
      const typeLabels = {
        endpoint: 'Fine',
        midpoint: 'Medio',
        center: 'Centro',
        intersection: 'Intersezione',
        grid: 'Griglia'
      };
      snapInfo.querySelector('.cad-snap-type').textContent = typeLabels[snapType] || '-';
    }
  }

  /**
   * Update zoom display
   */
  updateZoomDisplay() {
    const statusZoom = document.getElementById('statusZoom');
    if (statusZoom) {
      statusZoom.textContent = `${Math.round(this.app.renderer.view.zoom * 100)}%`;
    }
  }

  /**
   * Update statistics display
   */
  updateStats() {
    const lines = this.app.primitives.filter(p => p.type === 'line').length;
    const arcs = this.app.primitives.filter(p => p.type === 'arc' || p.type === 'circle').length;

    const statLines = document.getElementById('statLines');
    const statArcs = document.getElementById('statArcs');
    const statTotal = document.getElementById('statTotal');

    if (statLines) statLines.textContent = lines;
    if (statArcs) statArcs.textContent = arcs;
    if (statTotal) statTotal.textContent = this.app.primitives.length;
  }

  /**
   * Update status message
   */
  updateStatus(message) {
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
      statusMessage.textContent = message;
    }

    const commandHint = document.getElementById('commandHint');
    if (commandHint && this.app.currentTool) {
      commandHint.textContent = this.app.currentTool.getHint?.() || message;
    }
  }

  /**
   * Display PLC output in grid with primitive highlighting
   */
  displayPLCOutput(plcCommands, app) {
    const grid = document.getElementById('outputGrid');
    if (!grid) return;

    // Handle both old format (string array) and new format (command objects)
    const commands = Array.isArray(plcCommands) ?
      (typeof plcCommands[0] === 'string' ? plcCommands.map(c => ({ command: c })) : plcCommands) :
      [];

    if (commands.length === 0) {
      grid.innerHTML = '<div class="cad-output-empty">Disegna primitive per generare i comandi PLC</div>';
      return;
    }

    grid.innerHTML = commands.map((cmd, i) =>
      `<div class="cad-output-item" data-index="${i}">${cmd.command}</div>`
    ).join('');

    // Add click handlers for selection and primitive highlighting
    grid.querySelectorAll('.cad-output-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        // Toggle selection state
        const wasSelected = item.classList.contains('selected');

        // Remove selection from all items
        grid.querySelectorAll('.cad-output-item').forEach(el => el.classList.remove('selected'));

        if (!wasSelected) {
          // Select this item and highlight primitive
          item.classList.add('selected');

          const cmd = commands[index];
          if (cmd && cmd.primitive && app) {
            app.highlightPrimitive(cmd.primitive);
          }
        } else {
          // Deselect - clear highlight
          if (app) {
            app.clearHighlight();
          }
        }
      });
    });
  }

  /**
   * Update OPC UA status display
   */
  updateOPCUAStatus(status, type = 'info') {
    const statusEl = document.getElementById('opcuaStatus');
    if (statusEl) {
      statusEl.textContent = status;
      statusEl.className = 'cad-opcua-status';
      if (type === 'success') statusEl.classList.add('connected');
      if (type === 'error') statusEl.classList.add('error');
    }
  }
}

export default UIController;
