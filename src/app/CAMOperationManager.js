/**
 * CAM Operation Manager
 * The operation whose program the PLC output shows (pen plot, profile or drilling), the piece the
 * profile and the drilling cut and their parameters. They are those of the active step of the job
 * (JobManager), which keeps them in the database (/api/cam/job).
 */
import { JobManager } from './JobManager.js';
import { loadTools, speedsFor } from './toolCatalog.js';

// Same defaults as the CAMParams columns
const OPERATION_DEFAULTS = {
  operation: 'pen',
  thickness: 1.6,
  overcut: 0.2,
  toolDiameter: 2,
  toolType: 'endmill',
  toolId: 0,
  side: 'outside',
  direction: 'conventional',
  profileThrough: true,
  profileDepth: 1,
  drillDiameter: 1,
  drillType: 'drill',
  drillId: 0,
  minHoleDiameter: 0.4,
  maxHoleDiameter: 1.2,
  peckDepth: 0,
  tipAngle: 118,
  tipThrough: false,
  drillThrough: true,
  drillDepth: 1
};

const NUMBER_INPUTS = {
  thickness: 'camThickness',
  overcut: 'camOvercut',
  toolDiameter: 'camToolDiameter',
  drillDiameter: 'camDrillDiameter',
  minHoleDiameter: 'camMinHoleDiameter',
  maxHoleDiameter: 'camMaxHoleDiameter',
  peckDepth: 'camPeckDepth',
  tipAngle: 'camTipAngle'
};

const LABELS = { pen: 'Penna', profile: 'Profilo', drill: 'Foratura' };

// Remembered in the browser, like plcPanelCollapsed
const PARAMS_COLLAPSED_KEY = 'camParamsCollapsed';

export class CAMOperationManager {
  constructor(app) {
    this.app = app;
    this.job = new JobManager(app, {
      defaults: OPERATION_DEFAULTS,
      labels: LABELS,
      onChange: () => {
        this.render();
        this.app.plcOutputManager.refreshPLCOutput();
      }
    });
    this.paramsCollapsed = localStorage.getItem(PARAMS_COLLAPSED_KEY) === 'true';
  }

  /**
   * The parameters the panel shows and edits: those of the active step, its layer included
   */
  get operation() {
    return this.job.step;
  }

