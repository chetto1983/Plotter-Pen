/**
 * Toolpath Generator
 * Orchestrates the generation of toolpaths from geometries and operations.
 */
import { GCodeGenerator } from './GCodeGenerator.js';
import { MachineConfig } from './MachineConfig.js';
import { generatePocket } from './strategies/pocketing.js';
import { generateProfile } from './strategies/profiling.js';
import { PrimitiveExtractor } from '../plc/PrimitiveExtractor.js';

export class ToolpathGenerator {
    constructor(machineConfig, toolLibrary) {
        this.machine = machineConfig || new MachineConfig();
        this.tools = toolLibrary;
        this.gcode = new GCodeGenerator();
        this.primitiveExtractor = new PrimitiveExtractor();
    }

    /**
     * Generate G-Code for a job
     * @param {Object} job - Contains operations and preferences
     */
    generateJob(job) {
        this.gcode.clear();
        this.gcode.generateHeader();

        // Initial safety move
        this.gcode.addComment('Safety Move');
        this.gcode.addRapid(null, null, this.machine.getSafetyHeight());

        for (const op of job.operations) {
            this.processOperation(op);
        }

        this.gcode.generateFooter();
        return this.gcode.getCode();
    }

    processOperation(op) {
        this.gcode.addComment(`Operation: ${op.name} (${op.type})`);

        const tool = this.tools.getTool(op.toolId);
        if (!tool) {
            console.error(`Tool ID ${op.toolId} not found`);
            this.gcode.addComment(`ERROR: Tool ${op.toolId} not found`);
            return;
        }

        // Tool Change logic (if supported)
        this.gcode.addComment(`Tool: ${tool.name} (D=${tool.diameter})`);
        // this.gcode.addToolChange(op.toolId); 

        // Set Spindle
        this.gcode.setSpindle(true, op.spindleSpeed || tool.defaults.spindleRPM);

        let paths = [];

        // Delegate to specific strategy
        switch (op.type) {
            case 'pocket':
                paths = generatePocket(op, tool, this.machine);
                break;
            case 'profile':
            case 'contour':
                paths = generateProfile(op, tool, this.machine);
                break;
            default:
                this.gcode.addComment(`Unknown operation type: ${op.type}`);
        }

        // Convert paths to G-Code movements
        const allowArcFit = op.type !== 'pocket' && op.disableArcFit !== true;
        this.pathsToGCode(
            paths,
            op.feedRate || tool.defaults.feedXY,
            op.plungeRate || tool.defaults.feedZ,
            { allowArcFit }
        );

        // Retract after operation
        this.gcode.addRapid(null, null, this.machine.getSafetyHeight());
    }

    pathsToGCode(paths, feedXY, feedZ, options = {}) {
        const allowArcFit = options.allowArcFit !== false;
        for (const path of paths) {
            if (path && !Array.isArray(path) && path.arc) {
                this.emitArcPath(path.arc, path.z, feedXY, feedZ);
                continue;
            }

            // Skips empty paths
            if (!path || path.length === 0) continue;

            const pathZ = this.getFlatPathZ(path);
            const primitives = allowArcFit && pathZ !== null
                ? this.extractPrimitives(path)
                : [];

            if (primitives.length > 0 && pathZ !== null) {
                this.emitPrimitives(primitives, pathZ, feedXY, feedZ);
            } else {
                this.emitLinearPath(path, feedXY, feedZ);
            }
        }
    }

    emitLinearPath(path, feedXY, feedZ) {
        const start = path[0];

        this.gcode.addRapid(start.x, start.y);

        for (let i = 0; i < path.length; i++) {
            const pt = path[i];

            if (pt.z === undefined || pt.z === null || isNaN(pt.z)) {
                throw new Error(`ToolpathGenerator: Invalid Z coordinate at point ${i}`);
            }

            if (i === 0) {
                this.gcode.addLinear(pt.x, pt.y, pt.z, feedZ);
            } else {
                this.gcode.addLinear(pt.x, pt.y, pt.z, feedXY);
            }
        }

        this.gcode.addRapid(null, null, this.machine.getSafetyHeight());
    }

