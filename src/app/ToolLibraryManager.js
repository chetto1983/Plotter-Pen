/**
 * Tool library: the cutters saved in the database, chosen from the CAM panel.
 *
 * The window and the /api/tools endpoints already existed; this wires them together. The
 * operation that opened the window is given the tool itself — its id, its kind and its diameter —
 * and reads the speeds from it each time it generates, so changing a tool here changes the
 * programs that use it.
 */
import { loadTools } from './toolCatalog.js';
import { responseError } from '../services/serverError.js';

const TYPE_LABELS = {
  pen: 'penna',
  endmill: 'fresa',
  ballnose: 'sferica',
  vbit: 'bulino',
  drill: 'punta'
};

// The operation fields each diameter button fills
const TARGET_FIELDS = {
  toolDiameter: { kind: 'toolType', id: 'toolId' },
  drillDiameter: { kind: 'drillType', id: 'drillId' }
};

export class ToolLibraryManager {
  constructor() {
    this.modal = document.getElementById('toolLibraryModal');
    this.list = document.getElementById('toolListContainer');
    this.nameInput = document.getElementById('toolName');
    this.typeInput = document.getElementById('toolType');
    this.diameterInput = document.getElementById('toolDiameter');
    this.feedInput = document.getElementById('toolFeed');
    this.plungeInput = document.getElementById('toolPlunge');
    this.stepDownInput = document.getElementById('toolStepDown');
    this.closeBtn = document.getElementById('btnCloseToolLibrary');
    this.newBtn = document.getElementById('btnNewTool');
    this.saveBtn = document.getElementById('btnSaveTool');
    this.deleteBtn = document.getElementById('btnDeleteTool');
    this.useBtn = document.getElementById('btnSelectToolFromLib');

    this.tools = [];
    this.selectedId = null;
    // which operation parameter the window was opened for: toolDiameter or drillDiameter
    this.target = 'toolDiameter';

    this.init();
  }

