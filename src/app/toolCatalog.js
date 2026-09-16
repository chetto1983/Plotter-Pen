/**
 * The tools of the library, kept in one place: the library window lists them, and the CAM panel
 * reads the speeds of the tool an operation was given.
 */

import { responseError } from '../services/serverError.js';

let tools = [];

/**
 * Read the tools again from the server, and keep them for speedsFor.
 * @returns {Promise<object[]>}
 */
export async function loadTools() {
  const response = await fetch('/api/tools', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json();
  // the endpoint answers with a bare array, unlike the rest of the API
  tools = Array.isArray(payload) ? payload : (payload?.data ?? []);
  return tools;
}

/**
 * The tool of the library with that id, or null: 0 is no tool, and a deleted one is not there
 * @param {number} toolId
 * @returns {object|null}
 */
export function toolById(toolId) {
  return toolId ? tools.find((t) => t.id === toolId) ?? null : null;
}

/**
 * The speeds to cut with: the tool's own where it has one, the global setting where it has 0 or
 * where the tool is not in the library any more.
 * @param {number} toolId 0 when the operation was given no tool
 * @param {{workSpeed: number, plungeSpeed: number, stepDown: number}} settings the global ones
 * @returns {{feed: number, plunge: number, stepDown: number}}
 */
export function speedsFor(toolId, settings) {
  const tool = toolById(toolId);
  const own = (value, fallback) => (value > 0 ? value : fallback);
  return {
    feed: own(tool?.feed, settings.workSpeed),
    plunge: own(tool?.plunge, settings.plungeSpeed),
    stepDown: own(tool?.stepDown, settings.stepDown)
  };
}
