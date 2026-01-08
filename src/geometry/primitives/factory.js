/**
 * Factory function to create primitive from JSON
 */

import { Line } from './line.js';
import { Arc } from './arc.js';
import { Circle } from './circle.js';
import { Rectangle } from './rectangle.js';
import { Polygon, Polyline } from './polygon.js';

export function createPrimitiveFromJSON(data) {
  switch (data.type) {
    case 'line':
      return Line.fromJSON(data);
    case 'arc':
      return Arc.fromJSON(data);
    case 'circle':
      return Circle.fromJSON(data);
    case 'rectangle':
      return Rectangle.fromJSON(data);
    case 'polygon':
      return Polygon.fromJSON(data);
    case 'polyline':
      return Polyline.fromJSON(data);
    default:
      throw new Error(`Unknown primitive type: ${data.type}`);
  }
}

export default createPrimitiveFromJSON;
