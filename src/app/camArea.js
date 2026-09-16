/**
 * The part of the drawing the CAM works on.
 *
 * A step of the job on a layer works on that layer, whatever is selected. A step on the whole
 * drawing works on the selection: what is selected is what gets cut. With nothing selected the
 * area is everything on a visible layer, so hiding a layer takes it out of the program too.
 */

// The types the extraction and the CAM understand; the rest of the drawing is annotation
const SUPPORTED_TYPES = new Set(['line', 'arc', 'circle', 'rectangle', 'polygon', 'polyline']);

/**
 * @param {object} app
 * @param {string} [layer] the id of the layer of the step, empty for the whole drawing
 * @returns {{primitives: object[], scope: 'selection'|'visible'|'layer', total: number,
 *   layer?: {id: string, name: string, missing: boolean, hidden: boolean}}}
 *   the primitives to work on, what chose them, and how many the drawing holds in all
 */
export function camArea(app, layer = '') {
  // Filtered out of app.primitives, not read out of the Set, so the drawing order is kept
  const supported = app.primitives.filter((p) => SUPPORTED_TYPES.has(p.type));
  if (layer) return layerArea(app, layer, supported);

  const selected = app.selectedPrimitives;
  const fromSelection = selected ? selected.size > 0 : false;
  // What is hidden is never cut, selected or not: a box selection reaches primitives on hidden
  // layers, and a machine must not run over geometry nobody can see on the screen.
  const primitives = supported.filter((p) => isVisible(app, p) && (!fromSelection || selected.has(p)));
  return { primitives, scope: fromSelection ? 'selection' : 'visible', total: supported.length };
}

/**
 * The visible layers, as a value that changes only when one is shown or hidden: renaming a layer
 * or changing its colour must not regenerate the program.
 */
export function visibleLayerKey(app) {
  const layers = app.layerManager;
  if (!layers) return '';
  return layers.getAllLayers().filter((l) => l.visible).map((l) => l.id).join(',');
}

// The layer of a step: hidden, it is not cut, as ever; gone from the drawing, nothing is either
function layerArea(app, id, supported) {
  const found = app.layerManager?.layers.get(id);
  // the manager decides what is on a layer, a primitive with no layer id included
  const onLayer = found && found.visible ? new Set(app.layerManager.getPrimitivesOnLayer(id)) : new Set();
  const primitives = supported.filter((p) => onLayer.has(p));
  return {
    primitives,
    scope: 'layer',
    total: supported.length,
    layer: { id, name: found?.name ?? id, missing: !found, hidden: Boolean(found) && !found.visible }
  };
}

function isVisible(app, primitive) {
  const layers = app.layerManager;
  return layers ? layers.isPrimitiveVisible(primitive) : true;
}

export default camArea;
