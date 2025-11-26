/**
 * PLC Extraction Module - Extract primitives and generate PLC commands
 * Converts drawing data into line/arc primitives for plotter output
 */

import { distance, Vector2, TOLERANCE } from '../geometry/core.js';
import { Line, Arc } from '../geometry/primitives.js';
import { ArcBuilder } from '../geometry/arcBuilder.js';

/**
 * Extraction configuration
 */
export const EXTRACTION_CONFIG = {
  minPrimitiveLength: 0.8,    // Minimum length for a primitive (mm)
  epsLine: 0.35,              // RMS error threshold for line fitting
  epsArc: 0.9,                // RMS error threshold for arc fitting
  arcFitWindow: 5,            // Window size for arc detection
  simplifyTolerance: 0.1      // Tolerance for path simplification
};

/**
 * Primitive types for PLC output
 */
export const PLC_TYPES = {
  LINE: 1,
  ARC_CW: 2,
  ARC_CCW: 3
};

/**
 * Extract primitives from stroke data
 */
export class PrimitiveExtractor {
  constructor(config = {}) {
    this.config = { ...EXTRACTION_CONFIG, ...config };
  }

  /**
   * Extract primitives from an array of strokes
   */
  extractFromStrokes(strokes) {
    const primitives = [];
    let idCounter = 0;

    for (const stroke of strokes) {
      if (!stroke || stroke.length < 2) continue;

      // If stroke has arc info, use it directly
      if (stroke.arcInfo) {
        const arc = this.createArcFromInfo(stroke.arcInfo, idCounter++);
        if (arc) primitives.push(arc);
        continue;
      }

      // If stroke is from a tool, handle by type
      if (stroke.tool) {
        const extracted = this.extractFromToolStroke(stroke, idCounter);
        idCounter += extracted.length;
        primitives.push(...extracted);
        continue;
      }

      // Freehand stroke - detect primitives
      const detected = this.detectPrimitives(stroke, idCounter);
      idCounter += detected.length;
      primitives.push(...detected);
    }

    return primitives;
  }

  /**
   * Create arc primitive from stored arc info
   */
  createArcFromInfo(info, id) {
    if (!info.start || !info.end || !info.center || !info.radius) {
      return null;
    }

    const arc = new Arc(
      info.start.x, info.start.y,
      info.end.x, info.end.y,
      info.center.x, info.center.y,
      `arc_${id}`
    );

    // Add PLC-specific data
    arc.plcData = {
      type: arc.isClockwise ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW,
      x1: info.start.x,
      y1: info.start.y,
      x2: info.end.x,
      y2: info.end.y,
      cx: info.center.x,
      cy: info.center.y,
      r: info.radius,
      dir: arc.isClockwise ? 'CW' : 'CCW'
    };

    return arc;
  }

  /**
   * Extract primitives from tool-created stroke
   */
  extractFromToolStroke(stroke, startId) {
    const primitives = [];

    switch (stroke.tool) {
      case 'line':
        if (stroke.length >= 2) {
          const line = new Line(
            stroke[0].x, stroke[0].y,
            stroke[stroke.length - 1].x, stroke[stroke.length - 1].y,
            `line_${startId}`
          );
          line.plcData = {
            type: PLC_TYPES.LINE,
            x1: line.x1,
            y1: line.y1,
            x2: line.x2,
            y2: line.y2
          };
          primitives.push(line);
        }
        break;

      case 'arc':
        if (stroke.arcInfo) {
          const arc = this.createArcFromInfo(stroke.arcInfo, startId);
          if (arc) primitives.push(arc);
        }
        break;

      case 'rectangle':
        // Extract 4 lines from rectangle
        for (let i = 0; i < stroke.length - 1; i++) {
          const line = new Line(
            stroke[i].x, stroke[i].y,
            stroke[i + 1].x, stroke[i + 1].y,
            `line_${startId + i}`
          );
          if (line.length >= this.config.minPrimitiveLength) {
            line.plcData = {
              type: PLC_TYPES.LINE,
              x1: line.x1,
              y1: line.y1,
              x2: line.x2,
              y2: line.y2
            };
            primitives.push(line);
          }
        }
        break;

      case 'polygon':
        // Extract lines from polygon edges
        for (let i = 0; i < stroke.length - 1; i++) {
          const line = new Line(
            stroke[i].x, stroke[i].y,
            stroke[i + 1].x, stroke[i + 1].y,
            `line_${startId + i}`
          );
          if (line.length >= this.config.minPrimitiveLength) {
            line.plcData = {
              type: PLC_TYPES.LINE,
              x1: line.x1,
              y1: line.y1,
              x2: line.x2,
              y2: line.y2
            };
            primitives.push(line);
          }
        }
        break;

      default:
        // Treat as polyline
        for (let i = 0; i < stroke.length - 1; i++) {
          const line = new Line(
            stroke[i].x, stroke[i].y,
            stroke[i + 1].x, stroke[i + 1].y,
            `line_${startId + i}`
          );
          if (line.length >= this.config.minPrimitiveLength) {
            line.plcData = {
              type: PLC_TYPES.LINE,
              x1: line.x1,
              y1: line.y1,
              x2: line.x2,
              y2: line.y2
            };
            primitives.push(line);
          }
        }
    }

    return primitives;
  }

