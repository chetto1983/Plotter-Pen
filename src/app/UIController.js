/**
 * UI Controller - Handles all UI bindings and updates
 */

import { parseCommandInput } from '../tools/toolManager.js';

export class UIController {
  constructor(app) {
    this.app = app;

    // Command definitions for autocomplete
    this.commands = [
      // Drawing Tools
      { name: 'LINE', aliases: ['L'], desc: 'Disegna una linea', shortcut: 'L', category: 'Disegno', action: () => this.app.selectTool('line') },
      { name: 'ARC', aliases: ['A'], desc: 'Disegna un arco', shortcut: 'A', category: 'Disegno', action: () => this.app.selectTool('arc') },
      { name: 'CIRCLE', aliases: ['C', 'CERCHIO'], desc: 'Disegna un cerchio', shortcut: 'C', category: 'Disegno', action: () => this.app.selectTool('circle') },
      { name: 'RECTANGLE', aliases: ['RECT', 'R', 'RETTANGOLO'], desc: 'Disegna un rettangolo', shortcut: 'R', category: 'Disegno', action: () => this.app.selectTool('rectangle') },
      { name: 'POLYGON', aliases: ['P', 'POLY', 'POLIGONO'], desc: 'Disegna un poligono', shortcut: 'P', category: 'Disegno', action: () => this.app.selectTool('polygon') },

      // Edit Tools
      { name: 'SELECT', aliases: ['S', 'SEL', 'SELEZIONA'], desc: 'Modalità selezione', shortcut: 'S', category: 'Modifica', action: () => this.app.selectTool('select') },
      { name: 'DELETE', aliases: ['DEL', 'ERASE', 'ELIMINA'], desc: 'Elimina selezione', shortcut: 'DEL', category: 'Modifica', action: () => this.app.deleteSelected() },
      { name: 'MOVE', aliases: ['M', 'SPOSTA'], desc: 'Sposta selezione (usa frecce o trascina)', shortcut: 'Frecce', category: 'Modifica', action: () => { this.app.selectTool('select'); this.updateStatus('Usa frecce per spostare o trascina con mouse'); } },
      { name: 'COPYSEL', aliases: ['COPIASEL'], desc: 'Copia selezione', shortcut: 'Ctrl+C', category: 'Modifica', action: () => this.app.copySelected() },
      { name: 'PASTE', aliases: ['INCOLLA'], desc: 'Incolla dagli appunti', shortcut: 'Ctrl+V', category: 'Modifica', action: () => this.app.pasteClipboard() },
      { name: 'CUT', aliases: ['TAGLIA'], desc: 'Taglia selezione', shortcut: 'Ctrl+X', category: 'Modifica', action: () => this.app.cutSelected() },
      { name: 'ROTATE', aliases: ['ROT', 'RUOTA'], desc: 'Ruota selezione 90°', shortcut: '', category: 'Modifica', action: () => this.app.rotateSelected(90) },
      { name: 'ROTATE45', aliases: ['ROT45'], desc: 'Ruota selezione 45°', shortcut: '', category: 'Modifica', action: () => this.app.rotateSelected(45) },
      { name: 'SCALE', aliases: ['SCALA'], desc: 'Scala selezione (1.5x)', shortcut: '', category: 'Modifica', action: () => this.app.scaleSelected(1.5) },
      { name: 'SCALEDOWN', aliases: ['SCALAGIU'], desc: 'Scala selezione (0.5x)', shortcut: '', category: 'Modifica', action: () => this.app.scaleSelected(0.5) },
      { name: 'MIRRORX', aliases: ['SPECCHIOX'], desc: 'Specchia orizzontalmente', shortcut: '', category: 'Modifica', action: () => this.app.mirrorSelected('x') },
      { name: 'MIRRORY', aliases: ['SPECCHIOY'], desc: 'Specchia verticalmente', shortcut: '', category: 'Modifica', action: () => this.app.mirrorSelected('y') },

      // File Operations
      { name: 'SAVE', aliases: ['SALVA'], desc: 'Salva disegno', shortcut: 'Ctrl+S', category: 'File', action: () => this.app.saveToFile() },
      { name: 'OPEN', aliases: ['LOAD', 'APRI', 'CARICA'], desc: 'Apri disegno', shortcut: 'Ctrl+O', category: 'File', action: () => this.app.loadFromFile() },
      { name: 'NEW', aliases: ['CLEAR', 'NUOVO', 'PULISCI'], desc: 'Nuovo disegno (pulisci tutto)', shortcut: '', category: 'File', action: () => this.app.clearAll() },

      // View
      { name: 'ZOOM', aliases: ['Z'], desc: 'Zoom (+ o - per in/out)', shortcut: '+/-', category: 'Vista', action: () => this.updateStatus('Usa + per zoom in, - per zoom out') },
      { name: 'ZOOMIN', aliases: ['ZI'], desc: 'Zoom avanti', shortcut: '+', category: 'Vista', action: () => this.app.zoomIn() },
      { name: 'ZOOMOUT', aliases: ['ZO'], desc: 'Zoom indietro', shortcut: '-', category: 'Vista', action: () => this.app.zoomOut() },
      { name: 'FIT', aliases: ['ZOOMFIT', 'ZF', 'ADATTA'], desc: 'Adatta vista', shortcut: 'F', category: 'Vista', action: () => this.app.zoomFit() },
      { name: 'GRID', aliases: ['G', 'GRIGLIA'], desc: 'Attiva/disattiva griglia', shortcut: 'G', category: 'Vista', action: () => this.app.toggleGrid() },

      // Actions
      { name: 'UNDO', aliases: ['U', 'ANNULLA'], desc: 'Annulla ultima azione', shortcut: 'Ctrl+Z', category: 'Azioni', action: () => this.app.state.undo() },
      { name: 'REDO', aliases: ['RIPETI'], desc: 'Ripeti azione annullata', shortcut: 'Ctrl+Y', category: 'Azioni', action: () => this.app.state.redo() },
      { name: 'ESCAPE', aliases: ['ESC', 'CANCEL', 'ANNULLA'], desc: 'Annulla operazione corrente', shortcut: 'ESC', category: 'Azioni', action: () => this.app.cancelCurrentOperation() },

      // Output
      { name: 'EXTRACT', aliases: ['PLC', 'OUTPUT'], desc: 'Estrai comandi PLC', shortcut: '', category: 'Output', action: () => this.app.extractPLC() },
      { name: 'COPY', aliases: ['COPIA'], desc: 'Copia output negli appunti', shortcut: '', category: 'Output', action: () => this.app.copyOutput() },
      { name: 'DOWNLOAD', aliases: ['SCARICA'], desc: 'Scarica output come file', shortcut: '', category: 'Output', action: () => this.app.downloadOutput() },
      { name: 'SEND', aliases: ['INVIA'], desc: 'Invia a PLC via OPC UA', shortcut: '', category: 'Output', action: () => this.app.sendToPLC() },

      // Help
      { name: 'HELP', aliases: ['?', 'AIUTO', 'H'], desc: 'Mostra scorciatoie', shortcut: 'F1', category: 'Aiuto', action: () => document.getElementById('shortcutsModal')?.removeAttribute('hidden') },
    ];

    // Autocomplete state
    this.autocompleteEl = null;
    this.selectedIndex = -1;
    this.filteredCommands = [];
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
  }

