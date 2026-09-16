/**
 * Running the job: its steps sent to the PLC one at a time, each only when the operator says so.
 *
 * The machine tells the app when it has received a program — the chunked transfer ends with the
 * PLC's acknowledgement — but never when it has finished cutting it: statusNode, alarmNode and
 * progressNode are empty. So the operator paces the job: a step is sent after its tool is
 * confirmed as mounted, and the next one is offered only after "Passo N finito". The bar at the
 * top of the PLC output panel shows where the job is; while it runs the job is locked.
 */
import { camArea } from './camArea.js';
import { toolById } from './toolCatalog.js';

const mm = (value) => String(value).replace('.', ',');

// What the bar can show, and the buttons each state offers (Ferma is there while it runs)
const STATES = {
  idle: [],
  checking: [],
  blocked: ['camRunClose'],
  ready: ['camRunSend'],
  sending: [],
  loaded: ['camRunDone'],
  failed: ['camRunRetry'],
  finished: ['camRunClose']
};
const BUTTONS = ['camRunSend', 'camRunDone', 'camRunRetry', 'camRunClose'];

export class JobRunner {
  /**
   * @param {object} app
   * @param {object} cam the CAMOperationManager, which holds the job
   */
  constructor(app, cam) {
    this.app = app;
    this.cam = cam;
    this.state = 'idle';
    this.index = 0;
    // the tool of the step sent last in this run: the next step asks for a change only if it differs
    this.previousTool = null;
    // the lines of the program sent last, which the bar reports once the PLC has them
    this.sentLines = 0;
  }

  /**
   * Whether a job is being run: the panel and the ribbon send are locked. A job that did not start
   * or has finished only shows its bar.
   */
  get running() {
    return !['idle', 'blocked', 'finished'].includes(this.state);
  }

  get job() {
    return this.cam.job;
  }

  get step() {
    return this.job.steps[this.index];
  }

  init() {
    document.getElementById('camJobRun')?.addEventListener('click', () => this.start());
    document.getElementById('camRunSend')?.addEventListener('click', () => this.send());
    document.getElementById('camRunRetry')?.addEventListener('click', () => this.send());
    document.getElementById('camRunDone')?.addEventListener('click', () => this.stepDone());
    document.getElementById('camRunClose')?.addEventListener('click', () => this.enter('idle'));
    document.getElementById('camRunStop')?.addEventListener('click', () => this.stop());
    document.getElementById('camRunMounted')?.addEventListener('change', () => this.render());

    // One listener each for the life of the page; they act only while a step is being sent
    const ws = this.app.wsService;
    if (!ws) return;
    ws.on('transfer_complete', () => this.onTransfer('loaded'));
    ws.on('transfer_error', (data) => this.onTransfer('failed', data?.error));
    ws.on('transfer_cancelled', () => this.onTransfer('failed', 'trasferimento annullato'));
    ws.on('error', (data) => this.onTransfer('failed', data?.message));
    ws.on('disconnected', () => this.onTransfer('failed', 'connessione col server persa'));
  }

  /**
   * Check every step, then offer the first one: the active step. Nothing is sent before the
   * operator presses the button of a step.
   */
  async start() {
    if (this.state !== 'idle' && this.state !== 'blocked') return;
    if (!this.app.wsService?.isConnected()) {
      this.enter('blocked', 'PLC non connesso: il lavoro non parte.');
      return;
    }
    this.enter('checking', 'Controllo dei passi…');
    const problems = await this.check();
    if (this.state !== 'checking') return;
    if (problems.length > 0) {
      this.enter('blocked', `Il lavoro non parte. ${problems.join(' ')}`);
      return;
    }
    this.index = this.job.active;
    this.previousTool = null;
    this.enter('ready');
  }

  /**
   * What would keep a step from being cut, for every step of the job: an area with nothing in it,
   * a program the server refuses or one with no command.
   * @returns {Promise<string[]>}
   */
  async check() {
    const problems = [];
    for (const [i, step] of this.job.steps.entries()) {
      const area = camArea(this.app, step.layer);
      const name = `Passo ${i + 1}:`;
      if (area.primitives.length === 0) {
        const layer = area.layer;
        const why = !layer ? 'niente da tagliare'
          : layer.missing ? `il livello ${layer.name} non è nel disegno`
            : layer.hidden ? `il livello ${layer.name} è nascosto` : `il livello ${layer.name} è vuoto`;
        problems.push(`${name} ${why}.`);
        continue;
      }
      try {
        const { error, result } = await this.app.plcOutputManager.generate(step, area);
        if (error) problems.push(`${name} ${error}.`);
        else if (!result.output?.length) problems.push(`${name} nessun comando.`);
      } catch (err) {
        problems.push(`${name} ${err.message}.`);
      }
    }
    return problems;
  }

  /**
   * Send the program of the current step, generated now, as the panel shows it
   */
  async send() {
    if (this.state !== 'ready' && this.state !== 'failed') return;
    if (this.state === 'ready' && this.needsMount() && !this.mountedTicked()) return;
    this.enter('sending', `Invio del passo ${this.index + 1} al PLC…`);
    // the drawing may have changed since the check: a layer hidden now is not cut
    const area = camArea(this.app, this.step.layer);
    if (area.primitives.length === 0) {
      this.enter('failed', 'Il passo non ha niente da tagliare: livello nascosto, assente o vuoto.');
      return;
    }
    let commands;
    try {
      const { error, result } = await this.app.plcOutputManager.generate(this.step, area);
      if (this.state !== 'sending') return;
      if (error) {
        this.enter('failed', `Programma non generato: ${error}`);
        return;
      }
      commands = result.output ?? [];
    } catch (err) {
      if (this.state === 'sending') this.enter('failed', `Programma non generato: ${err.message}`);
      return;
    }
    const ws = this.app.wsService;
    if (commands.length === 0 || !ws?.isConnected() || !ws.transfer(commands)) {
      this.enter('failed', commands.length === 0 ? 'Il passo non ha comandi.' : 'PLC non connesso: niente inviato.');
      return;
    }
    this.sentLines = commands.length;
  }

