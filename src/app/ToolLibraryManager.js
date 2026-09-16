/**
 * Tool library: the cutters saved in the database, chosen from the CAM panel.
 *
 * The window and the /api/tools endpoints already existed; this wires them together and hands
 * the chosen diameter to the operation that asked for it.
 */

const TYPE_LABELS = {
  pen: 'penna',
  endmill: 'fresa',
  ballnose: 'sferica',
  vbit: 'bulino',
  drill: 'punta'
};

export class ToolLibraryManager {
  constructor() {
    this.modal = document.getElementById('toolLibraryModal');
    this.list = document.getElementById('toolListContainer');
    this.nameInput = document.getElementById('toolName');
    this.typeInput = document.getElementById('toolType');
    this.diameterInput = document.getElementById('toolDiameter');
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
      const response = await fetch('/api/tools', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      // the endpoint answers with a bare array, unlike the rest of the API
      this.tools = Array.isArray(payload) ? payload : (payload?.data ?? []);
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
      detail.textContent = `${TYPE_LABELS[tool.type] ?? tool.type} · Ø${tool.diameter} mm`;
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
    this.deleteBtn.disabled = false;
    this.renderList();
  }

  startNew() {
    this.selectedId = null;
    this.nameInput.value = '';
    this.typeInput.value = 'endmill';
    this.diameterInput.value = '3';
    this.deleteBtn.disabled = true;
    this.renderList();
    this.nameInput.focus();
  }

  // The form as the API wants it, or null when it cannot make a tool
  readForm() {
    const name = this.nameInput.value.trim();
    const diameter = parseFloat(this.diameterInput.value);
    if (!name || !Number.isFinite(diameter) || diameter <= 0) return null;
    return { name, type: this.typeInput.value, diameter };
  }

  async saveTool() {
    const tool = this.readForm();
    if (!tool) {
      this.showListMessage('Servono un nome e un diametro maggiore di zero.');
      return;
    }

    const creating = this.selectedId === null;
    try {
      const response = await fetch(creating ? '/api/tools' : `/api/tools/${this.selectedId}`, {
        method: creating ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tool)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const saved = await response.json().catch(() => null);
      if (creating && saved?.id) this.selectedId = saved.id;
      await this.loadTools();
      if (this.selectedId !== null) this.select(this.selectedId);
    } catch (err) {
      this.showListMessage(`Errore salvataggio utensile: ${err.message}`);
    }
  }

  async deleteTool() {
    if (this.selectedId === null) return;
    try {
      const response = await fetch(`/api/tools/${this.selectedId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.selectedId = null;
      this.startNew();
      await this.loadTools();
    } catch (err) {
      this.showListMessage(`Errore eliminazione utensile: ${err.message}`);
    }
  }

  // Hand the diameter to the operation whose button opened the window
  useTool() {
    const tool = this.readForm();
    if (!tool) {
      this.showListMessage('Scegli un utensile dalla lista.');
      return;
    }

    const operation = window.cadApp?.plcOutputManager?.operation;
    if (!operation) {
      this.showListMessage('Pannello CAM non pronto.');
      return;
    }
    operation.change({ [this.target]: tool.diameter });
    this.close();
  }

  showListMessage(text) {
    const message = document.createElement('div');
    message.className = 'tool-lib-empty';
    message.textContent = text;
    this.list.prepend(message);
  }
}
