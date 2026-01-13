/**
 * Machine Configuration
 * Defines the capabilities and constraints of the CNC machine.
 */
export class MachineConfig {
    constructor() {
        this.name = 'Generic CNC';
        this.type = 'milling'; // milling, laser, plotter
        this.units = 'mm';
        this.safeZ = 5;

        this.limits = {
            x: 300,
            y: 200,
            z: 50,
            feedRate: 2000,
            spindleSpeed: 10000
        };

        this.gcode = {
            dialect: 'grbl', // grbl, marlin, linuxcnc
            precision: 3,
            modal: true
        };
    }

    /**
     * Update machine settings
     * @param {Object} settings 
     */
    update(settings) {
        if (settings.name) this.name = settings.name;
        if (settings.type) this.type = settings.type;
        if (settings.units) this.units = settings.units;
        if (Number.isFinite(settings.safeZ)) this.safeZ = settings.safeZ;

        if (settings.limits) {
            Object.assign(this.limits, settings.limits);
            if (Number.isFinite(settings.limits.safeZ)) {
                this.safeZ = settings.limits.safeZ;
            }
        }

        if (settings.gcode) {
            Object.assign(this.gcode, settings.gcode);
        }
    }

    getSafetyHeight() {
        return Number.isFinite(this.safeZ) ? this.safeZ : 5.0;
    }

    getHomePosition() {
        return { x: 0, y: 0, z: 0 };
    }
}