  /**
   * Wire the job, the operation tabs and the parameter inputs, then load the saved job
   */
  async init() {
    this.job.init();
    document.getElementById('camStepLayer')?.addEventListener('change', (e) => this.change({ layer: e.target.value }));
    // the choice of layer and the rows of the steps name the layers
    document.addEventListener('layersChanged', () => this.job.render());
    document.querySelectorAll('.cam-op-tab').forEach((tab) => {
      tab.addEventListener('click', () => this.change({ operation: tab.dataset.operation }));
    });
    const numberInput = (id, key) => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value);
        // an emptied field keeps its value instead of sending NaN
        if (Number.isFinite(value)) this.change({ [key()]: value });
        else this.render();
      });
    };
    for (const [key, id] of Object.entries(NUMBER_INPUTS)) {
      numberInput(id, () => key);
    }
    numberInput('camDepth', () => this.cutKeys().depth);
    document.getElementById('camThrough')?.addEventListener('change', (e) => this.change({ [this.cutKeys().through]: e.target.checked }));
    document.getElementById('camSide')?.addEventListener('change', (e) => this.change({ side: e.target.value }));
    document.getElementById('camDirection')?.addEventListener('change', (e) => this.change({ direction: e.target.value }));
    document.getElementById('camTipThrough')?.addEventListener('change', (e) => this.change({ tipThrough: e.target.checked }));
    document.getElementById('camParamsToggle')?.addEventListener('click', () => this.setParamsCollapsed(!this.paramsCollapsed));
    document.getElementById('camParamsSummary')?.addEventListener('click', () => this.setParamsCollapsed(false));

    this.render();
    // without the catalog the first program would be cut at the global speeds
    await loadTools().catch(() => []);
    await this.load();
  }

  /**
   * Hide or show the parameters of the profile and of the drilling. A summary line stays in their
   * place, and the command list below gets the height back
   */
  setParamsCollapsed(collapsed) {
    this.paramsCollapsed = collapsed;
    localStorage.setItem(PARAMS_COLLAPSED_KEY, collapsed);
    this.render();
  }

  async load() {
    await this.job.load();
    this.render();
    // The saved drawing may have been restored and extracted before the job arrived
    if (this.app.primitives.length > 0) {
      this.app.plcOutputManager.extractPLC();
    }
  }

  /**
   * Apply a change from the panel to the active step: show it, regenerate the output, save the job
   */
  change(values) {
    this.job.update(values);
    this.render();
    this.app.plcOutputManager.refreshPLCOutput();
  }

  render() {
    this.job.render();
    const op = this.operation;
    document.querySelectorAll('.cam-op-tab').forEach((tab) => {
      const active = tab.dataset.operation === op.operation;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-checked', String(active));
    });
    // The pen has no parameters to collapse
    const collapsed = op.operation !== 'pen' && this.paramsCollapsed;
    document.querySelectorAll('.cam-op-params').forEach((params) => {
      params.hidden = collapsed || !params.dataset.operation.split(' ').includes(op.operation);
    });
    for (const [key, id] of Object.entries(NUMBER_INPUTS)) {
      const input = document.getElementById(id);
      if (input) input.value = op[key];
    }
    // A through cut goes the overcut into the bed, any other cut its depth below the top of the piece
    const cut = this.cutKeys();
    const through = document.getElementById('camThrough');
    if (through) through.checked = op[cut.through];
    const depth = document.getElementById('camDepth');
    if (depth) depth.value = op[cut.depth];
    const overcutField = document.getElementById('camOvercutField');
    if (overcutField) overcutField.hidden = !op[cut.through];
    const depthField = document.getElementById('camDepthField');
    if (depthField) depthField.hidden = op[cut.through];
    const side = document.getElementById('camSide');
    if (side) side.value = op.side;
    const direction = document.getElementById('camDirection');
    if (direction) direction.value = op.direction;
    const tipThrough = document.getElementById('camTipThrough');
    if (tipThrough) tipThrough.checked = op.tipThrough;

    const toggle = document.getElementById('camParamsToggle');
    if (toggle) {
      toggle.hidden = op.operation === 'pen';
      toggle.setAttribute('aria-expanded', String(!collapsed));
    }
    const summary = document.getElementById('camParamsSummary');
    if (summary) {
      summary.hidden = !collapsed;
      summary.textContent = collapsed ? this.summary() : '';
    }
  }

  get label() {
    return LABELS[this.operation.operation] || LABELS.pen;
  }

  /**
   * The parameters of the active operation on one line, as the collapsed panel shows them, e.g.
   * "Ø2 · Esterno · Discorde · 1,6 mm passante"
   */
  summary() {
    const op = this.operation;
    const mm = (value) => String(value).replace('.', ',');
    const cut = this.cutKeys();
    const piece = `${mm(op.thickness)} mm ${op[cut.through] ? 'passante' : `prof. ${mm(op[cut.depth])}`}`;
    if (op.operation === 'drill') {
      return `Ø${mm(op.drillDiameter)} · fori ${mm(op.minHoleDiameter)}–${mm(op.maxHoleDiameter)} · ${piece}`;
    }
    // the side and the direction as their selects name them, set above
    const chosen = (id) => document.getElementById(id)?.selectedOptions[0]?.textContent ?? '';
    return `Ø${mm(op.toolDiameter)} · ${chosen('camSide')} · ${chosen('camDirection')} · ${piece}`;
  }

  /**
   * The keys of the through choice and of the depth of the active operation: the profile and the
   * drilling cut the same piece, each through or to its own depth
   */
  cutKeys() {
    const prefix = this.operation.operation === 'drill' ? 'drill' : 'profile';
    return { through: `${prefix}Through`, depth: `${prefix}Depth` };
  }

  /**
   * The endpoint and body that generate the program of the active operation
   * @param {Array} primitives - primitives in the API format
   * @param {Object} settings - PLC settings from the settings table
   */
  request(primitives, settings) {
    const op = this.operation;
    // The speeds of the tool the operation was given, the global ones where it has none; the pen
    // has no tool of the library and cuts at the global ones
    const toolId = { profile: op.toolId, drill: op.drillId }[op.operation] ?? 0;
    const speeds = speedsFor(toolId, settings);
    const common = {
      primitives,
      defaultSpeed: speeds.feed,
      rapidSpeed: settings.rapidSpeed,
      safeZ: settings.safeZ,
      workZ: settings.workZ,
      waitTime: settings.waitTime
    };
    const cut = this.cutKeys();
    const piece = { thickness: op.thickness, overcut: op.overcut, through: op[cut.through], depth: op[cut.depth] };
    if (op.operation === 'profile') {
      return {
        url: '/api/cam/profile',
        body: {
          ...common,
          ...piece,
          toolDiameter: op.toolDiameter, side: op.side, direction: op.direction,
          stepDown: speeds.stepDown, plungeSpeed: speeds.plunge, rampAngle: settings.rampAngle
        }
      };
    }
    if (op.operation === 'drill') {
      return {
        url: '/api/cam/drill',
        body: {
          ...common,
          ...piece,
          plungeSpeed: speeds.plunge, retractClearance: settings.retractClearance,
          drillDiameter: op.drillDiameter, minHoleDiameter: op.minHoleDiameter, maxHoleDiameter: op.maxHoleDiameter,
          peckDepth: op.peckDepth, tipAngle: op.tipAngle, tipThrough: op.tipThrough
        }
      };
    }
    return { url: '/api/plc/extract', body: common };
  }

  /**
   * What is not cut and what tool would cut it: the narrowest detail decides, since a tool that
   * fits it fits the others too
   */
  unreachedSummary(count, unreached) {
    const label = `${count} ${count === 1 ? 'dettaglio non raggiungibile' : 'dettagli non raggiungibili'} con Ø${this.operation.toolDiameter} mm`;
    const widths = (unreached ?? []).map((d) => d.width);
    if (widths.length === 0) return `${label}: non vengono tagliati`;
    const narrowest = Math.min(...widths);
    if (!(narrowest > 0)) return `${label}: per qualcuno non basta nessuna fresa`;
    return `${label}: serve Ø ${String(narrowest).replace('.', ',')} mm o meno`;
  }

  /**
   * Say what the operation works on: the layer of the step, the selection, or what the visible
   * layers hold
   */
  showArea({ scope, count, total, layer } = {}) {
    const box = document.getElementById('camOperationArea');
    if (!box) return;
    box.className = 'cam-op-area';
    if (total === 0) {
      box.hidden = true;
      return;
    }
    if (scope === 'layer') {
      const state = layer.missing ? 'non è nel disegno' : layer.hidden ? 'nascosto, niente da tagliare' : `${count} primitive`;
      box.classList.toggle('empty', layer.missing || layer.hidden);
      box.textContent = `Area: livello ${layer.name} — ${state}`;
    } else if (scope === 'selection') {
      box.classList.add('selection');
      box.textContent = `Area: selezione — ${count} di ${total} primitive`;
    } else if (count < total) {
      box.textContent = `Area: livelli visibili — ${count} di ${total} primitive`;
    } else {
      box.textContent = `Area: tutto il disegno — ${total} primitive`;
    }
    box.hidden = false;
  }

  /**
   * Show what the generation reported above the commands: nothing, an error, or the warnings of the
   * profile (contours the tool cannot reach) or of the drilling (hole-sized contours that are not round)
   * @param {{error?: string, warnings?: string[], unreached?: object[]}} report
   */
  showReport({ error, warnings, unreached } = {}) {
    const box = document.getElementById('camOperationMessage');
    if (!box) return;
    box.replaceChildren();
    box.className = 'cam-op-message';
    if (error) {
      box.classList.add('error');
      box.textContent = `${this.label}: programma non generato. ${error}`;
    } else if (warnings && warnings.length > 0) {
      box.classList.add('warning');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = this.operation.operation === 'drill'
        ? `${warnings.length} contorni non tondi non forati: usare Profilo`
        : this.unreachedSummary(warnings.length, unreached);
      const list = document.createElement('ul');
      for (const w of warnings) {
        const item = document.createElement('li');
        item.textContent = w;
        list.appendChild(item);
      }
      details.append(summary, list);
      box.appendChild(details);
    }
    box.hidden = !error && !(warnings && warnings.length > 0);
  }
}

export default CAMOperationManager;
