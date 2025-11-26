/**
 * Snap System - Grid snapping, object snapping, and magnetic snapping
 * Provides AutoCAD-style snap functionality
 */

import { TOLERANCE, distance, Vector2 } from './core.js';
import { Line, Arc, Circle, Rectangle, Polygon } from './primitives.js';

/**
 * Snap point types
 */
export const SNAP_TYPES = {
  NONE: 'none',
  GRID: 'grid',
  ENDPOINT: 'endpoint',
  MIDPOINT: 'midpoint',
  CENTER: 'center',
  QUADRANT: 'quadrant',
  INTERSECTION: 'intersection',
  PERPENDICULAR: 'perpendicular',
  TANGENT: 'tangent',
  NEAREST: 'nearest',
  NODE: 'node',
  EXTENSION: 'extension'
};

/**
 * Snap result object
 */
export class SnapResult {
  constructor(point = null, type = SNAP_TYPES.NONE, source = null, label = '') {
    this.point = point ? new Vector2(point.x, point.y) : null;
    this.type = type;
    this.source = source; // The primitive that caused this snap
    this.label = label;
    this.distance = Infinity;
  }

  get isValid() {
    return this.point !== null && this.type !== SNAP_TYPES.NONE;
  }
}

/**
 * Snap Manager - Handles all snapping operations
 */
export class SnapManager {
  constructor(options = {}) {
    // Configuration
    this.gridEnabled = options.gridEnabled ?? false;
    this.objectSnapEnabled = options.objectSnapEnabled ?? true;
    this.magnetSnapEnabled = options.magnetSnapEnabled ?? true;

    this.gridSpacing = options.gridSpacing ?? 10;
    this.snapDistance = options.snapDistance ?? 1.5;
    this.magnetDistance = options.magnetDistance ?? 2.8;

    // Enabled snap types
    this.enabledSnapTypes = new Set([
      SNAP_TYPES.ENDPOINT,
      SNAP_TYPES.MIDPOINT,
      SNAP_TYPES.CENTER,
      SNAP_TYPES.INTERSECTION,
      SNAP_TYPES.NEAREST
    ]);

    // Cache for snap anchors
    this._anchorCache = [];
    this._anchorsDirty = true;

    // Reference to primitives collection
    this.primitives = [];
  }

  /**
   * Set primitives collection
   */
  setPrimitives(primitives) {
    this.primitives = primitives;
    this.markAnchorsDirty();
  }

  /**
   * Mark anchors as dirty (need recalculation)
   */
  markAnchorsDirty() {
    this._anchorsDirty = true;
  }

  /**
   * Get all snap anchors from primitives
   */
  getAnchors() {
    if (!this._anchorsDirty && this._anchorCache.length > 0) {
      return this._anchorCache;
    }

    this._anchorCache = [];

    for (const prim of this.primitives) {
      if (!prim.visible) continue;

      const snapPoints = prim.getSnapPoints();
      for (const sp of snapPoints) {
        if (this.enabledSnapTypes.has(sp.type) || sp.type === 'endpoint' || sp.type === 'midpoint') {
          this._anchorCache.push({
            point: sp.point,
            type: this.mapSnapType(sp.type),
            source: prim,
            label: sp.label
          });
        }
      }
    }

    this._anchorsDirty = false;
    return this._anchorCache;
  }

  /**
   * Map internal snap type to SNAP_TYPES
   */
  mapSnapType(type) {
    const typeMap = {
      'endpoint': SNAP_TYPES.ENDPOINT,
      'midpoint': SNAP_TYPES.MIDPOINT,
      'center': SNAP_TYPES.CENTER,
      'quadrant': SNAP_TYPES.QUADRANT,
      'vertex': SNAP_TYPES.NODE,
      'corner': SNAP_TYPES.NODE
    };
    return typeMap[type] || SNAP_TYPES.NEAREST;
  }

