/**
 * PLC Settings Utilities
 * Centralized functions for reading/writing PLC simulation settings from/to UI
 */

const PLC_INPUT_IDS = {
  workSpeed: 'simWorkSpeed',
  rapidSpeed: 'simRapidSpeed',
  safeZ: 'simSafeZ',
  workZ: 'simWorkZ',
  waitTime: 'simWaitTime'
};

const PLC_DEFAULTS = {
  workSpeed: 100,
  rapidSpeed: 1000,
  safeZ: 5,
  workZ: 0,
  waitTime: 0
};

/**
 * Read PLC settings from UI input elements
 * @returns {Object} PLC settings object
 */
export function getPLCSettingsFromUI() {
  const toNumber = (value, fallback) => {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const toInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) ? num : fallback;
  };

  return {
    workSpeed: toNumber(document.getElementById(PLC_INPUT_IDS.workSpeed)?.value, PLC_DEFAULTS.workSpeed),
    rapidSpeed: toNumber(document.getElementById(PLC_INPUT_IDS.rapidSpeed)?.value, PLC_DEFAULTS.rapidSpeed),
    safeZ: toNumber(document.getElementById(PLC_INPUT_IDS.safeZ)?.value, PLC_DEFAULTS.safeZ),
    workZ: toNumber(document.getElementById(PLC_INPUT_IDS.workZ)?.value, PLC_DEFAULTS.workZ),
    waitTime: toInt(document.getElementById(PLC_INPUT_IDS.waitTime)?.value, PLC_DEFAULTS.waitTime)
  };
}

/**
 * Write PLC settings to UI input elements
 * @param {Object} settings - PLC settings object
 */
export function setPLCSettingsToUI(settings) {
  if (!settings) return;

  const values = {
    [PLC_INPUT_IDS.workSpeed]: settings.workSpeed ?? PLC_DEFAULTS.workSpeed,
    [PLC_INPUT_IDS.rapidSpeed]: settings.rapidSpeed ?? PLC_DEFAULTS.rapidSpeed,
    [PLC_INPUT_IDS.safeZ]: settings.safeZ ?? PLC_DEFAULTS.safeZ,
    [PLC_INPUT_IDS.workZ]: settings.workZ ?? PLC_DEFAULTS.workZ,
    [PLC_INPUT_IDS.waitTime]: settings.waitTime ?? PLC_DEFAULTS.waitTime
  };

  for (const [id, val] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
}

export { PLC_DEFAULTS, PLC_INPUT_IDS };
