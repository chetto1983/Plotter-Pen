/**
 * Command Definitions for UI Autocomplete
 * Returns command array bound to the provided app instance
 */

export function createCommandDefinitions(app, ui) {
    return [
        // Drawing Tools
        { name: 'LINE', aliases: ['L'], desc: 'Disegna una linea', shortcut: 'L', category: 'Disegno', action: () => app.selectTool('line') },
        { name: 'ARC', aliases: ['A'], desc: 'Disegna un arco', shortcut: 'A', category: 'Disegno', action: () => app.selectTool('arc') },
        { name: 'CIRCLE', aliases: ['C', 'CERCHIO'], desc: 'Disegna un cerchio', shortcut: 'C', category: 'Disegno', action: () => app.selectTool('circle') },
        { name: 'RECTANGLE', aliases: ['RECT', 'R', 'RETTANGOLO'], desc: 'Disegna un rettangolo', shortcut: 'R', category: 'Disegno', action: () => app.selectTool('rectangle') },
        { name: 'POLYGON', aliases: ['P', 'POLY', 'POLIGONO'], desc: 'Disegna un poligono', shortcut: 'P', category: 'Disegno', action: () => app.selectTool('polygon') },

        // Edit Tools
        { name: 'SELECT', aliases: ['S', 'SEL', 'SELEZIONA'], desc: 'Modalità selezione', shortcut: 'S', category: 'Modifica', action: () => app.selectTool('select') },
        { name: 'DELETE', aliases: ['DEL', 'ERASE', 'ELIMINA'], desc: 'Elimina selezione', shortcut: 'DEL', category: 'Modifica', action: () => app.selectionManager.deleteSelected() },
        { name: 'MOVE', aliases: ['M', 'SPOSTA'], desc: 'Sposta selezione (usa frecce o trascina)', shortcut: 'Frecce', category: 'Modifica', action: () => { app.selectTool('select'); ui.updateStatus('Usa frecce per spostare o trascina con mouse'); } },
        { name: 'COPYSEL', aliases: ['COPIASEL'], desc: 'Copia selezione', shortcut: 'Ctrl+C', category: 'Modifica', action: () => app.selectionManager.copySelected() },
        { name: 'PASTE', aliases: ['INCOLLA'], desc: 'Incolla dagli appunti', shortcut: 'Ctrl+V', category: 'Modifica', action: () => app.selectionManager.pasteClipboard() },
        { name: 'CUT', aliases: ['TAGLIA'], desc: 'Taglia selezione', shortcut: 'Ctrl+X', category: 'Modifica', action: () => app.selectionManager.cutSelected() },
        { name: 'ROTATE', aliases: ['ROT', 'RUOTA'], desc: 'Ruota selezione 90°', shortcut: '', category: 'Modifica', action: () => app.selectionManager.rotateSelected(90) },
        { name: 'ROTATE45', aliases: ['ROT45'], desc: 'Ruota selezione 45°', shortcut: '', category: 'Modifica', action: () => app.selectionManager.rotateSelected(45) },
        { name: 'SCALE', aliases: ['SCALA'], desc: 'Scala selezione (1.5x)', shortcut: '', category: 'Modifica', action: () => app.selectionManager.scaleSelected(1.5) },
        { name: 'SCALEDOWN', aliases: ['SCALAGIU'], desc: 'Scala selezione (0.5x)', shortcut: '', category: 'Modifica', action: () => app.selectionManager.scaleSelected(0.5) },
        { name: 'MIRRORX', aliases: ['SPECCHIOX'], desc: 'Specchia orizzontalmente', shortcut: '', category: 'Modifica', action: () => app.selectionManager.mirrorSelected('x') },
        { name: 'MIRRORY', aliases: ['SPECCHIOY'], desc: 'Specchia verticalmente', shortcut: '', category: 'Modifica', action: () => app.selectionManager.mirrorSelected('y') },

        // File Operations
        { name: 'SAVE', aliases: ['SALVA'], desc: 'Salva disegno', shortcut: 'Ctrl+S', category: 'File', action: () => app.fileManager.saveToFile() },
        { name: 'OPEN', aliases: ['LOAD', 'APRI', 'CARICA'], desc: 'Apri disegno', shortcut: 'Ctrl+O', category: 'File', action: () => app.fileManager.loadFromFile() },
        { name: 'NEW', aliases: ['CLEAR', 'NUOVO', 'PULISCI'], desc: 'Nuovo disegno (pulisci tutto)', shortcut: '', category: 'File', action: () => app.selectionManager.clearAll() },
        { name: 'EXPORTDXF', aliases: ['ESPORTADXF', 'DXF'], desc: 'Esporta DXF', shortcut: 'Ctrl+Shift+E', category: 'File', action: () => app.fileManager.exportDXF() },

        // View
        { name: 'ZOOM', aliases: ['Z'], desc: 'Zoom (+ o - per in/out)', shortcut: '+/-', category: 'Vista', action: () => ui.updateStatus('Usa + per zoom in, - per zoom out') },
        { name: 'ZOOMIN', aliases: ['ZI'], desc: 'Zoom avanti', shortcut: '+', category: 'Vista', action: () => app.viewManager.zoomIn() },
        { name: 'ZOOMOUT', aliases: ['ZO'], desc: 'Zoom indietro', shortcut: '-', category: 'Vista', action: () => app.viewManager.zoomOut() },
        { name: 'FIT', aliases: ['ZOOMFIT', 'ZF', 'ADATTA'], desc: 'Adatta vista', shortcut: 'F', category: 'Vista', action: () => app.viewManager.zoomFit() },
        { name: 'GRID', aliases: ['G', 'GRIGLIA'], desc: 'Attiva/disattiva griglia', shortcut: 'G', category: 'Vista', action: () => app.viewManager.toggleGrid() },

        // Actions
        { name: 'UNDO', aliases: ['U', 'ANNULLA'], desc: 'Annulla ultima azione', shortcut: 'Ctrl+Z', category: 'Azioni', action: () => app.state.undo() },
        { name: 'REDO', aliases: ['RIPETI'], desc: 'Ripeti azione annullata', shortcut: 'Ctrl+Y', category: 'Azioni', action: () => app.state.redo() },
        { name: 'ESCAPE', aliases: ['ESC', 'CANCEL', 'ANNULLA'], desc: 'Annulla operazione corrente', shortcut: 'ESC', category: 'Azioni', action: () => app.cancelCurrentOperation() },

        // Output
        { name: 'EXTRACT', aliases: ['PLC', 'OUTPUT'], desc: 'Estrai comandi PLC', shortcut: '', category: 'Output', action: () => app.plcOutputManager.extractPLC() },
        { name: 'SIMULATE', aliases: ['SIM', 'SIMULA'], desc: 'Simula percorso utensile', shortcut: '', category: 'Output', action: () => app.plcOutputManager.simulatePath() },
        { name: 'COPY', aliases: ['COPIA'], desc: 'Copia output negli appunti', shortcut: '', category: 'Output', action: () => app.plcOutputManager.copyOutput() },
        { name: 'DOWNLOAD', aliases: ['SCARICA'], desc: 'Scarica output come file', shortcut: '', category: 'Output', action: () => app.plcOutputManager.downloadOutput() },
        { name: 'SEND', aliases: ['INVIA'], desc: 'Invia a PLC via OPC UA', shortcut: '', category: 'Output', action: () => app.plcOutputManager.sendToPLC() },

        // Help
        { name: 'HELP', aliases: ['?', 'AIUTO', 'H'], desc: 'Mostra scorciatoie', shortcut: 'F1', category: 'Aiuto', action: () => document.getElementById('shortcutsModal')?.removeAttribute('hidden') },
    ];
}

