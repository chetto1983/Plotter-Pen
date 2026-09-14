/**
 * PLC Settings Utilities
 * Centralized functions for reading/writing PLC simulation settings from/to UI
 */

const PLC_INPUT_IDS = {
  workSpeed: 'simWorkSpeed',
  rapidSpeed: 'simRapidSpeed',
  safeZ: 'simSafeZ',
  workZ: 'simWorkZ',
  waitTime: 'simWaitTime',
  depth: 'simDepth',
  stepDown: 'simStepDown',
  plungeSpeed: 'simPlungeSpeed',
  rampAngle: 'simRampAngle',
  retractClearance: 'simRetractClearance'
};

// Modal input IDs (for PLC settings modal)
const PLC_MODAL_INPUT_IDS = {
  workSpeed: 'modalSimWorkSpeed',
  rapidSpeed: 'modalSimRapidSpeed',
  safeZ: 'modalSimSafeZ',
  workZ: 'modalSimWorkZ',
  waitTime: 'modalSimWaitTime',
  depth: 'modalSimDepth',
  stepDown: 'modalSimStepDown',
  plungeSpeed: 'modalSimPlungeSpeed',
  rampAngle: 'modalSimRampAngle',
  retractClearance: 'modalSimRetractClearance'
};

// depth, stepDown, plungeSpeed and rampAngle (degrees) are for profile cuts; drilling uses depth,
// plungeSpeed and retractClearance. The defaults match the database columns
const PLC_DEFAULTS = {
  workSpeed: 100,
  rapidSpeed: 1000,
  safeZ: 5,
  workZ: 0,
  waitTime: 0,
  depth: 1,
  stepDown: 0.5,
  plungeSpeed: 5,
  rampAngle: 3,
  retractClearance: 1
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
    waitTime: toInt(document.getElementById(PLC_INPUT_IDS.waitTime)?.value, PLC_DEFAULTS.waitTime),
    depth: toNumber(document.getElementById(PLC_INPUT_IDS.depth)?.value, PLC_DEFAULTS.depth),
    stepDown: toNumber(document.getElementById(PLC_INPUT_IDS.stepDown)?.value, PLC_DEFAULTS.stepDown),
    plungeSpeed: toNumber(document.getElementById(PLC_INPUT_IDS.plungeSpeed)?.value, PLC_DEFAULTS.plungeSpeed),
    rampAngle: toNumber(document.getElementById(PLC_INPUT_IDS.rampAngle)?.value, PLC_DEFAULTS.rampAngle),
    retractClearance: toNumber(document.getElementById(PLC_INPUT_IDS.retractClearance)?.value, PLC_DEFAULTS.retractClearance)
  };
}

/**
 * Write PLC settings to UI input elements
 * @param {Object} settings - PLC settings object
 */
export function setPLCSettingsToUI(settings) {
  if (!settings) return;

  // A field without a value leaves its input as it is
  for (const [key, id] of Object.entries(PLC_INPUT_IDS)) {
    const el = document.getElementById(id);
    if (el && settings[key] != null) el.value = settings[key];
  }
}

/**
 * Read PLC settings from modal input elements
 * @returns {Object} PLC settings object
 */
export function getPLCSettingsFromModal() {
  const toNumber = (value, fallback) => {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const toInt = (value, fallback) => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) ? num : fallback;
  };

  return {
    workSpeed: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.workSpeed)?.value, PLC_DEFAULTS.workSpeed),
    rapidSpeed: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.rapidSpeed)?.value, PLC_DEFAULTS.rapidSpeed),
    safeZ: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.safeZ)?.value, PLC_DEFAULTS.safeZ),
    workZ: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.workZ)?.value, PLC_DEFAULTS.workZ),
    waitTime: toInt(document.getElementById(PLC_MODAL_INPUT_IDS.waitTime)?.value, PLC_DEFAULTS.waitTime),
    depth: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.depth)?.value, PLC_DEFAULTS.depth),
    stepDown: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.stepDown)?.value, PLC_DEFAULTS.stepDown),
    plungeSpeed: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.plungeSpeed)?.value, PLC_DEFAULTS.plungeSpeed),
    rampAngle: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.rampAngle)?.value, PLC_DEFAULTS.rampAngle),
    retractClearance: toNumber(document.getElementById(PLC_MODAL_INPUT_IDS.retractClearance)?.value, PLC_DEFAULTS.retractClearance)
  };
}

/**
 * Write PLC settings to modal input elements
 * @param {Object} settings - PLC settings object
 */
export function setPLCSettingsToModal(settings) {
  if (!settings) return;

  const values = {
    [PLC_MODAL_INPUT_IDS.workSpeed]: settings.workSpeed ?? PLC_DEFAULTS.workSpeed,
    [PLC_MODAL_INPUT_IDS.rapidSpeed]: settings.rapidSpeed ?? PLC_DEFAULTS.rapidSpeed,
    [PLC_MODAL_INPUT_IDS.safeZ]: settings.safeZ ?? PLC_DEFAULTS.safeZ,
    [PLC_MODAL_INPUT_IDS.workZ]: settings.workZ ?? PLC_DEFAULTS.workZ,
    [PLC_MODAL_INPUT_IDS.waitTime]: settings.waitTime ?? PLC_DEFAULTS.waitTime,
    [PLC_MODAL_INPUT_IDS.depth]: settings.depth ?? PLC_DEFAULTS.depth,
    [PLC_MODAL_INPUT_IDS.stepDown]: settings.stepDown ?? PLC_DEFAULTS.stepDown,
    [PLC_MODAL_INPUT_IDS.plungeSpeed]: settings.plungeSpeed ?? PLC_DEFAULTS.plungeSpeed,
    [PLC_MODAL_INPUT_IDS.rampAngle]: settings.rampAngle ?? PLC_DEFAULTS.rampAngle,
    [PLC_MODAL_INPUT_IDS.retractClearance]: settings.retractClearance ?? PLC_DEFAULTS.retractClearance
  };

  for (const [id, val] of Object.entries(values)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
}

export { PLC_DEFAULTS, PLC_INPUT_IDS, PLC_MODAL_INPUT_IDS };
