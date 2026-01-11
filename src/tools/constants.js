/**
 * Available tools and phases
 */

export const TOOLS = {
  SELECT: 'select',
  LINE: 'line',
  ARC: 'arc',
  CIRCLE: 'circle',
  RECTANGLE: 'rectangle',
  POLYGON: 'polygon',
  DIMENSION: 'dimension',
  FILLET: 'fillet',
  FREEHAND: 'freehand',
  DELETE: 'delete',
  PAN: 'pan',
  ZOOM: 'zoom'
};

export const TOOL_PHASES = {
  IDLE: 'idle',
  POINT1: 'point1',
  POINT2: 'point2',
  POINT3: 'point3',
  DRAWING: 'drawing',
  COMPLETE: 'complete'
};