  /**
   * Find best snap point for given position
   */
  snap(point, exclude = []) {
    const results = [];

    // Grid snap
    if (this.gridEnabled) {
      const gridSnap = this.snapToGrid(point);
      if (gridSnap.isValid) {
        results.push(gridSnap);
      }
    }

    // Object snap
    if (this.objectSnapEnabled) {
      const objectSnap = this.snapToObjects(point, exclude);
      if (objectSnap.isValid) {
        results.push(objectSnap);
      }
    }

    // Return closest snap
    if (results.length === 0) {
      return new SnapResult();
    }

    results.sort((a, b) => a.distance - b.distance);
    return results[0];
  }

  /**
   * Snap to grid
   */
  snapToGrid(point) {
    const spacing = this.gridSpacing;
    const snappedX = Math.round(point.x / spacing) * spacing;
    const snappedY = Math.round(point.y / spacing) * spacing;

    const snappedPoint = new Vector2(snappedX, snappedY);
    const dist = point.distanceTo ? point.distanceTo(snappedPoint) : distance(point.x, point.y, snappedX, snappedY);

    if (dist <= this.snapDistance) {
      const result = new SnapResult(snappedPoint, SNAP_TYPES.GRID, null, 'Griglia');
      result.distance = dist;
      return result;
    }

    return new SnapResult();
  }

  /**
   * Snap to object anchors
   */
  snapToObjects(point, exclude = []) {
    const anchors = this.getAnchors();
    let bestResult = new SnapResult();
    let bestDist = this.snapDistance;

    for (const anchor of anchors) {
      // Skip excluded sources
      if (exclude.includes(anchor.source)) continue;

      const dist = distance(point.x, point.y, anchor.point.x, anchor.point.y);

      if (dist < bestDist) {
        bestDist = dist;
        bestResult = new SnapResult(anchor.point, anchor.type, anchor.source, anchor.label);
        bestResult.distance = dist;
      }
    }

    return bestResult;
  }

  /**
   * Find nearest point on any primitive
   */
  snapToNearest(point, exclude = []) {
    let bestResult = new SnapResult();
    let bestDist = this.magnetDistance;

    for (const prim of this.primitives) {
      if (!prim.visible || exclude.includes(prim)) continue;

      const dist = prim.distanceToPoint(point);

      if (dist < bestDist) {
        bestDist = dist;
        const nearestPoint = prim.closestPoint ? prim.closestPoint(point) : null;
        if (nearestPoint) {
          bestResult = new SnapResult(nearestPoint, SNAP_TYPES.NEAREST, prim, 'Vicino');
          bestResult.distance = dist;
        }
      }
    }

    return bestResult;
  }

