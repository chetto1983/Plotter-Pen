/**
 * Geometric Primitives - Line, Arc, Circle, Rectangle, Polygon
 * Barrel exports for primitive classes and factory
 */

export { Primitive } from './primitives/base.js';
export { Line } from './primitives/line.js';
export { Arc } from './primitives/arc.js';
export { Circle } from './primitives/circle.js';
export { Rectangle } from './primitives/rectangle.js';
export { Polygon, Polyline } from './primitives/polygon.js';
export { Dimension } from './primitives/dimension.js';
export { createPrimitiveFromJSON } from './primitives/factory.js';