  /**
   * Detect primitives (lines and arcs) from freehand stroke
   */
  detectPrimitives(points, startId) {
    if (points.length < 2) return [];

    const primitives = [];
    let id = startId;
    let i = 0;

    while (i < points.length - 1) {
      // Try to fit an arc first (if enough points)
      if (i + this.config.arcFitWindow <= points.length) {
        const arcResult = this.tryFitArc(points, i);

        if (arcResult && arcResult.rms < this.config.epsArc) {
          primitives.push(arcResult.primitive);
          arcResult.primitive.id = `arc_${id++}`;
          i = arcResult.endIndex;
          continue;
        }
      }

      // Try to fit a line
      const lineResult = this.tryFitLine(points, i);

      if (lineResult && lineResult.rms < this.config.epsLine) {
        primitives.push(lineResult.primitive);
        lineResult.primitive.id = `line_${id++}`;
        i = lineResult.endIndex;
        continue;
      }

      // Fallback: single segment
      const line = new Line(
        points[i].x, points[i].y,
        points[i + 1].x, points[i + 1].y,
        `line_${id++}`
      );

      if (line.length >= this.config.minPrimitiveLength) {
        line.plcData = {
          type: PLC_TYPES.LINE,
          x1: line.x1,
          y1: line.y1,
          x2: line.x2,
          y2: line.y2
        };
        primitives.push(line);
      }

      i++;
    }

    return primitives;
  }

  /**
   * Try to fit a line starting from index
   */
  tryFitLine(points, startIndex) {
    let bestEnd = startIndex + 1;
    let bestRms = Infinity;
    let bestLine = null;

    for (let end = startIndex + 2; end < points.length; end++) {
      const line = new Line(
        points[startIndex].x, points[startIndex].y,
        points[end].x, points[end].y
      );

      const rms = this.calculateLineRMS(line, points, startIndex, end);

      if (rms < this.config.epsLine && rms <= bestRms) {
        bestRms = rms;
        bestEnd = end;
        bestLine = line;
      } else if (rms > this.config.epsLine * 2) {
        // Stop extending if error is too high
        break;
      }
    }

    if (bestLine && bestLine.length >= this.config.minPrimitiveLength) {
      bestLine.plcData = {
        type: PLC_TYPES.LINE,
        x1: bestLine.x1,
        y1: bestLine.y1,
        x2: bestLine.x2,
        y2: bestLine.y2
      };
      return { primitive: bestLine, endIndex: bestEnd, rms: bestRms };
    }

    return null;
  }