    emitPrimitives(primitives, z, feedXY, feedZ) {
        if (!primitives || primitives.length === 0) return;

        const first = primitives[0];
        let start = this.getPrimitiveStart(first);
        if (!start) return;

        this.gcode.addRapid(start.x, start.y);
        this.gcode.addLinear(start.x, start.y, z, feedZ);

        let current = { x: start.x, y: start.y };

        for (const primitive of primitives) {
            let primStart, primEnd;

            if (primitive.type === 'line') {
                primStart = { x: primitive.x1, y: primitive.y1 };
                primEnd = { x: primitive.x2, y: primitive.y2 };

                // Connectivity check (similar to PLC needsJump)
                if (Math.hypot(primStart.x - current.x, primStart.y - current.y) > 0.001) {
                    this.gcode.addLinear(primStart.x, primStart.y, z, feedXY);
                }

                this.gcode.addLinear(primEnd.x, primEnd.y, z, feedXY);
                current = primEnd;

            } else if (primitive.type === 'arc') {
                primStart = { x: primitive.x1, y: primitive.y1 };
                primEnd = { x: primitive.x2, y: primitive.y2 };

                // Center can be on primitive or plcData
                const cx = primitive.cx ?? primitive.plcData?.cx;
                const cy = primitive.cy ?? primitive.plcData?.cy;
                const center = { x: cx, y: cy };

                // Strict Connectivity check
                if (Math.hypot(primStart.x - current.x, primStart.y - current.y) > 0.0001) {
                    this.gcode.addLinear(primStart.x, primStart.y, z, feedXY);
                }
                current = primStart;

                // Robust I/J calculation: Center - Start
                // (Since we are at strict primStart, this relative offset is accurate)
                const i = center.x - primStart.x;
                const j = center.y - primStart.y;

                // Split large arcs (> 180 degrees) for maximum compatibility
                const sweep = Math.abs(primitive.sweep ?? primitive._sweep ?? 0);
                if (sweep > Math.PI + 0.001) {
                    // Calculate midpoint
                    const midAngle = (primitive.startAngle ?? 0) + (primitive.sweep ?? 0) / 2;
                    const radius = primitive.radius ?? Math.hypot(i, j);
                    const midX = center.x + radius * Math.cos(midAngle);
                    const midY = center.y + radius * Math.sin(midAngle);

                    // First Half
                    const i1 = center.x - primStart.x;
                    const j1 = center.y - primStart.y;
                    this.gcode.addArc(midX, midY, i1, j1, primitive.isClockwise === true, feedXY);

                    // Second Half
                    const i2 = center.x - midX;
                    const j2 = center.y - midY;
                    this.gcode.addArc(primEnd.x, primEnd.y, i2, j2, primitive.isClockwise === true, feedXY);

                    current = primEnd;
                } else {
                    this.gcode.addArc(primEnd.x, primEnd.y, i, j, primitive.isClockwise === true, feedXY);
                    current = primEnd;
                }
            }
        }

        // Retract at end of chain
        this.gcode.addRapid(null, null, this.machine.getSafetyHeight());
    }

    emitArcPath(arcData, z, feedXY, feedZ) {
        if (!arcData || typeof z !== 'number') {
            return;
        }

        const start = { x: arcData.x1, y: arcData.y1 };
        const end = { x: arcData.x2, y: arcData.y2 };
        const center = { x: arcData.cx, y: arcData.cy };

        if (![start.x, start.y, end.x, end.y, center.x, center.y].every(v => typeof v === 'number')) {
            return;
        }

        this.gcode.addRapid(start.x, start.y);
        this.gcode.addLinear(start.x, start.y, z, feedZ);

        const i = center.x - start.x;
        const j = center.y - start.y;
        const clockwise = arcData.clockwise === true;

        this.gcode.addArc(end.x, end.y, i, j, clockwise, feedXY);
        this.gcode.addRapid(null, null, this.machine.getSafetyHeight());
    }

    getPrimitiveStart(primitive) {
        if (!primitive) {
            return null;
        }

        if (primitive.type === 'line' || primitive.type === 'arc') {
            return { x: primitive.x1, y: primitive.y1 };
        }

        return null;
    }

    getFlatPathZ(path) {
        const first = path[0];
        if (!first || typeof first.z !== 'number') {
            return null;
        }

        const z = first.z;
        for (const pt of path) {
            if (typeof pt.z !== 'number') {
                return null;
            }
            if (Math.abs(pt.z - z) > 1e-4) {
                return null;
            }
        }

        return z;
    }

    extractPrimitives(path) {
        const points = path.map(pt => ({ x: pt.x, y: pt.y }));
        if (points.length < 2) {
            return [];
        }

        return this.primitiveExtractor.detectPrimitives(points, 0);
    }
}
