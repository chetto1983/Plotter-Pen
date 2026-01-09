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
      info.throughPoint || null,  // throughPoint - auto-detect if not provided
      `arc_${id}`                 // id
    );

    // Add PLC-specific data (robot post-processor style: end point + center)
    arc.plcData = {
      type: arc.sweep < 0 ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW,
      x1: info.start.x,
      y1: info.start.y,
      x2: info.end.x,
      y2: info.end.y,
      cx: info.center.x,
      cy: info.center.y
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

      // Robot post-processor style: end point + center (no radius/direction)
      arc.plcData = {
        type: arc.sweep < 0 ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW,
        x1: arc.x1,
        y1: arc.y1,
        x2: arc.x2,
        y2: arc.y2,
        cx: arc.cx,
        cy: arc.cy
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
        let startPt, endPt;

        if (prim.type === 'circle') {
          // Circle starts and ends at same point (right side)
          const cx = prim.cx ?? prim.center?.x;
          const cy = prim.cy ?? prim.center?.y;
          const r = prim.radius ?? prim._radius;
          startPt = { x: cx + r, y: cy };
          endPt = startPt;  // Circle is closed
        } else {
          startPt = { x: prim.x1, y: prim.y1 };
          endPt = { x: prim.x2, y: prim.y2 };
        }

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

      // Reverse if needed
      if (reverseNearest) {
        if (selected.type === 'line') {
          // For lines, swap start/end
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
        } else if (selected.type === 'arc') {
          // For arcs, swap start/end - the through point stays same but sweep reverses
          const tempA = { x: selected.a.x, y: selected.a.y };
          selected.a.x = selected.b.x;
          selected.a.y = selected.b.y;
          selected.b.x = tempA.x;
          selected.b.y = tempA.y;

          // The through point stays at same position geometrically
          // Re-sync geometry to recalculate sweep
          selected.syncGeometry();

          if (selected.plcData) {
            selected.plcData.x1 = selected.x1;
            selected.plcData.y1 = selected.y1;
            selected.plcData.x2 = selected.x2;
            selected.plcData.y2 = selected.y2;
            selected.plcData.type = selected.sweep < 0 ? PLC_TYPES.ARC_CW : PLC_TYPES.ARC_CCW;
          }
        }
      }

      optimized.push(selected);

      // Update current point
      if (selected.type === 'circle') {
        // Circle ends where it started
        const cx = selected.cx ?? selected.center?.x;
        const cy = selected.cy ?? selected.center?.y;
        const r = selected.radius ?? selected._radius;
        currentPoint = { x: cx + r, y: cy };
      } else {
        currentPoint = { x: selected.x2, y: selected.y2 };
      }
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
 * Generates human-readable PLC commands for plotter
 */
export class PLCOutputGenerator {
  constructor(config = {}) {
    this.precision = config.precision ?? 3;
    this.includeZMovements = config.includeZMovements ?? true;
  }

  /**
   * Generate PLC commands from primitives with Z movements
   */
  generate(primitives) {
    const commands = [];
    let lastPoint = { x: 0, y: 0 };

    for (let i = 0; i < primitives.length; i++) {
      const prim = primitives[i];
      const data = prim.plcData || {};

      // Get start point - circles start at right side (cx + r, cy)
      let x1, y1;
      if (prim.type === 'circle') {
        const cx = data.cx ?? prim.cx ?? prim.center?.x;
        const cy = data.cy ?? prim.cy ?? prim.center?.y;
        const r = data.r ?? prim.radius ?? prim._radius;
        x1 = cx + r;
        y1 = cy;
      } else {
        x1 = data.x1 ?? prim.x1;
        y1 = data.y1 ?? prim.y1;
      }

      // Check if we need a jump to the start point
      const needsJump = Math.abs(lastPoint.x - x1) > 0.01 || Math.abs(lastPoint.y - y1) > 0.01;

      if (needsJump && this.includeZMovements) {
        // Pen up
        commands.push({
          index: commands.length,
          type: 'Z_up',
          command: 'Z_UP',
          primitive: null
        });

        // Jump to start point
        commands.push({
          index: commands.length,
          type: 'waypoint',
          command: `J X ${x1.toFixed(this.precision)}, Y ${y1.toFixed(this.precision)}, Z 1`,
          primitive: null
        });

        // Pen down
        commands.push({
          index: commands.length,
          type: 'Z_down',
          command: 'Z_DW',
          primitive: null
        });
      }

      // Add the drawing command(s)
      const cmd = this.primitiveToCommand(prim, commands.length);
      if (cmd) {
        // Circle returns an array of commands
        if (Array.isArray(cmd)) {
          commands.push(...cmd);
          // Circle ends where it started (closed shape)
          lastPoint = { x: x1, y: y1 };
        } else {
          commands.push(cmd);
          // Update last point to end of this primitive
          lastPoint = { x: data.x2 ?? prim.x2, y: data.y2 ?? prim.y2 };
        }
      }
    }

    // Final pen up
    if (this.includeZMovements && commands.length > 0) {
      commands.push({
        index: commands.length,
        type: 'Z_up',
        command: 'Z_UP',
        primitive: null
      });
    }

    return commands;
  }

  /**
   * Convert single primitive to PLC command
   */
  primitiveToCommand(primitive, index) {
    const data = primitive.plcData || {};
    const fmt = (v) => v.toFixed(this.precision);

    let command = '';

    if (primitive.type === 'line') {
      const x2 = data.x2 ?? primitive.x2;
      const y2 = data.y2 ?? primitive.y2;
      command = `L X ${fmt(x2)}, Y ${fmt(y2)}`;
    } else if (primitive.type === 'arc') {
      // Robot post-processor style: end point (X, Y) + aux point on arc (I, J)
      const x2 = data.x2 ?? primitive.x2;
      const y2 = data.y2 ?? primitive.y2;

      // Use the through point if available (from 3-point arc creation), otherwise calculate midpoint
      let auxX, auxY;
      //console.log('DEBUG: _throughPoint =', primitive._throughPoint, 'midpoint =', primitive.midpoint);
      if (primitive._throughPoint) {
        // Use the through point - this is exactly on the arc where user clicked
        auxX = primitive._throughPoint.x;
        auxY = primitive._throughPoint.y;
        //console.log('DEBUG: Using _throughPoint:', auxX, auxY);
      } else if (primitive.midpoint && typeof primitive.midpoint.x === 'number') {
        // Arc class has midpoint getter - use it directly
        auxX = primitive.midpoint.x;
        auxY = primitive.midpoint.y;
        //console.log('DEBUG: Using midpoint:', auxX, auxY);
      } else {
        // Fallback: calculate from available data
        const cx = primitive.cx ?? data.cx;
        const cy = primitive.cy ?? data.cy;
        const x1 = data.x1 ?? primitive.x1;
        const y1 = data.y1 ?? primitive.y1;
        const radius = primitive.radius ?? Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
        const startAngle = primitive.startAngle ?? Math.atan2(y1 - cy, x1 - cx);
        const sweep = primitive.sweep ?? primitive._sweep;

        if (sweep !== undefined) {
          const midAngle = startAngle + sweep / 2;
          auxX = cx + radius * Math.cos(midAngle);
          auxY = cy + radius * Math.sin(midAngle);
        } else {
          // Last resort: use center point (this will be wrong but at least won't crash)
          auxX = cx;
          auxY = cy;
        }
      }

      command = `A X ${fmt(x2)}, Y ${fmt(y2)}, I ${fmt(auxX)}, J ${fmt(auxY)}`;
    } else if (primitive.type === 'circle') {
      // Circle is drawn as two semicircular arcs (robot 3-point style)
      // This method returns an array of commands for circles
      return this.circleToCommands(primitive, index);
    } else {
      return null;
    }

    return {
      index: index,
      type: primitive.type,
      command: command,
      primitive: primitive
    };
  }

  /**
   * Convert circle to two arc commands (robot 3-point style)
   * A circle is split into two 180° arcs
   */
  circleToCommands(primitive, startIndex) {
    const data = primitive.plcData || {};
    const fmt = (v) => v.toFixed(this.precision);

    const cx = data.cx ?? primitive.cx ?? primitive.center?.x;
    const cy = data.cy ?? primitive.cy ?? primitive.center?.y;
    const r = data.r ?? primitive.radius ?? primitive._radius;

    // Circle split into two semicircles:
    // Start point: right side (cx + r, cy)
    // Middle point: left side (cx - r, cy)
    // End point: back to start (cx + r, cy)

    const startX = cx + r;
    const startY = cy;
    const midX = cx - r;
    const midY = cy;

    // Aux points for each semicircle (top and bottom of circle)
    const aux1X = cx;
    const aux1Y = cy - r;  // Top of circle (first arc goes up)
    const aux2X = cx;
    const aux2Y = cy + r;  // Bottom of circle (second arc goes down)

    // Return array of two arc commands
    return [
      {
        index: startIndex,
        type: 'arc',
        command: `A X ${fmt(midX)}, Y ${fmt(midY)}, I ${fmt(aux1X)}, J ${fmt(aux1Y)}`,
        primitive: primitive,
        isCirclePart: 1
      },
      {
        index: startIndex + 1,
        type: 'arc',
        command: `A X ${fmt(startX)}, Y ${fmt(startY)}, I ${fmt(aux2X)}, J ${fmt(aux2Y)}`,
        primitive: primitive,
        isCirclePart: 2
      }
    ];
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
    const cmd = commandString.trim();

    if (cmd === 'Z_UP') {
      return { type: 'Z_up' };
    }
    if (cmd === 'Z_DW') {
      return { type: 'Z_down' };
    }

    // Parse waypoint: J X 100.000, Y 200.000, Z 1
    const waypointMatch = cmd.match(/^J\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+),\s*Z\s+([\d.-]+)$/);
    if (waypointMatch) {
      return {
        type: 'waypoint',
        x: parseFloat(waypointMatch[1]),
        y: parseFloat(waypointMatch[2]),
        z: parseFloat(waypointMatch[3])
      };
    }

    // Parse line: L X 100.000, Y 200.000
    const lineMatch = cmd.match(/^L\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+)$/);
    if (lineMatch) {
      return {
        type: 'line',
        x2: parseFloat(lineMatch[1]),
        y2: parseFloat(lineMatch[2])
      };
    }

    // Parse arc: A X 100.000, Y 200.000, I 50.000, J 75.000 (robot post-processor style)
    // I, J are the aux point coordinates (point on arc that defines the bulge)
    const arcMatch = cmd.match(/^A\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+),\s*I\s+([\d.-]+),\s*J\s+([\d.-]+)$/);
    if (arcMatch) {
      return {
        type: 'arc',
        x2: parseFloat(arcMatch[1]),
        y2: parseFloat(arcMatch[2]),
        auxX: parseFloat(arcMatch[3]),  // aux point X (point on arc)
        auxY: parseFloat(arcMatch[4])   // aux point Y (point on arc)
      };
    }

    // Parse circle: C X 100.000, Y 200.000, R 50.000
    const circleMatch = cmd.match(/^C\s+X\s+([\d.-]+),\s*Y\s+([\d.-]+),\s*R\s+([\d.-]+)$/);
    if (circleMatch) {
      return {
        type: 'circle',
        cx: parseFloat(circleMatch[1]),
        cy: parseFloat(circleMatch[2]),
        r: parseFloat(circleMatch[3])
      };
    }

    return null;
  }
}

export default PrimitiveExtractor;