  /**
   * Try to fit an arc starting from index
   */
  tryFitArc(points, startIndex) {
    const windowSize = this.config.arcFitWindow;

    if (startIndex + windowSize > points.length) return null;

    // Use three points: start, middle, end of window
    const start = points[startIndex];
    const mid = points[startIndex + Math.floor(windowSize / 2)];
    const end = points[startIndex + windowSize - 1];

    // Try to create arc from three points
    const arc = ArcBuilder.fromThreePoints(start, mid, end);

    if (!arc) return null;

    // Calculate RMS error for the window
    const rms = this.calculateArcRMS(arc, points, startIndex, startIndex + windowSize);

    if (rms < this.config.epsArc) {
      // Try to extend the arc
      let bestEnd = startIndex + windowSize;

      for (let end = startIndex + windowSize; end < points.length; end++) {
        const extendedArc = ArcBuilder.fromThreePoints(
          start,
          points[Math.floor((startIndex + end) / 2)],
          points[end]
        );

        if (!extendedArc) break;

        const extRms = this.calculateArcRMS(extendedArc, points, startIndex, end + 1);

        if (extRms < this.config.epsArc) {
          bestEnd = end + 1;
          arc.b.x = points[end].x;
          arc.b.y = points[end].y;
          arc.syncGeometry();
        } else {
          break;
        }
      }

      arc.plcData = {
        type: arc.isClockwise ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW,
        x1: arc.x1,
        y1: arc.y1,
        x2: arc.x2,
        y2: arc.y2,
        cx: arc.cx,
        cy: arc.cy,
        r: arc.radius,
        dir: arc.isClockwise ? 'CW' : 'CCW'
      };

      return { primitive: arc, endIndex: bestEnd, rms };
    }

    return null;
  }

  /**
   * Calculate RMS error for line fit
   */
  calculateLineRMS(line, points, start, end) {
    let sumSq = 0;
    let count = 0;

    for (let i = start; i <= end && i < points.length; i++) {
      const dist = line.distanceToPoint(points[i]);
      sumSq += dist * dist;
      count++;
    }

    return count > 0 ? Math.sqrt(sumSq / count) : Infinity;
  }

  /**
   * Calculate RMS error for arc fit
   */
  calculateArcRMS(arc, points, start, end) {
    let sumSq = 0;
    let count = 0;

    for (let i = start; i < end && i < points.length; i++) {
      const dist = arc.distanceToPoint(points[i]);
      sumSq += dist * dist;
      count++;
    }

    return count > 0 ? Math.sqrt(sumSq / count) : Infinity;
  }
}

/**
 * Path Optimizer - Optimize drawing order for efficient plotting
 */
export class PathOptimizer {
  /**
   * Optimize path order using nearest neighbor heuristic
   */
  static optimizeOrder(primitives, startPoint = { x: 0, y: 0 }) {
    if (primitives.length <= 1) return primitives;

    const remaining = [...primitives];
    const optimized = [];
    let currentPoint = { ...startPoint };

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDist = Infinity;
      let reverseNearest = false;

      // Find nearest primitive start/end point
      for (let i = 0; i < remaining.length; i++) {
        const prim = remaining[i];
        const startPt = prim.type === 'arc'
          ? { x: prim.x1, y: prim.y1 }
          : { x: prim.x1, y: prim.y1 };
        const endPt = prim.type === 'arc'
          ? { x: prim.x2, y: prim.y2 }
          : { x: prim.x2, y: prim.y2 };

        const distToStart = distance(currentPoint.x, currentPoint.y, startPt.x, startPt.y);
        const distToEnd = distance(currentPoint.x, currentPoint.y, endPt.x, endPt.y);

        if (distToStart < nearestDist) {
          nearestDist = distToStart;
          nearestIndex = i;
          reverseNearest = false;
        }
        if (distToEnd < nearestDist) {
          nearestDist = distToEnd;
          nearestIndex = i;
          reverseNearest = true;
        }
      }

      const selected = remaining.splice(nearestIndex, 1)[0];

      // Reverse if needed (for lines, swap start/end)
      if (reverseNearest && selected.type === 'line') {
        const temp = { x: selected.x1, y: selected.y1 };
        selected.a.x = selected.x2;
        selected.a.y = selected.y2;
        selected.b.x = temp.x;
        selected.b.y = temp.y;

        if (selected.plcData) {
          selected.plcData.x1 = selected.x1;
          selected.plcData.y1 = selected.y1;
          selected.plcData.x2 = selected.x2;
          selected.plcData.y2 = selected.y2;
        }
      }

      optimized.push(selected);

      // Update current point
      currentPoint = selected.type === 'arc'
        ? { x: selected.x2, y: selected.y2 }
        : { x: selected.x2, y: selected.y2 };
    }