  // An answer of the transfer counts only while a step is being sent
  onTransfer(next, error) {
    if (this.state !== 'sending') return;
    if (next === 'loaded') this.enter('loaded');
    else this.enter('failed', `Invio non riuscito: ${error || 'errore sconosciuto'}.`);
  }

  // The operator says the step is over: the next one, or the end
  stepDone() {
    if (this.state !== 'loaded') return;
    this.previousTool = this.toolOf(this.step);
    this.index += 1;
    this.enter(this.index < this.job.steps.length ? 'ready' : 'finished');
  }

  /**
   * End the run. A transfer under way is cancelled; the machine is not stopped — the app cannot,
   * and the bar says so.
   */
  stop() {
    if (this.state === 'sending') this.app.wsService?.cancelTransfer();
    this.enter('idle');
  }

  enter(state, message = '') {
    this.state = state;
    this.message = message;
    if (state === 'ready') {
      const mounted = document.getElementById('camRunMounted');
      if (mounted) mounted.checked = false;
      // the panel shows the step with its program and its tool in 3D
      this.job.activate(this.index);
    }
    this.lock(this.running);
    this.render();
  }

  /**
   * The tool a step cuts with: its kind, id and diameter tell a change apart; the name comes from
   * the library when the step was given one of its tools
   */
  toolOf(step) {
    if (step.operation === 'pen') return { key: 'pen', label: 'Penna' };
    const drilling = step.operation === 'drill';
    const id = drilling ? step.drillId : step.toolId;
    const kind = drilling ? step.drillType : step.toolType;
    const diameter = drilling ? step.drillDiameter : step.toolDiameter;
    const what = `${drilling ? 'punta' : 'fresa'} Ø${mm(diameter)}`;
    const tool = toolById(id);
    return {
      key: `${id}:${kind}:${diameter}`,
      label: tool ? `${tool.name} (${what})` : what.charAt(0).toUpperCase() + what.slice(1)
    };
  }

  needsMount() {
    return !this.previousTool || this.previousTool.key !== this.toolOf(this.step).key;
  }

  mountedTicked() {
    return Boolean(document.getElementById('camRunMounted')?.checked);
  }

  /**
   * Nothing of the job changes while it runs: the list, the layer, the tabs and the parameters
   */
  lock(locked) {
    if (this.job.locked === locked) return;
    this.job.locked = locked;
    const panel = document.getElementById('camOperation');
    panel?.classList.toggle('running', locked);
    for (const control of panel?.querySelectorAll('.cam-op-tab, .cam-op-params input, .cam-op-params select, .cam-op-tools') ?? []) {
      control.disabled = locked;
    }
    this.job.render();
  }

  render() {
    const box = document.getElementById('camRun');
    if (!box) return;
    box.hidden = this.state === 'idle';
    box.dataset.state = this.state;
    const total = this.job.steps.length;
    const step = this.step;
    const title = document.getElementById('camRunTitle');
    const text = document.getElementById('camRunText');
    const mountedField = document.getElementById('camRunMountedField');
    let heading = 'Lavoro';
    let body = this.message;
    let mountLabel = '';

    if (['ready', 'sending', 'loaded', 'failed'].includes(this.state) && step) {
      const layer = step.layer ? this.job.layerName(step.layer) : 'tutto il disegno';
      heading = `Passo ${this.index + 1} di ${total} · ${this.cam.labelOf(step)} · ${layer}`;
      const tool = this.toolOf(step);
      if (this.state === 'ready') {
        body = this.needsMount() ? `Monta: ${tool.label}.` : `Stesso utensile: ${tool.label}.`;
        mountLabel = `Montato: ${tool.label}`;
      } else if (this.state === 'loaded') {
        body = `Passo ${this.index + 1} caricato sul PLC (${this.sentLines} righe). Avvia la macchina; a taglio finito premi il pulsante.`;
      }
    } else if (this.state === 'finished') {
      heading = 'Lavoro finito';
      body = `${total} ${total === 1 ? 'passo inviato' : 'passi inviati'}.`;
    }
    if (title) title.textContent = heading;
    if (text) text.textContent = body;
    if (mountedField) mountedField.hidden = !(this.state === 'ready' && this.needsMount());
    const mountText = document.getElementById('camRunMountedLabel');
    if (mountText) mountText.textContent = mountLabel;

    const offered = STATES[this.state] ?? [];
    for (const id of BUTTONS) {
      const button = document.getElementById(id);
      if (button) button.hidden = !offered.includes(id);
    }
    const sendButton = document.getElementById('camRunSend');
    if (sendButton) {
      sendButton.textContent = `Invia passo ${this.index + 1}`;
      sendButton.disabled = this.needsMountUnconfirmed();
    }
    const doneButton = document.getElementById('camRunDone');
    if (doneButton) doneButton.textContent = `Passo ${this.index + 1} finito`;
    // Ferma, and the note that it does not stop the machine, only while there is something to stop
    for (const id of ['camRunStop', 'camRunNote']) {
      const element = document.getElementById(id);
      if (element) element.hidden = !this.running;
    }
  }

  needsMountUnconfirmed() {
    return this.state === 'ready' && Boolean(this.step) && this.needsMount() && !this.mountedTicked();
  }
}

export default JobRunner;
