/**
 * The part of the drawing the CAM works on.
 *
 * A selection is the work area: what is selected is what gets cut. With nothing selected the
 * area is everything on a visible layer, so hiding a layer takes it out of the program too.
 */

// The types the extraction and the CAM understand; the rest of the drawing is annotation
const SUPPORTED_TYPES = new Set(['line', 'arc', 'circle', 'rectangle', 'polygon', 'polyline']);

/**
 * @returns {{primitives: object[], scope: 'selection'|'visible', total: number}}
 *   the primitives to work on, what chose them, and how many the drawing holds in all
 */
export function camArea(app) {
  const selected = app.selectedPrimitives;
  const fromSelection = selected ? selected.size > 0 : false;
  // Filtered out of app.primitives, not read out of the Set, so the drawing order is kept
  const supported = app.primitives.filter((p) => SUPPORTED_TYPES.has(p.type));
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

function isVisible(app, primitive) {
  const layers = app.layerManager;
  return layers ? layers.isPrimitiveVisible(primitive) : true;
}

export default camArea;