  /**
   * Find intersections between primitives
   */
  findIntersections() {
    const intersections = [];
    const n = this.primitives.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const points = this.intersect(this.primitives[i], this.primitives[j]);
        for (const p of points) {
          intersections.push({
            point: p,
            type: SNAP_TYPES.INTERSECTION,
            sources: [this.primitives[i], this.primitives[j]],
            label: 'Intersezione'
          });
        }
      }
    }

    return intersections;
  }

  /**
   * Calculate intersections between two primitives
   */
  intersect(prim1, prim2) {
    if (prim1 instanceof Line && prim2 instanceof Line) {
      return this.lineLineIntersection(prim1, prim2);
    }
    if (prim1 instanceof Line && prim2 instanceof Arc) {
      return this.lineArcIntersection(prim1, prim2);
    }
    if (prim1 instanceof Arc && prim2 instanceof Line) {
      return this.lineArcIntersection(prim2, prim1);
    }
    if (prim1 instanceof Line && prim2 instanceof Circle) {
      return this.lineCircleIntersection(prim1, prim2);
    }
    if (prim1 instanceof Circle && prim2 instanceof Line) {
      return this.lineCircleIntersection(prim2, prim1);
    }
    if (prim1 instanceof Arc && prim2 instanceof Arc) {
      return this.arcArcIntersection(prim1, prim2);
    }
    if (prim1 instanceof Circle && prim2 instanceof Circle) {
      return this.circleCircleIntersection(prim1, prim2);
    }
    // Add more combinations as needed
    return [];
  }

  /**
   * Line-Line intersection
   */
  lineLineIntersection(line1, line2) {
    const x1 = line1.x1, y1 = line1.y1, x2 = line1.x2, y2 = line1.y2;
    const x3 = line2.x1, y3 = line2.y1, x4 = line2.x2, y4 = line2.y2;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < TOLERANCE) return []; // Parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [new Vector2(x1 + t * (x2 - x1), y1 + t * (y2 - y1))];
    }

    return [];
  }

  /**
   * Line-Circle intersection
   */
  lineCircleIntersection(line, circle) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const fx = line.x1 - circle.cx;
    const fy = line.y1 - circle.cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - circle.radius * circle.radius;

    let discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return [];

    discriminant = Math.sqrt(discriminant);
    const results = [];

    const t1 = (-b - discriminant) / (2 * a);
    const t2 = (-b + discriminant) / (2 * a);

    if (t1 >= 0 && t1 <= 1) {
      results.push(new Vector2(line.x1 + t1 * dx, line.y1 + t1 * dy));
    }
    if (t2 >= 0 && t2 <= 1 && Math.abs(t1 - t2) > TOLERANCE) {
      results.push(new Vector2(line.x1 + t2 * dx, line.y1 + t2 * dy));
    }

    return results;
  }

  /**
   * Line-Arc intersection
   */
  lineArcIntersection(line, arc) {
    // First find line-circle intersections
    const tempCircle = new Circle(arc.cx, arc.cy, arc.radius);
    const circleIntersections = this.lineCircleIntersection(line, tempCircle);

    // Filter to only points on the arc
    return circleIntersections.filter(p => arc.isPointInsideSector(p));
  }

  /**
   * Circle-Circle intersection
   */
  circleCircleIntersection(c1, c2) {
    const d = distance(c1.cx, c1.cy, c2.cx, c2.cy);

    if (d > c1.radius + c2.radius) return []; // Too far apart
    if (d < Math.abs(c1.radius - c2.radius)) return []; // One inside other
    if (d < TOLERANCE && Math.abs(c1.radius - c2.radius) < TOLERANCE) return []; // Same circle

    const a = (c1.radius * c1.radius - c2.radius * c2.radius + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, c1.radius * c1.radius - a * a));

    const px = c1.cx + a * (c2.cx - c1.cx) / d;
    const py = c1.cy + a * (c2.cy - c1.cy) / d;

    const results = [];

    if (h < TOLERANCE) {
      results.push(new Vector2(px, py));
    } else {
      results.push(new Vector2(
        px + h * (c2.cy - c1.cy) / d,
        py - h * (c2.cx - c1.cx) / d
      ));
      results.push(new Vector2(
        px - h * (c2.cy - c1.cy) / d,
        py + h * (c2.cx - c1.cx) / d
      ));
    }

    return results;
  }

  /**
   * Arc-Arc intersection
   */
  arcArcIntersection(arc1, arc2) {
    const tempC1 = new Circle(arc1.cx, arc1.cy, arc1.radius);
    const tempC2 = new Circle(arc2.cx, arc2.cy, arc2.radius);
    const circleIntersections = this.circleCircleIntersection(tempC1, tempC2);

    // Filter to points on both arcs
    return circleIntersections.filter(p =>
      arc1.isPointInsideSector(p) && arc2.isPointInsideSector(p)
    );
  }

  /**
   * Update configuration
   */
  configure(options) {
    if (options.gridEnabled !== undefined) this.gridEnabled = options.gridEnabled;
    if (options.objectSnapEnabled !== undefined) this.objectSnapEnabled = options.objectSnapEnabled;
    if (options.magnetSnapEnabled !== undefined) this.magnetSnapEnabled = options.magnetSnapEnabled;
    if (options.gridSpacing !== undefined) this.gridSpacing = options.gridSpacing;
    if (options.snapDistance !== undefined) this.snapDistance = options.snapDistance;
    if (options.magnetDistance !== undefined) this.magnetDistance = options.magnetDistance;
  }

  /**
   * Enable/disable specific snap type
   */
  setSnapType(type, enabled) {
    if (enabled) {
      this.enabledSnapTypes.add(type);
    } else {
      this.enabledSnapTypes.delete(type);
    }
  }
}

/**
 * Collision Detection - Check if shapes overlap
 */
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

export default SnapManager;