  /**
   * Setup floating toolbar for selection editing
   */
  setupFloatingToolbar() {
    this.floatToolbar = document.getElementById('floatToolbar');
    if (!this.floatToolbar) return;

    // Input elements
    const rotateAngleInput = document.getElementById('ftRotateAngle');
    const scaleFactorInput = document.getElementById('ftScaleFactor');
    const moveXInput = document.getElementById('ftMoveX');
    const moveYInput = document.getElementById('ftMoveY');

    // Helper to get rotation angle from input
    const getRotateAngle = () => {
      const val = parseFloat(rotateAngleInput?.value) || 90;
      return Math.max(1, Math.min(360, val));
    };

    // Helper to get scale factor from input
    const getScaleFactor = () => {
      const val = parseFloat(scaleFactorInput?.value) || 1.5;
      return Math.max(0.1, Math.min(10, val));
    };

    // Rotate CCW (positive angle in math convention)
    document.getElementById('ftRotateCCW')?.addEventListener('click', () => {
      this.app.rotateSelected(getRotateAngle());
    });

    // Rotate CW (negative angle in math convention)
    document.getElementById('ftRotateCW')?.addEventListener('click', () => {
      this.app.rotateSelected(-getRotateAngle());
    });

    // Mirror X (horizontal)
    document.getElementById('ftMirrorX')?.addEventListener('click', () => {
      this.app.mirrorSelected('x');
    });

    // Mirror Y (vertical)
    document.getElementById('ftMirrorY')?.addEventListener('click', () => {
      this.app.mirrorSelected('y');
    });

    // Scale Up (multiply by factor)
    document.getElementById('ftScaleUp')?.addEventListener('click', () => {
      this.app.scaleSelected(getScaleFactor());
    });

    // Scale Down (divide by factor)
    document.getElementById('ftScaleDown')?.addEventListener('click', () => {
      const factor = getScaleFactor();
      this.app.scaleSelected(1 / factor);
    });

    // Move Apply - move selection by X,Y mm
    document.getElementById('ftMoveApply')?.addEventListener('click', () => {
      const dx = parseFloat(moveXInput?.value) || 0;
      const dy = parseFloat(moveYInput?.value) || 0;
      if (dx !== 0 || dy !== 0) {
        this.app.moveSelected(dx, dy);
        // Reset inputs after move
        if (moveXInput) moveXInput.value = '0';
        if (moveYInput) moveYInput.value = '0';
      }
    });

    // Allow Enter key to apply move
    [moveXInput, moveYInput].forEach(input => {
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('ftMoveApply')?.click();
        }
      });
    });

    // Copy
    document.getElementById('ftCopy')?.addEventListener('click', () => {
      this.app.copySelected();
    });

    // Delete
    document.getElementById('ftDelete')?.addEventListener('click', () => {
      this.app.deleteSelected();
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
    document.getElementById('btnSave')?.addEventListener('click', () => this.app.saveToFile());
    document.getElementById('btnLoad')?.addEventListener('click', () => this.app.loadFromFile());
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
   * Setup command line input with autocomplete
   */
  setupCommandInput() {
    const commandInput = document.getElementById('commandInput');
    this.autocompleteEl = document.getElementById('commandAutocomplete');

    if (!commandInput) return;

    // Input event for autocomplete filtering
    commandInput.addEventListener('input', (e) => {
      this.filterCommands(e.target.value);
    });

    // Focus shows all commands if empty
    commandInput.addEventListener('focus', () => {
      if (!commandInput.value.trim()) {
        this.showAllCommands();
      }
    });

    // Blur hides autocomplete (with delay for click)
    commandInput.addEventListener('blur', () => {
      setTimeout(() => this.hideAutocomplete(), 150);
    });

    // Keyboard navigation
    commandInput.addEventListener('keydown', (e) => {
      const isAutocompleteVisible = this.autocompleteEl?.classList.contains('active');

      if (e.key === 'Tab') {
        e.preventDefault();
        if (!isAutocompleteVisible) {
          this.showAllCommands();
        } else if (this.filteredCommands.length > 0) {
          // Select first or highlighted item
          const idx = this.selectedIndex >= 0 ? this.selectedIndex : 0;
          this.executeCommand(this.filteredCommands[idx]);
          commandInput.value = '';
          this.hideAutocomplete();
        }
        return;
      }

      if (e.key === 'ArrowDown' && isAutocompleteVisible) {
        e.preventDefault();
        this.selectNext();
        return;
      }

      if (e.key === 'ArrowUp' && isAutocompleteVisible) {
        e.preventDefault();
        this.selectPrevious();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (isAutocompleteVisible && this.selectedIndex >= 0) {
          this.executeCommand(this.filteredCommands[this.selectedIndex]);
          commandInput.value = '';
        } else {
          this.handleCommand(commandInput.value);
          commandInput.value = '';
        }
        this.hideAutocomplete();
        return;
      }

      if (e.key === 'Escape') {
        if (isAutocompleteVisible) {
          this.hideAutocomplete();
        } else {
          this.app.cancelCurrentOperation();
          commandInput.value = '';
        }
        return;
      }
    });
  }

  /**
   * Show all commands in autocomplete
   */
  showAllCommands() {
    this.filteredCommands = [...this.commands];
    this.selectedIndex = -1;
    this.renderAutocomplete();
  }

  /**
   * Filter commands based on input
   */
  filterCommands(query) {
    const q = query.trim().toUpperCase();

    if (!q) {
      this.hideAutocomplete();
      return;
    }

    // Filter commands that match name or any alias
    this.filteredCommands = this.commands.filter(cmd => {
      if (cmd.name.startsWith(q)) return true;
      if (cmd.aliases.some(a => a.toUpperCase().startsWith(q))) return true;
      if (cmd.desc.toUpperCase().includes(q)) return true;
      return false;
    });

    // Sort: exact matches first, then by name
    this.filteredCommands.sort((a, b) => {
      const aExact = a.name === q || a.aliases.some(al => al.toUpperCase() === q);
      const bExact = b.name === q || b.aliases.some(al => al.toUpperCase() === q);
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
      return a.name.localeCompare(b.name);
    });

    this.selectedIndex = this.filteredCommands.length > 0 ? 0 : -1;
    this.renderAutocomplete();
  }

  /**
   * Render autocomplete dropdown
   */
  renderAutocomplete() {
    if (!this.autocompleteEl) {
      return;
    }

    if (this.filteredCommands.length === 0) {
      this.hideAutocomplete();
      return;
    }

    // Group by category
    const byCategory = {};
    for (const cmd of this.filteredCommands) {
      if (!byCategory[cmd.category]) byCategory[cmd.category] = [];
      byCategory[cmd.category].push(cmd);
    }

    let html = '';
    const categoryOrder = ['Disegno', 'Modifica', 'File', 'Vista', 'Azioni', 'Output', 'Aiuto'];

    for (const category of categoryOrder) {
      const cmds = byCategory[category];
      if (!cmds || cmds.length === 0) continue;

      html += `<div class="cad-autocomplete-category">${category}</div>`;
      for (const cmd of cmds) {
        const idx = this.filteredCommands.indexOf(cmd);
        const selectedClass = idx === this.selectedIndex ? 'selected' : '';
        const shortcutHtml = cmd.shortcut ?
          `<div class="cad-autocomplete-shortcut"><kbd>${cmd.shortcut}</kbd></div>` : '';

        html += `
          <div class="cad-autocomplete-item ${selectedClass}" data-index="${idx}">
            <div class="cad-autocomplete-cmd">
              <span class="cad-autocomplete-cmd-name">${cmd.name}</span>
              <span class="cad-autocomplete-cmd-desc">${cmd.desc}</span>
            </div>
            ${shortcutHtml}
          </div>
        `;
      }
    }

    this.autocompleteEl.innerHTML = html;
    this.autocompleteEl.classList.add('active');

    // Add click handlers
    this.autocompleteEl.querySelectorAll('.cad-autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const idx = parseInt(item.dataset.index);
        this.executeCommand(this.filteredCommands[idx]);
        document.getElementById('commandInput').value = '';
        this.hideAutocomplete();
      });
    });
  }

  /**
   * Hide autocomplete dropdown
   */
  hideAutocomplete() {
    this.autocompleteEl?.classList.remove('active');
    this.selectedIndex = -1;
  }

  /**
   * Select next item in autocomplete
   */
  selectNext() {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
    this.updateSelection();
  }

  /**
   * Select previous item in autocomplete
   */
  selectPrevious() {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = this.selectedIndex <= 0 ?
      this.filteredCommands.length - 1 : this.selectedIndex - 1;
    this.updateSelection();
  }

  /**
   * Update visual selection in autocomplete
   */
  updateSelection() {
    if (!this.autocompleteEl) return;
    this.autocompleteEl.querySelectorAll('.cad-autocomplete-item').forEach((item, i) => {
      item.classList.toggle('selected', parseInt(item.dataset.index) === this.selectedIndex);
    });

    // Scroll into view
    const selected = this.autocompleteEl.querySelector('.cad-autocomplete-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Execute a command from autocomplete
   */
  executeCommand(cmd) {
    if (cmd && cmd.action) {
      cmd.action();
    }
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

    const q = input.trim().toUpperCase();

    // Find matching command
    const matchingCmd = this.commands.find(cmd => {
      if (cmd.name === q) return true;
      if (cmd.aliases.some(a => a.toUpperCase() === q)) return true;
      return false;
    });

    if (matchingCmd) {
      matchingCmd.action();
      return;
    }

    // Try to parse as coordinate input (e.g., "100,200" or "@50,30")
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