/**
 * Command Autocomplete Manager
 */
export class CommandAutocomplete {
    constructor(commands, onUpdateStatus) {
        this.commands = commands;
        this.onUpdateStatus = onUpdateStatus;
        this.autocompleteEl = null;
        this.selectedIndex = -1;
        this.filteredCommands = [];
    }

    setup(commandInputEl, autocompleteEl, onCancel) {
        this.autocompleteEl = autocompleteEl;
        if (!commandInputEl) return;

        commandInputEl.addEventListener('input', (e) => this.filterCommands(e.target.value));
        commandInputEl.addEventListener('focus', () => {
            if (!commandInputEl.value.trim()) this.showAllCommands();
        });
        commandInputEl.addEventListener('blur', () => setTimeout(() => this.hide(), 150));
        commandInputEl.addEventListener('keydown', (e) => this.handleKeydown(e, commandInputEl, onCancel));
    }

    handleKeydown(e, inputEl, onCancel) {
        const isVisible = this.autocompleteEl?.classList.contains('active');

        if (e.key === 'Tab') {
            e.preventDefault();
            if (!isVisible) {
                this.showAllCommands();
            } else if (this.filteredCommands.length > 0) {
                const idx = this.selectedIndex >= 0 ? this.selectedIndex : 0;
                this.executeCommand(this.filteredCommands[idx]);
                inputEl.value = '';
                this.hide();
            }
            return;
        }

        if (e.key === 'ArrowDown' && isVisible) {
            e.preventDefault();
            this.selectNext();
            return;
        }

        if (e.key === 'ArrowUp' && isVisible) {
            e.preventDefault();
            this.selectPrevious();
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (isVisible && this.selectedIndex >= 0) {
                this.executeCommand(this.filteredCommands[this.selectedIndex]);
                inputEl.value = '';
            } else if (inputEl.value.trim()) {
                this.handleTextCommand(inputEl.value);
                inputEl.value = '';
            }
            this.hide();
            return;
        }

        if (e.key === 'Escape') {
            if (isVisible) {
                this.hide();
            } else {
                onCancel?.();
                inputEl.value = '';
            }
        }
    }

