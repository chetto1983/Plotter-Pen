/**
 * Toolpath Generator
 * Orchestrates the generation of toolpaths from geometries and operations.
 */
import { GCodeGenerator } from './GCodeGenerator.js';
import { MachineConfig } from './MachineConfig.js';
import { generatePocket } from './strategies/pocketing.js';
import { generateProfile } from './strategies/profiling.js';

export class ToolpathGenerator {
    constructor(machineConfig, toolLibrary) {
        this.machine = machineConfig || new MachineConfig();
        this.tools = toolLibrary;
        this.gcode = new GCodeGenerator();
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
        this.pathsToGCode(paths, op.feedRate || tool.defaults.feedXY, op.plungeRate || tool.defaults.feedZ);

        // Retract after operation
        this.gcode.addRapid(null, null, this.machine.getSafetyHeight());
    }

    pathsToGCode(paths, feedXY, feedZ) {
        for (const path of paths) {
            // Skips empty paths
            if (!path || path.length === 0) continue;

            const start = path[0];

            // Rapid to start position (stay at safe height first)
            this.gcode.addRapid(start.x, start.y);

            // Plunge
            for (let i = 0; i < path.length; i++) {
                const pt = path[i];

                // CRITICAL SAFETY CHECK
                if (pt.z === undefined || pt.z === null || isNaN(pt.z)) {
                    throw new Error(`ToolpathGenerator: Invalid Z coordinate at point ${i}`);
                }

                if (i === 0) {
                    // First point: Plunge from Safe Z to Start Z
                    this.gcode.addLinear(pt.x, pt.y, pt.z, feedZ);
                } else {
                    // Cutting move
                    this.gcode.addLinear(pt.x, pt.y, pt.z, feedXY);
                }
            }

            // Retract after path is complete
            this.gcode.addRapid(null, null, this.machine.getSafetyHeight());
        }
    }
}
