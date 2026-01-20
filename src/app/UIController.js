/**
 * UI Controller - Handles all UI bindings and updates
 * Refactored to use CommandAutocomplete module
 */

import { parseCommandInput } from '../tools/toolManager.js';
import { createCommandDefinitions, CommandAutocomplete } from './CommandAutocomplete.js';

/**
 * UIController class - manages all UI interactions
 */
export class UIController {
  constructor(app) {
    this.app = app;

    // Initialize commands using the shared command definitions
    this.commands = createCommandDefinitions(app, this);

    // Create autocomplete manager
    this.autocomplete = new CommandAutocomplete(this.commands, (msg) => this.updateStatus(msg));
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
    this.setupFloatingToolbar();
    this.initWebSocket();
    this.setupTransferCancelButton();
  }

  /**
   * Setup cancel button for transfer progress
   */
  setupTransferCancelButton() {
    const cancelBtn = document.getElementById('cancelTransfer');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (this.app.wsService) {
          this.app.wsService.cancelTransfer();
        }
      });
    }
  }

  /**
   * Setup floating toolbar for selection editing
   */
  setupFloatingToolbar() {
    this.floatToolbar = document.getElementById('floatToolbar');
    if (!this.floatToolbar) return;

    const rotateAngleInput = document.getElementById('ftRotateAngle');
    const scaleFactorInput = document.getElementById('ftScaleFactor');
    const moveXInput = document.getElementById('ftMoveX');
    const moveYInput = document.getElementById('ftMoveY');

    const getRotateAngle = () => {
      const val = parseFloat(rotateAngleInput?.value) || 90;
      return Math.max(1, Math.min(360, val));
    };

    const getScaleFactor = () => {
      const val = parseFloat(scaleFactorInput?.value) || 1.5;
      return Math.max(0.1, Math.min(10, val));
    };

    document.getElementById('ftRotateCCW')?.addEventListener('click', () => {
      this.app.selectionManager.rotateSelected(getRotateAngle());
    });

    document.getElementById('ftRotateCW')?.addEventListener('click', () => {
      this.app.selectionManager.rotateSelected(-getRotateAngle());
    });

    document.getElementById('ftMirrorX')?.addEventListener('click', () => {
      this.app.selectionManager.mirrorSelected('x');
    });

    document.getElementById('ftMirrorY')?.addEventListener('click', () => {
      this.app.selectionManager.mirrorSelected('y');
    });

    document.getElementById('ftScaleUp')?.addEventListener('click', () => {
      this.app.selectionManager.scaleSelected(getScaleFactor());
    });

    document.getElementById('ftScaleDown')?.addEventListener('click', () => {
      const factor = getScaleFactor();
      this.app.selectionManager.scaleSelected(1 / factor);
    });

    document.getElementById('ftMoveApply')?.addEventListener('click', () => {
      const dx = parseFloat(moveXInput?.value) || 0;
      const dy = parseFloat(moveYInput?.value) || 0;
      if (dx !== 0 || dy !== 0) {
        this.app.selectionManager.moveSelected(dx, dy);
        if (moveXInput) moveXInput.value = '0';
        if (moveYInput) moveYInput.value = '0';
      }
    });

    [moveXInput, moveYInput].forEach(input => {
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('ftMoveApply')?.click();
        }
      });
    });

    document.getElementById('ftCopy')?.addEventListener('click', () => {
      this.app.selectionManager.copySelected();
    });

    document.getElementById('ftDelete')?.addEventListener('click', () => {
      this.app.selectionManager.deleteSelected();
    });
  }

  /**
   * Show or hide floating toolbar based on selection
   */
  updateFloatingToolbar() {
    if (!this.floatToolbar) return;

    if (this.app.selectedPrimitives.size > 0) {
      this.floatToolbar.classList.add('visible');
    } else {
      this.floatToolbar.classList.remove('visible');
    }
  }

  /**
   * Setup tool button bindings
   */
  setupToolButtons() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const toolName = btn.dataset.tool;
        this.app.selectTool(toolName);
      });
    });

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
    document.getElementById('btnSave')?.addEventListener('click', () => this.app.fileManager.saveToFile());
    document.getElementById('btnLoad')?.addEventListener('click', () => this.app.fileManager.loadFromFile());

    // Bind hidden file input for open
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.app.fileManager.processFile(file);
        }
        fileInput.value = '';
      });
    }
    document.getElementById('btnExportDXF')?.addEventListener('click', () => this.app.fileManager.exportDXF());
    document.getElementById('btnUndo')?.addEventListener('click', () => this.app.state.undo());
    document.getElementById('btnRedo')?.addEventListener('click', () => this.app.state.redo());
    document.getElementById('btnClear')?.addEventListener('click', () => this.app.selectionManager.clearAll());
    document.getElementById('btnZoomIn')?.addEventListener('click', () => this.app.viewManager.zoomIn());
    document.getElementById('btnZoomOut')?.addEventListener('click', () => this.app.viewManager.zoomOut());
    document.getElementById('btnZoomFit')?.addEventListener('click', () => this.app.viewManager.zoomFit());
    document.getElementById('btnSimulate')?.addEventListener('click', () => this.app.plcOutputManager.simulatePath());

    document.getElementById('btnPauseSim')?.addEventListener('click', () => {
      this.app.renderer.togglePauseSimulation();
      const isPaused = this.app.renderer.simulationManager.state.paused;
      const btn = document.getElementById('btnPauseSim');
      if (btn) {
        if (isPaused) {
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
          this.updateStatus("Simulazione in pausa");
        } else {
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
          this.updateStatus("Simulazione ripresa");
        }
      }
    });

    document.getElementById('btnCopyOutput')?.addEventListener('click', () => this.app.plcOutputManager.copyOutput());
    document.getElementById('btnDownloadOutput')?.addEventListener('click', () => this.app.plcOutputManager.downloadOutput());
    document.getElementById('btnSendPLC')?.addEventListener('click', () => this.app.plcOutputManager.sendToPLC());

    // PLC Settings: workSpeed, rapidSpeed, safeZ, workZ, waitTime
    const workSpeedInput = document.getElementById('simWorkSpeed');
    if (workSpeedInput) {
      workSpeedInput.addEventListener('change', (e) => {
        const speed = parseInt(e.target.value) || 100;
        if (this.app.renderer.simulation) {
          this.app.renderer.setSimulationSpeed(speed);
        }
        this.app.plcOutputManager.refreshPLCOutput();
        this.app.persistenceManager.triggerAutoSave();
      });
    }

    const rapidSpeedInput = document.getElementById('simRapidSpeed');
    if (rapidSpeedInput) {
      rapidSpeedInput.addEventListener('change', (e) => {
        const speed = parseInt(e.target.value) || 1000;
        if (this.app.renderer.simulation) {
          this.app.renderer.setRapidSpeed(speed);
        }
        this.app.plcOutputManager.refreshPLCOutput();
        this.app.persistenceManager.triggerAutoSave();
      });
    }

    const safeZInput = document.getElementById('simSafeZ');
    if (safeZInput) {
      safeZInput.addEventListener('change', () => {
        this.app.plcOutputManager.refreshPLCOutput();
        this.app.persistenceManager.triggerAutoSave();
      });
    }

    const workZInput = document.getElementById('simWorkZ');
    if (workZInput) {
      workZInput.addEventListener('change', () => {
        this.app.plcOutputManager.refreshPLCOutput();
        this.app.persistenceManager.triggerAutoSave();
      });
    }

    const waitTimeInput = document.getElementById('simWaitTime');
    if (waitTimeInput) {
      waitTimeInput.addEventListener('change', () => {
        this.app.plcOutputManager.refreshPLCOutput();
        this.app.persistenceManager.triggerAutoSave();
      });
    }
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
      this.app.snapManager.gridSpacing = this.app.gridSpacing;
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
      if (this.app.renderer) {
        this.app.renderer.grid.snapToGrid = this.app.snapToGrid;
      }
      if (this.app.snapManager) {
        this.app.snapManager.configure({ gridEnabled: this.app.snapToGrid });
      }
      if (this.app.persistenceManager) {
        this.app.persistenceManager.triggerAutoSave();
      }
    });

    document.getElementById('snapObjects')?.addEventListener('change', (e) => {
      this.app.snapToObjects = e.target.checked;
      if (this.app.snapManager) {
        this.app.snapManager.configure({ objectSnapEnabled: this.app.snapToObjects });
      }
      if (this.app.persistenceManager) {
        this.app.persistenceManager.triggerAutoSave();
      }
    });
  }

  /**
   * Setup command line input with autocomplete (uses CommandAutocomplete module)
   */
  setupCommandInput() {
    const commandInput = document.getElementById('commandInput');
    const autocompleteEl = document.getElementById('commandAutocomplete');

    if (commandInput && autocompleteEl) {
      this.autocomplete.setup(
        commandInput,
        autocompleteEl,
        () => this.app.cancelCurrentOperation()
      );
    }
  }

  /**
   * Setup modal dialogs
   */
  setupModals() {
    document.getElementById('closeShortcuts')?.addEventListener('click', () => {
      document.getElementById('shortcutsModal')?.setAttribute('hidden', '');
    });

    const menuBtn = document.getElementById('menuBtn');
    const hamburgerMenu = document.getElementById('hamburgerMenu');

    menuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      hamburgerMenu?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (hamburgerMenu?.classList.contains('open') && !hamburgerMenu.contains(e.target)) {
        hamburgerMenu.classList.remove('open');
      }
    });

    document.getElementById('btnShowShortcuts')?.addEventListener('click', () => {
      hamburgerMenu?.classList.remove('open');
      document.getElementById('shortcutsModal')?.removeAttribute('hidden');
    });
  }

  /**
   * Handle command input (for coordinate parsing)
   */
  handleCommand(input) {
    if (!input.trim()) return;

    // Try autocomplete first
    this.autocomplete.handleTextCommand(input);

    // If no command matched, try coordinate input
    const coord = parseCommandInput(input, this.app.input.currentMousePos);
    if (coord && this.app.currentTool) {
      this.app.handleToolClick(coord);
      return;
    }
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
    const lines = this.app.primitives.filter(p => ['line', 'polyline', 'rectangle', 'polygon'].includes(p.type)).length;
    const arcs = this.app.primitives.filter(p => ['arc', 'circle', 'ellipse', 'spline'].includes(p.type)).length;

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
   * Uses Event Delegation for performance
   */
  displayPLCOutput(plcCommands) {
    const grid = document.getElementById('outputGrid');
    if (!grid) return;

    if (!grid.dataset.listenerAttached) {
      grid.dataset.listenerAttached = 'true';
      grid.addEventListener('click', (e) => {
        const item = e.target.closest('.cad-output-item');
        if (!item) return;

        const index = parseInt(item.dataset.index);
        const wasSelected = item.classList.contains('selected');

        const currentSelected = grid.querySelector('.cad-output-item.selected');
        if (currentSelected) currentSelected.classList.remove('selected');

        if (!wasSelected) {
          item.classList.add('selected');
          const cmd = this.app.plcCommands ? this.app.plcCommands[index] : null;
          if (cmd && cmd.primitive) {
            this.app.highlightPrimitive(cmd.primitive);
          }
        } else {
          this.app.clearHighlight();
        }
      });
    }

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

  /**
   * Initialize WebSocket event handlers
   */
  initWebSocket() {
    const ws = this.app.wsService;
    if (!ws) return;

    // Connection status
    ws.on('status', (data) => {
      if (data && data.connected) {
        this.updateOPCUAStatus('Connesso', 'success');
      } else {
        this.updateOPCUAStatus('Disconnesso', 'error');
      }
    });

    ws.on('connected', () => {
      this.updateOPCUAStatus('Connessione PLC...', 'info');
      // Auto-connect to PLC and subscribe to position updates
      ws.command('connect');
    });

    ws.on('disconnected', () => {
      this.updateOPCUAStatus('WebSocket disconnesso', 'error');
    });

    ws.on('reconnecting', (data) => {
      this.updateOPCUAStatus(`Riconnessione... (${data.attempt})`, 'info');
    });

    ws.on('error', () => {
      this.updateOPCUAStatus('Errore connessione', 'error');
    });

    // Position updates
    ws.on('position', (data) => {
      this.updatePositionDisplay(data.x, data.y, data.z);
    });

    // Transfer progress
    ws.on('transfer_start', (data) => {
      this.showTransferProgress(data.totalChunks, data.totalLines);
    });

    ws.on('transfer_progress', (data) => {
      this.updateTransferProgress(data.chunk, data.total, data.percent);
    });

    ws.on('transfer_complete', () => {
      this.hideTransferProgress();
      this.updateOPCUAStatus('Trasferimento completato', 'success');
    });

    ws.on('transfer_error', (data) => {
      this.hideTransferProgress();
      this.updateOPCUAStatus(`Errore: ${data.error}`, 'error');
    });

    ws.on('transfer_cancelled', () => {
      this.hideTransferProgress();
      this.updateOPCUAStatus('Trasferimento annullato', 'info');
    });

    // ACK messages
    ws.on('ack', (data) => {
      if (data.action === 'connect' && data.success) {
        // PLC connected - subscribe to position updates
        this.updateOPCUAStatus('Connesso', 'success');
        ws.subscribe(100);
      } else if (data.success) {
        this.updateOPCUAStatus(data.message || 'OK', 'success');
      } else {
        this.updateOPCUAStatus(data.message || 'Errore', 'error');
      }
    });
  }

  /**
   * Update position display (X/Y/Z from PLC)
   */
  updatePositionDisplay(x, y, z) {
    const posEl = document.getElementById('plcPosition');
    if (posEl) {
      posEl.textContent = `X: ${x?.toFixed(2) || '0.00'} Y: ${y?.toFixed(2) || '0.00'} Z: ${z?.toFixed(2) || '0.00'}`;
    }
  }

  /**
   * Show transfer progress bar
   */
  showTransferProgress(totalChunks, totalLines) {
    const container = document.getElementById('transferProgress');
    if (container) {
      container.classList.remove('hidden');
      const text = container.querySelector('.progress-text');
      if (text) text.textContent = `0% (0/${totalChunks})`;
    }
    this.updateOPCUAStatus(`Trasferimento: ${totalLines} righe`, 'info');
  }

  /**
   * Update transfer progress bar
   */
  updateTransferProgress(chunk, total, percent) {
    const container = document.getElementById('transferProgress');
    if (container) {
      const fill = container.querySelector('.progress-fill');
      const text = container.querySelector('.progress-text');
      if (fill) fill.style.width = `${percent}%`;
      if (text) text.textContent = `${percent}% (${chunk}/${total})`;
    }
  }

  /**
   * Hide transfer progress bar
   */
  hideTransferProgress() {
    const container = document.getElementById('transferProgress');
    if (container) {
      container.classList.add('hidden');
      const fill = container.querySelector('.progress-fill');
      if (fill) fill.style.width = '0%';
    }
  }
}

export default UIController;