    return optimized;
  }

  /**
   * Calculate total travel distance for a path
   */
  static calculateTravelDistance(primitives, startPoint = { x: 0, y: 0 }) {
    let total = 0;
    let current = { ...startPoint };

    for (const prim of primitives) {
      const startPt = { x: prim.x1, y: prim.y1 };
      total += distance(current.x, current.y, startPt.x, startPt.y);

      // Add drawing distance
      if (prim.length) {
        total += prim.length;
      }

      current = { x: prim.x2, y: prim.y2 };
    }

    return total;
  }
}

/**
 * PLC Output Generator - Generate PLC command strings
 */
export class PLCOutputGenerator {
  constructor(config = {}) {
    this.precision = config.precision ?? 2;
    this.separator = config.separator ?? ';';
    this.includeIndex = config.includeIndex ?? true;
  }

  /**
   * Generate PLC commands from primitives
   */
  generate(primitives) {
    const commands = [];

    for (let i = 0; i < primitives.length; i++) {
      const prim = primitives[i];
      const cmd = this.primitiveToCommand(prim, i);
      if (cmd) commands.push(cmd);
    }

    return commands;
  }

  /**
   * Convert single primitive to PLC command
   */
  primitiveToCommand(primitive, index) {
    const data = primitive.plcData || {};
    const fmt = (v) => v.toFixed(this.precision);

    let cmdParts = [];

    if (this.includeIndex) {
      cmdParts.push(index + 1);
    }

    if (primitive.type === 'line') {
      cmdParts.push(
        PLC_TYPES.LINE,
        fmt(data.x1 ?? primitive.x1),
        fmt(data.y1 ?? primitive.y1),
        fmt(data.x2 ?? primitive.x2),
        fmt(data.y2 ?? primitive.y2)
      );
    } else if (primitive.type === 'arc') {
      const type = primitive.isClockwise ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW;
      cmdParts.push(
        type,
        fmt(data.x1 ?? primitive.x1),
        fmt(data.y1 ?? primitive.y1),
        fmt(data.x2 ?? primitive.x2),
        fmt(data.y2 ?? primitive.y2),
        fmt(data.cx ?? primitive.cx),
        fmt(data.cy ?? primitive.cy),
        fmt(data.r ?? primitive.radius)
      );
    } else {
      return null;
    }

    return {
      index: index,
      type: primitive.type,
      command: cmdParts.join(this.separator),
      primitive: primitive
    };
  }

  /**
   * Generate full output text
   */
  generateText(primitives) {
    const commands = this.generate(primitives);
    return commands.map(c => c.command).join('\n');
  }

  /**
   * Parse command string back to primitive data
   */
  parseCommand(commandString) {
    const parts = commandString.split(this.separator);

    if (parts.length < 5) return null;

    const hasIndex = this.includeIndex;
    const offset = hasIndex ? 1 : 0;

    const type = parseInt(parts[offset]);
    const x1 = parseFloat(parts[offset + 1]);
    const y1 = parseFloat(parts[offset + 2]);
    const x2 = parseFloat(parts[offset + 3]);
    const y2 = parseFloat(parts[offset + 4]);

    if (type === PLC_TYPES.LINE) {
      return { type: 'line', x1, y1, x2, y2 };
    } else if (type === PLC_TYPES.ARC_CW || type === PLC_TYPES.ARC_CCW) {
      const cx = parseFloat(parts[offset + 5]);
      const cy = parseFloat(parts[offset + 6]);
      const r = parseFloat(parts[offset + 7]);
      return {
        type: 'arc',
        x1, y1, x2, y2, cx, cy, r,
        dir: type === PLC_TYPES.ARC_CW ? 'CW' : 'CCW'
      };
    }

    return null;
  }
}

export default PrimitiveExtractor;