  init() {
    if (!this.modal) return;

    for (const button of document.querySelectorAll('.cam-op-tools')) {
      button.addEventListener('click', () => this.open(button.dataset.diameter));
    }
    this.closeBtn?.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.close();
    });
    this.newBtn?.addEventListener('click', () => this.startNew());
    this.saveBtn?.addEventListener('click', () => this.saveTool());
    this.deleteBtn?.addEventListener('click', () => this.deleteTool());
    this.useBtn?.addEventListener('click', () => this.useTool());
  }

  open(target = 'toolDiameter') {
    this.target = target;
    this.modal.classList.add('open');
    this.loadTools();
  }

  close() {
    this.modal.classList.remove('open');
  }

  async loadTools() {
    this.list.innerHTML = '<div class="tool-lib-empty">Caricamento...</div>';
    try {
      this.tools = await loadTools();
      this.renderList();
    } catch (err) {
      this.list.innerHTML = `<div class="tool-lib-empty">Errore caricamento utensili: ${err.message}</div>`;
    }
  }

  renderList() {
    if (this.tools.length === 0) {
      this.list.innerHTML = '<div class="tool-lib-empty">Nessun utensile: premi Nuovo.</div>';
      return;
    }

    this.list.innerHTML = '';
    for (const tool of this.tools) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tool-lib-item';
      row.dataset.id = String(tool.id);
      if (tool.id === this.selectedId) row.classList.add('active');
      row.textContent = tool.name;
      const detail = document.createElement('span');
      detail.className = 'tool-lib-item-detail';
      const feed = tool.feed > 0 ? ` · ${tool.feed} mm/s` : '';
      detail.textContent = `${TYPE_LABELS[tool.type] ?? tool.type} · Ø${tool.diameter} mm${feed}`;
      row.appendChild(detail);
      row.addEventListener('click', () => this.select(tool.id));
      this.list.appendChild(row);
    }
  }

  select(id) {
    const tool = this.tools.find((t) => t.id === id);
    if (!tool) return;
    this.selectedId = id;
    this.nameInput.value = tool.name;
    this.typeInput.value = tool.type;
    this.diameterInput.value = tool.diameter;
    // 0 is no speed of its own: the empty field shows "globale"
    this.feedInput.value = tool.feed > 0 ? tool.feed : '';
    this.plungeInput.value = tool.plunge > 0 ? tool.plunge : '';
    this.stepDownInput.value = tool.stepDown > 0 ? tool.stepDown : '';
    this.deleteBtn.disabled = false;
    this.renderList();
  }

  startNew() {
    this.selectedId = null;
    this.nameInput.value = '';
    this.typeInput.value = 'endmill';
    this.diameterInput.value = '3';
    this.feedInput.value = '';
    this.plungeInput.value = '';
    this.stepDownInput.value = '';
    this.deleteBtn.disabled = true;
    this.renderList();
    this.nameInput.focus();
  }

  // The form as the API wants it, or null when it cannot make a tool. An empty speed is 0, the
  // global one; a negative one is refused.
  readForm() {
    const name = this.nameInput.value.trim();
    const diameter = parseFloat(this.diameterInput.value);
    if (!name || !Number.isFinite(diameter) || diameter <= 0) return null;
    const speed = (input) => {
      const value = input.value.trim() === '' ? 0 : parseFloat(input.value);
      return Number.isFinite(value) && value >= 0 ? value : null;
    };
    const feed = speed(this.feedInput);
    const plunge = speed(this.plungeInput);
    const stepDown = speed(this.stepDownInput);
    if (feed === null || plunge === null || stepDown === null) return null;
    return { name, type: this.typeInput.value, diameter, feed, plunge, stepDown };
  }

  async saveTool() {
    const tool = this.readForm();
    if (!tool) {
      this.showListMessage('Servono un nome, un diametro maggiore di zero e velocità non negative.');
      return;
    }

    const creating = this.selectedId === null;
    try {
      const response = await fetch(creating ? '/api/tools' : `/api/tools/${this.selectedId}`, {
        method: creating ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tool)
      });
      if (!response.ok) throw await responseError(response);
      const saved = await response.json().catch(() => null);
      if (creating && saved?.id) this.selectedId = saved.id;
      await this.loadTools();
      if (this.selectedId !== null) this.select(this.selectedId);
      this.refreshProgram();
    } catch (err) {
      this.showListMessage(`Errore salvataggio utensile: ${err.message}`);
    }
  }

  async deleteTool() {
    if (this.selectedId === null) return;
    try {
      const response = await fetch(`/api/tools/${this.selectedId}`, { method: 'DELETE' });
      if (!response.ok) throw await responseError(response);
      this.selectedId = null;
      this.startNew();
      await this.loadTools();
      // an operation that used it falls back on the global speeds
      this.refreshProgram();
    } catch (err) {
      this.showListMessage(`Errore eliminazione utensile: ${err.message}`);
    }
  }

  // Give the saved tool to the operation whose button opened the window
  useTool() {
    const tool = this.tools.find((t) => t.id === this.selectedId);
    if (!tool) {
      this.showListMessage('Scegli un utensile dalla lista: uno nuovo va salvato prima.');
      return;
    }

    const operation = window.cadApp?.plcOutputManager?.operation;
    if (!operation) {
      this.showListMessage('Pannello CAM non pronto.');
      return;
    }
    // the kind is for the 3D view, the id for the speeds read at every generation
    const fields = TARGET_FIELDS[this.target] ?? TARGET_FIELDS.toolDiameter;
    operation.change({ [this.target]: tool.diameter, [fields.kind]: tool.type, [fields.id]: tool.id });
    this.close();
  }

  // The operations read the speeds of their tool when they generate: a tool changed or deleted
  // here must reach the program on screen
  refreshProgram() {
    window.cadApp?.plcOutputManager?.refreshPLCOutput();
  }

  showListMessage(text) {
    const message = document.createElement('div');
    message.className = 'tool-lib-empty';
    message.textContent = text;
    this.list.prepend(message);
  }
}