    handleTextCommand(input) {
        const upper = input.trim().toUpperCase();
        const cmd = this.commands.find(c =>
            c.name === upper || c.aliases.some(a => a.toUpperCase() === upper)
        );
        if (cmd) cmd.action();
    }

    showAllCommands() {
        this.filteredCommands = [...this.commands];
        this.selectedIndex = -1;
        this.render();
    }

    filterCommands(query) {
        const q = query.trim().toUpperCase();
        if (!q) {
            this.hide();
            return;
        }

        this.filteredCommands = this.commands.filter(cmd =>
            cmd.name.startsWith(q) ||
            cmd.aliases.some(a => a.toUpperCase().startsWith(q)) ||
            cmd.desc.toUpperCase().includes(q)
        );

        this.filteredCommands.sort((a, b) => {
            const aExact = a.name === q || a.aliases.some(al => al.toUpperCase() === q);
            const bExact = b.name === q || b.aliases.some(al => al.toUpperCase() === q);
            if (aExact && !bExact) return -1;
            if (bExact && !aExact) return 1;
            return a.name.localeCompare(b.name);
        });

        this.selectedIndex = this.filteredCommands.length > 0 ? 0 : -1;
        this.render();
    }

    render() {
        if (!this.autocompleteEl || this.filteredCommands.length === 0) {
            this.hide();
            return;
        }

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

        this.autocompleteEl.querySelectorAll('.cad-autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const idx = parseInt(item.dataset.index);
                this.executeCommand(this.filteredCommands[idx]);
                document.getElementById('commandInput').value = '';
                this.hide();
            });
        });
    }

    hide() {
        this.autocompleteEl?.classList.remove('active');
        this.selectedIndex = -1;
    }

    selectNext() {
        if (this.filteredCommands.length === 0) return;
        this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
        this.updateSelection();
    }

    selectPrevious() {
        if (this.filteredCommands.length === 0) return;
        this.selectedIndex = this.selectedIndex <= 0 ?
            this.filteredCommands.length - 1 : this.selectedIndex - 1;
        this.updateSelection();
    }

    updateSelection() {
        if (!this.autocompleteEl) return;
        this.autocompleteEl.querySelectorAll('.cad-autocomplete-item').forEach(item => {
            item.classList.toggle('selected', parseInt(item.dataset.index) === this.selectedIndex);
        });
        const selected = this.autocompleteEl.querySelector('.cad-autocomplete-item.selected');
        selected?.scrollIntoView({ block: 'nearest' });
    }

    executeCommand(cmd) {
        if (cmd?.action) cmd.action();
    }
}

export default CommandAutocomplete;
