import { commandToPrimitive, formatPlcMove, formatPlcMovements } from "./plcFormatter.js";

export function createOutputController(state, renderer) {
  function renderPlcGrid(commands = [], fallbackText = '') {
    const grid = state.elements.outGrid;
    if (!grid) {
      return;
    }
    grid.innerHTML = '';
    grid.scrollTop = 0;

    if (!commands || commands.length === 0) {
      state.selection.plcIndex = null;
      state.selection.primitive = null;
      grid.removeAttribute('aria-activedescendant');

      const info = document.createElement('div');
      info.className = 'plc-grid-empty';
      info.textContent = (fallbackText && fallbackText.trim()) || 'Nessun comando PLC';
      grid.appendChild(info);
      return;
    }

    grid.removeAttribute('aria-activedescendant');

    commands.forEach((cmd, index) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'plc-cell';
      cell.id = `plc-cell-${index}`;
      cell.setAttribute('role', 'option');
      cell.dataset.index = index.toString();
      cell.textContent = formatPlcMove(cmd) || cmd.type.toUpperCase();
      cell.addEventListener('click', () => selectPlcCommand(index));
      grid.appendChild(cell);
    });

    if (state.selection.plcIndex != null && commands[state.selection.plcIndex]) {
      selectPlcCommand(state.selection.plcIndex, { fromRender: true });
    }
  }

  function selectPlcCommand(index, options = {}) {
    const commands = (state.extraction.last && state.extraction.last.plc_movements) || [];
    const grid = state.elements.outGrid;
    if (!grid || !commands[index]) {
      return;
    }

    state.selection.plcIndex = index;
    state.selection.primitive = commandToPrimitive(commands[index]);

    let activeCell = null;
    grid.querySelectorAll('.plc-cell').forEach((cell) => {
      const isActive = parseInt(cell.dataset.index, 10) === index;
      cell.classList.toggle('selected', isActive);
      if (isActive) {
        activeCell = cell;
      }
    });

    if (activeCell) {
      grid.setAttribute('aria-activedescendant', activeCell.id);
      if (!options.fromRender) {
        activeCell.focus();
      }
    }

    renderer.redrawAll();
    if (state.selection.primitive) {
      renderer.renderPrimitive(state.selection.primitive);
    }
  }

  function setOutput(text, commands = []) {
    if (state.elements.outText) {
      state.elements.outText.value = text || '';
    }
    state.selection.primitive = null;
    state.selection.plcIndex = null;
    renderPlcGrid(commands, text);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = state.elements.outText;
    if (!textarea) {
      return Promise.resolve();
    }
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const success = document.execCommand && document.execCommand('copy');
    textarea.blur();
    return success ? Promise.resolve() : Promise.reject(new Error('clipboard copy failed'));
  }

  function downloadText(text) {
    const blob = new Blob([text || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `plot2D_${ts}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function sendToOpcUa(options = {}) {
    const last = state.extraction?.last;
    const movements = Array.isArray(last?.plc_movements) ? last.plc_movements.filter(Boolean) : [];
    if (movements.length === 0) {
      throw new Error('Nessun comando PLC da inviare');
    }
    const commandStrings = movements
      .map((move) => formatPlcMove(move))
      .filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
    const text = formatPlcMovements(movements);
    const metadata = last
      ? {
          units: last.units || 'mm',
          mm_width: last.mm_width,
          mm_height: last.mm_height,
          px_width: last.width,
          px_height: last.height
        }
      : undefined;
    const payload = { text, commands: commandStrings };
    if (metadata) {
      payload.metadata = metadata;
    }
    if (options?.overrides && typeof options.overrides === 'object') {
      payload.overrides = options.overrides;
    }
    let response;
    try {
      response = await fetch('/api/opcua/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      throw new Error('Connessione al servizio OPC UA non riuscita');
    }
    let result;
    try {
      result = await response.json();
    } catch (parseError) {
      throw new Error('Risposta OPC UA non valida');
    }
    if (!response.ok || result.status !== 'ok') {
      const message = typeof result?.message === 'string' ? result.message : `Errore OPC UA (${response.status})`;
      throw new Error(message);
    }
    return result.details || {};
  }

  return {
    setOutput,
    renderPlcGrid,
    selectPlcCommand,
    formatPlcMovements,
    copyToClipboard,
    downloadText,
    sendToOpcUa
  };
}
