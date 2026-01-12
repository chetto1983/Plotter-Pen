/**
 * Machine Configuration
 * Defines the capabilities and constraints of the CNC machine.
 */
export class MachineConfig {
    constructor() {
        this.name = 'Generic CNC';
        this.type = 'milling'; // milling, laser, plotter
        this.units = 'mm';

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

        if (settings.limits) {
            Object.assign(this.limits, settings.limits);
        }

        if (settings.gcode) {
            Object.assign(this.gcode, settings.gcode);
        }
    }

    getSafetyHeight() {
        return 5.0; // mm
    }

    getHomePosition() {
        return { x: 0, y: 0, z: 0 };
    }
}
