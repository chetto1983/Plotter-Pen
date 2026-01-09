/**
 * Snap System - Grid snapping, object snapping, and magnetic snapping
 * Provides AutoCAD-style snap functionality
 */

import { TOLERANCE, distance, Vector2 } from './core.js';


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

    // Last snap result for rendering
    this.lastSnapResult = null;
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

  setLayerManager(layerManager) {
    this.layerManager = layerManager;
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
      if (this.layerManager && !this.layerManager.isPrimitiveVisible(prim)) continue;

      const snapPoints = prim.getSnapPoints();
      for (const sp of snapPoints) {
        // Map the type first, then check if enabled
        const mappedType = this.mapSnapType(sp.type);
        // Accept common snap types: endpoint, midpoint, center, corner (vertex), quadrant
        const isCommonType = ['endpoint', 'midpoint', 'center', 'vertex', 'corner', 'quadrant'].includes(sp.type);

        if (this.enabledSnapTypes.has(mappedType) || isCommonType) {
          this._anchorCache.push({
            point: sp.point,
            type: mappedType,
            source: prim,
            label: sp.label
          });
        }
      }
    }

    // Add intersection points between primitives
    this.addIntersectionAnchors();

    this._anchorsDirty = false;
    return this._anchorCache;
  }

  /**
   * Add intersection points between all primitives
   */
  addIntersectionAnchors() {
    const prims = this.primitives.filter(p => p.visible);

    // Performance safeguard: for large drawings, O(N^2) intersection checks cause freeze.
    // Limit global intersection snapping to < 500 primitives.
    if (prims.length > 500) {
      if (!this._warnedIntersectionLimit) {
        console.warn('Simulazione CAD: Disabilitato snap intersezioni globali per prestazioni (elementi > 500)');
        this._warnedIntersectionLimit = true;
      }
      return;
    }

    for (let i = 0; i < prims.length; i++) {
      for (let j = i + 1; j < prims.length; j++) {
        const intersections = this.findIntersections(prims[i], prims[j]);
        for (const pt of intersections) {
          this._anchorCache.push({
            point: new Vector2(pt.x, pt.y),
            type: SNAP_TYPES.INTERSECTION,
            source: [prims[i], prims[j]],
            label: 'Intersezione'
          });
        }
      }
    }
  }

  /**
   * Find intersection points between two primitives
   */
  findIntersections(prim1, prim2) {
    const type1 = prim1.type;
    const type2 = prim2.type;

    // Line-Line
    if (type1 === 'line' && type2 === 'line') {
      return this.lineLineIntersection(prim1, prim2);
    }

    // Line-Circle
    if (type1 === 'line' && type2 === 'circle') {
      return this.lineCircleIntersection(prim1, prim2);
    }
    if (type1 === 'circle' && type2 === 'line') {
      return this.lineCircleIntersection(prim2, prim1);
    }

    // Line-Arc
    if (type1 === 'line' && type2 === 'arc') {
      return this.lineArcIntersection(prim1, prim2);
    }
    if (type1 === 'arc' && type2 === 'line') {
      return this.lineArcIntersection(prim2, prim1);
    }

    // Circle-Circle
    if (type1 === 'circle' && type2 === 'circle') {
      return this.circleCircleIntersection(prim1, prim2);
    }

    // Arc-Circle
    if (type1 === 'arc' && type2 === 'circle') {
      return this.arcCircleIntersection(prim1, prim2);
    }
    if (type1 === 'circle' && type2 === 'arc') {
      return this.arcCircleIntersection(prim2, prim1);
    }

    // Arc-Arc
    if (type1 === 'arc' && type2 === 'arc') {
      return this.arcArcIntersection(prim1, prim2);
    }

    // Rectangle edges as lines
    if (type1 === 'rectangle' || type2 === 'rectangle') {
      return this.rectangleIntersection(prim1, prim2);
    }

    // Polygon edges as lines
    if (type1 === 'polygon' || type1 === 'polyline' || type2 === 'polygon' || type2 === 'polyline') {
      return this.polygonIntersection(prim1, prim2);
    }

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
      return [{ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) }];
    }
    return [];
  }

  /**
   * Line-Circle intersection
   */
  lineCircleIntersection(line, circle) {
    const cx = circle.cx ?? circle.center?.x;
    const cy = circle.cy ?? circle.center?.y;
    const r = circle.radius ?? circle._radius;

    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const fx = line.x1 - cx;
    const fy = line.y1 - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return [];

    const results = [];
    const sqrtDisc = Math.sqrt(discriminant);

    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    if (t1 >= 0 && t1 <= 1) {
      results.push({ x: line.x1 + t1 * dx, y: line.y1 + t1 * dy });
    }
    if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > TOLERANCE) {
      results.push({ x: line.x1 + t2 * dx, y: line.y1 + t2 * dy });
    }

    return results;
  }

  /**
   * Line-Arc intersection
   */
  lineArcIntersection(line, arc) {
    // First find line-circle intersections
    const cx = arc.cx ?? arc.c?.x;
    const cy = arc.cy ?? arc.c?.y;
    const r = arc.radius;

    const circlePoints = this.lineCircleIntersection(line, { cx, cy, radius: r });

    // Filter to points that are on the arc
    return circlePoints.filter(pt => arc.isPointInsideSector ? arc.isPointInsideSector(pt) : true);
  }

  /**
   * Circle-Circle intersection
   */
  circleCircleIntersection(circle1, circle2) {
    const x1 = circle1.cx ?? circle1.center?.x;
    const y1 = circle1.cy ?? circle1.center?.y;
    const r1 = circle1.radius ?? circle1._radius;

    const x2 = circle2.cx ?? circle2.center?.x;
    const y2 = circle2.cy ?? circle2.center?.y;
    const r2 = circle2.radius ?? circle2._radius;

    const d = distance(x1, y1, x2, y2);

    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d < TOLERANCE) {
      return []; // No intersection
    }

    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));

    const px = x1 + a * (x2 - x1) / d;
    const py = y1 + a * (y2 - y1) / d;

    const results = [];
    results.push({ x: px + h * (y2 - y1) / d, y: py - h * (x2 - x1) / d });

    if (h > TOLERANCE) {
      results.push({ x: px - h * (y2 - y1) / d, y: py + h * (x2 - x1) / d });
    }

    return results;
  }

  /**
   * Arc-Circle intersection
   */
  arcCircleIntersection(arc, circle) {
    const cx = arc.cx ?? arc.c?.x;
    const cy = arc.cy ?? arc.c?.y;
    const r = arc.radius;

    const circlePoints = this.circleCircleIntersection(
      { cx, cy, radius: r },
      circle
    );

    // Filter to points on the arc
    return circlePoints.filter(pt => arc.isPointInsideSector ? arc.isPointInsideSector(pt) : true);
  }

  /**
   * Arc-Arc intersection
   */
  arcArcIntersection(arc1, arc2) {
    const cx1 = arc1.cx ?? arc1.c?.x;
    const cy1 = arc1.cy ?? arc1.c?.y;
    const r1 = arc1.radius;

    const cx2 = arc2.cx ?? arc2.c?.x;
    const cy2 = arc2.cy ?? arc2.c?.y;
    const r2 = arc2.radius;

    const circlePoints = this.circleCircleIntersection(
      { cx: cx1, cy: cy1, radius: r1 },
      { cx: cx2, cy: cy2, radius: r2 }
    );

    // Filter to points on both arcs
    return circlePoints.filter(pt => {
      const onArc1 = arc1.isPointInsideSector ? arc1.isPointInsideSector(pt) : true;
      const onArc2 = arc2.isPointInsideSector ? arc2.isPointInsideSector(pt) : true;
      return onArc1 && onArc2;
    });
  }

  /**
   * Rectangle intersection with other primitives
   */
  rectangleIntersection(prim1, prim2) {
    const rect = prim1.type === 'rectangle' ? prim1 : prim2;
    const other = prim1.type === 'rectangle' ? prim2 : prim1;

    const edges = rect.edges;
    const results = [];

    for (const edge of edges) {
      const inters = this.findIntersections(edge, other);
      results.push(...inters);
    }

    return results;
  }

  /**
   * Polygon intersection with other primitives
   */
  polygonIntersection(prim1, prim2) {
    const poly = (prim1.type === 'polygon' || prim1.type === 'polyline') ? prim1 : prim2;
    const other = (prim1.type === 'polygon' || prim1.type === 'polyline') ? prim2 : prim1;

    const edges = poly.edges;
    const results = [];

    for (const edge of edges) {
      const inters = this.findIntersections(edge, other);
      results.push(...inters);
    }

    return results;
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
      this.lastSnapResult = null;
      return new SnapResult();
    }

    results.sort((a, b) => a.distance - b.distance);
    this.lastSnapResult = results[0];
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
