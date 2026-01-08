/**
 * Geometry Module - Main entry point
 * Re-exports all geometry utilities and classes
 */

// Core utilities
export {
  TWO_PI,
  HALF_PI,
  TOLERANCE,
  VISUAL_TOLERANCE,
  normalizeAngle,
  normalizeAngleSigned,
  toRadians,
  toDegrees,
  areEqual,
  clamp,
  lerp,
  distance,
  distanceSquared,
  pointToSegmentDistance,
  Vector2,
  Point,
  BoundingBox,
  Transform2D
} from './core.js';

// Primitives
export {
  Primitive,
  Line,
  Arc,
  Circle,
  Rectangle,
  Polygon,
  Polyline,
  createPrimitiveFromJSON
} from './primitives.js';

// Arc Builder
export {
  ARC_MODES,
  ArcBuilder,
  ArcToolState
} from './arcBuilder.js';

// Snap System
export {
  SNAP_TYPES,
  SnapResult,
  SnapManager,
  CollisionDetector
} from './snap.js';
