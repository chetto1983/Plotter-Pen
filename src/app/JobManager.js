/**
 * The job: the steps a piece is cut in, one after the other, each an operation with its tool and
 * parameters on a layer of the drawing, kept in the database (/api/cam/job). There is one job, for
 * the drawing on screen. The PLC output panel is the job: the list of the steps sits at its top,
 * and the tabs and parameters below edit the active step.
 */

// Remembered in the browser, like camParamsCollapsed
const ACTIVE_STEP_KEY = 'camActiveStep';

const WHOLE_DRAWING = 'Tutto il disegno';

const mm = (value) => String(value).replace('.', ',');

export class JobManager {
  /**
   * @param {object} app
   * @param {object} options
   * @param {object} options.defaults the parameters of a step the server has not given
   * @param {object} options.labels the name of each operation
   * @param {() => void} options.onChange called when another step becomes the active one, or the
   *   list changes: the panel shows it and its program
   */
  constructor(app, { defaults, labels, onChange }) {
    this.app = app;
    this.defaults = defaults;
    this.labels = labels;
    this.onChange = onChange;
    // Until the job arrives the panel edits a step of defaults, which is never saved: written over
    // a job that could not be read, it would take its place
    this.steps = [{ layer: '', ...defaults }];
    this.active = 0;
    this.loaded = false;
    // While the job runs (JobRunner) the list is not changed and only the run moves the active step
    this.locked = false;
    this._saveTimeout = null;
    this._saving = Promise.resolve();
  }

  /** The step the panel edits */
  get step() {
    return this.steps[this.active];
  }

