/**
 * Collision Detection - Check if shapes overlap
 */

import { Vector2 } from './core.js';

export class CollisionDetector {
  constructor(tolerance = 0.25) {
    this.tolerance = tolerance;
  }

  /**
   * Check if a shape collides with any primitives
   */
  detectCollision(shape, primitives) {
    const result = {
      active: false,
      points: [],
      primitives: []
    };

    for (const prim of primitives) {
      const collision = this.checkCollision(shape, prim);
      if (collision.collides) {
        result.active = true;
        result.points.push(...collision.points);
        result.primitives.push(prim);
      }
    }

    return result;
  }

  /**
   * Check collision between two shapes
   */
  checkCollision(shape1, shape2) {
    const result = { collides: false, points: [] };

    // Sample points from shape1 and check distance to shape2
    const samples = shape1.samplePoints ? shape1.samplePoints(32) : [];

    for (const p of samples) {
      const dist = shape2.distanceToPoint(p);
      if (dist < this.tolerance) {
        result.collides = true;
        result.points.push(new Vector2(p.x, p.y));
      }
    }

    return result;
  }
}

export default CollisionDetector;
