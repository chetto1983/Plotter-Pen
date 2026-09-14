/**
 * CAM Operation Manager
 * The operation whose program the PLC output shows (pen plot, profile or drilling), the piece the
 * profile and the drilling cut and their parameters, kept in the database (/api/cam/operation)
 * like the PLC settings.
 */

// Same defaults as the CAMOperation columns
const OPERATION_DEFAULTS = {
  operation: 'pen',
  thickness: 1.6,
  overcut: 0.2,
  toolDiameter: 2,
  side: 'outside',
  direction: 'conventional',
  profileThrough: true,
  profileDepth: 1,
  drillDiameter: 1,
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

export class CAMOperationManager {
  constructor(app) {
    this.app = app;
    this.operation = { ...OPERATION_DEFAULTS };
    this._saveTimeout = null;
  }

  /**
   * Wire the operation tabs and parameter inputs, then load the saved operation
   */
  async init() {
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

    this.render();
    await this.load();
  }

  async load() {
    try {
      const response = await fetch('/api/cam/operation');
      if (!response.ok) return;
      const result = await response.json();
      if (!result.data) return;
      for (const key of Object.keys(OPERATION_DEFAULTS)) {
        if (result.data[key] != null) this.operation[key] = result.data[key];
      }
      this.render();
      // The saved drawing may have been restored and extracted before the operation arrived
      if (this.app.primitives.length > 0) {
        this.app.plcOutputManager.extractPLC();
      }
    } catch {
      // Silent fail - the output stays on the pen
    }
  }

  /**
   * Apply a change from the panel: show it, regenerate the output and save it
   */
  change(values) {
    this.operation = { ...this.operation, ...values };
    this.render();
    this.app.plcOutputManager.refreshPLCOutput();

    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this.save(), 300);
  }

  async save() {
    try {
      const response = await fetch('/api/cam/operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.operation)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      this.app.ui.updateStatus(`Errore salvataggio operazione: ${err.message}`);
    }
  }

  render() {
    const op = this.operation;
    document.querySelectorAll('.cam-op-tab').forEach((tab) => {
      const active = tab.dataset.operation === op.operation;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-checked', String(active));
    });
    document.querySelectorAll('.cam-op-params').forEach((params) => {
      params.hidden = !params.dataset.operation.split(' ').includes(op.operation);
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
  }

  get label() {
    return LABELS[this.operation.operation] || LABELS.pen;
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
    const common = {
      primitives,
      defaultSpeed: settings.workSpeed,
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
          stepDown: settings.stepDown, plungeSpeed: settings.plungeSpeed, rampAngle: settings.rampAngle
        }
      };
    }
    if (op.operation === 'drill') {
      return {
        url: '/api/cam/drill',
        body: {
          ...common,
          ...piece,
          plungeSpeed: settings.plungeSpeed, retractClearance: settings.retractClearance,
          drillDiameter: op.drillDiameter, minHoleDiameter: op.minHoleDiameter, maxHoleDiameter: op.maxHoleDiameter,
          peckDepth: op.peckDepth, tipAngle: op.tipAngle, tipThrough: op.tipThrough
        }
      };
    }
    return { url: '/api/plc/extract', body: common };
  }

  /**
   * Show what the generation reported above the commands: nothing, an error or the profile warnings
   * @param {{error?: string, warnings?: string[]}} report
   */
  showReport({ error, warnings } = {}) {
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
      summary.textContent = `${warnings.length} contorni non raggiungibili con Ø${this.operation.toolDiameter} mm: non vengono tagliati`;
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