  init() {
    const menu = document.getElementById('camJobMenu');
    const addButton = document.getElementById('camJobAdd');
    const showMenu = (open) => {
      if (!menu || !addButton) return;
      menu.hidden = !open;
      addButton.setAttribute('aria-expanded', String(open));
    };
    addButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      showMenu(menu.hidden);
    });
    menu?.querySelectorAll('[data-operation]').forEach((item) => {
      item.addEventListener('click', () => {
        showMenu(false);
        this.add(item.dataset.operation);
      });
    });
    document.addEventListener('click', (event) => {
      if (menu && !menu.hidden && !menu.contains(event.target)) showMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') showMenu(false);
    });

    document.getElementById('camJobDuplicate')?.addEventListener('click', () => this.duplicate());
    document.getElementById('camJobUp')?.addEventListener('click', () => this.move(-1));
    document.getElementById('camJobDown')?.addEventListener('click', () => this.move(1));
    document.getElementById('camJobRemove')?.addEventListener('click', () => this.remove());
    document.getElementById('camJobSteps')?.addEventListener('click', (event) => {
      const row = event.target.closest('.cam-job-step');
      if (row) this.select(Number(row.dataset.index));
    });
  }

  /**
   * Read the job. A database from before the job has none: its first step is the operation the
   * panel used to show, saved at once. A job that cannot be read is left alone — saving the
   * defaults over it would lose it.
   */
  async load() {
    let steps;
    try {
      const response = await fetch('/api/cam/job');
      if (!response.ok) return;
      steps = (await response.json())?.data?.steps;
    } catch {
      return;
    }
    if (!Array.isArray(steps)) return;

    const seeded = steps.length === 0;
    if (seeded) steps = [await this.savedOperation()];
    this.steps = steps.map((step) => this.normalize(step));
    this.loaded = true;
    const remembered = parseInt(localStorage.getItem(ACTIVE_STEP_KEY), 10);
    this.active = Number.isInteger(remembered) ? Math.min(Math.max(remembered, 0), this.steps.length - 1) : 0;
    if (seeded) this.save();
  }

  // The operation of the panel before the job existed, or the defaults
  async savedOperation() {
    try {
      const response = await fetch('/api/cam/operation');
      if (!response.ok) return {};
      return (await response.json())?.data ?? {};
    } catch {
      return {};
    }
  }

  // Only the fields of a step, each from the server or the default
  normalize(step) {
    const normalized = { layer: typeof step.layer === 'string' ? step.layer : '' };
    for (const [key, value] of Object.entries(this.defaults)) {
      normalized[key] = step[key] ?? value;
    }
    return normalized;
  }

  /**
   * Change the parameters of the active step and save the job; the caller shows them
   */
  update(values) {
    Object.assign(this.step, values);
    this.scheduleSave();
  }

  select(index) {
    if (this.locked) return;
    this.activate(index);
  }

  /**
   * Make a step the active one, which the panel shows with its program; the run uses it while the
   * list is locked
   */
  activate(index) {
    if (!Number.isInteger(index) || index === this.active || !this.steps[index]) return;
    this.active = index;
    this.changed(false);
  }

  /**
   * A new step of the given operation, with the parameters of the active one — the same piece —
   * on the whole drawing. A drilling goes before the first profile: the holes are made while the
   * piece is still held by the stock around it.
   */
  add(operation) {
    if (this.locked || !this.labels[operation]) return;
    const firstProfile = this.steps.findIndex((step) => step.operation === 'profile');
    const index = operation === 'drill' && firstProfile >= 0 ? firstProfile : this.steps.length;
    this.steps.splice(index, 0, { ...this.step, operation, layer: '' });
    this.active = index;
    this.changed(true);
  }

  duplicate() {
    if (this.locked) return;
    this.steps.splice(this.active + 1, 0, { ...this.step });
    this.active += 1;
    this.changed(true);
  }

  // The job keeps a step: the panel always edits one
  remove() {
    if (this.locked || this.steps.length <= 1) return;
    this.steps.splice(this.active, 1);
    this.active = Math.min(this.active, this.steps.length - 1);
    this.changed(true);
  }

  move(delta) {
    const to = this.active + delta;
    if (this.locked || to < 0 || to >= this.steps.length) return;
    [this.steps[this.active], this.steps[to]] = [this.steps[to], this.steps[this.active]];
    this.active = to;
    this.changed(true);
  }

  changed(listChanged) {
    localStorage.setItem(ACTIVE_STEP_KEY, String(this.active));
    if (listChanged) this.scheduleSave();
    this.onChange();
  }

  scheduleSave() {
    if (!this.loaded) return;
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.save(), 300);
  }

  /**
   * Send the whole job. Saves are chained, and each sends the steps as they are when it starts,
   * so the last one to arrive carries the last change.
   */
  save() {
    this._saving = this._saving.then(() => this.post());
    return this._saving;
  }

  async post() {
    try {
      const response = await fetch('/api/cam/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: this.steps })
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `HTTP ${response.status}`);
      }
    } catch (err) {
      this.app.ui.updateStatus(`Errore salvataggio lavoro: ${err.message}`);
    }
  }

  /**
   * The name of a layer as the layer panel shows it; a layer the drawing lacks keeps its id
   */
  layerName(id) {
    if (!id) return WHOLE_DRAWING;
    const layer = this.app.layerManager?.layers.get(id);
    return layer ? layer.name : `${id} (assente)`;
  }

  render() {
    this.renderSteps();
    this.renderLayerChoice();
    const buttons = {
      camJobAdd: this.locked,
      camJobDuplicate: this.locked,
      camJobRun: this.locked,
      camJobRemove: this.locked || this.steps.length <= 1,
      camJobUp: this.locked || this.active === 0,
      camJobDown: this.locked || this.active === this.steps.length - 1
    };
    for (const [id, disabled] of Object.entries(buttons)) {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled;
    }
  }

  renderSteps() {
    const list = document.getElementById('camJobSteps');
    if (!list) return;
    // Built with textContent: the names of the layers come from the drawing
    const rows = this.steps.map((step, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cam-job-step';
      row.dataset.index = String(index);
      row.disabled = this.locked;
      row.classList.toggle('active', index === this.active);
      row.setAttribute('aria-current', String(index === this.active));
      const diameter = { profile: step.toolDiameter, drill: step.drillDiameter }[step.operation];
      const cells = [
        ['cam-job-num', String(index + 1)],
        ['cam-job-op', this.labels[step.operation] ?? step.operation],
        ['cam-job-layer', this.layerName(step.layer)],
        ['cam-job-tool', diameter == null ? '' : `Ø${mm(diameter)}`]
      ];
      for (const [className, text] of cells) {
        const cell = document.createElement('span');
        cell.className = className;
        cell.textContent = text;
        row.appendChild(cell);
      }
      if (step.layer && !this.app.layerManager?.layers.has(step.layer)) row.classList.add('missing');
      const item = document.createElement('li');
      item.appendChild(row);
      return item;
    });
    list.replaceChildren(...rows);
  }

  renderLayerChoice() {
    const select = document.getElementById('camStepLayer');
    if (!select) return;
    const layers = this.app.layerManager?.getAllLayers() ?? [];
    const choices = [['', WHOLE_DRAWING], ...layers.map((layer) => [layer.id, layer.name])];
    // A layer the drawing lacks stays the choice of its step, shown as missing
    const current = this.step.layer;
    if (current && !layers.some((layer) => layer.id === current)) choices.push([current, this.layerName(current)]);
    select.replaceChildren(...choices.map(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      return option;
    }));
    select.value = current;
    select.disabled = this.locked;
  }
}

export default JobManager;
