/**
 * Modal State Manager
 * Tracks G-code modal state (motion mode, distance mode, plane, units).
 * Based on NIST RS274NGC standard modal groups.
 */

export class ModalState {
    constructor() {
        // Motion mode (Group 1): G0, G1, G2, G3
        this.motion = 0;

        // Feed rate mode (Group 5): G93 (inverse time), G94 (per minute)
        this.feedRateMode = 94;

        // Units (Group 6): G20 (inch), G21 (mm)
        this.units = 21;
        this.unitsScale = 1.0; // 1.0 for mm, 25.4 for inch

        // Distance mode (Group 3): G90 (absolute), G91 (incremental)
        this.distance = 90;

        // Arc distance mode (Group 3.1): G90.1 (absolute IJ), G91.1 (incremental IJ)
        this.arcDistance = 91.1;

        // Plane selection (Group 2): G17 (XY), G18 (XZ), G19 (YZ)
        this.planeSelect = 17;

        // Current position
        this.position = { x: 0, y: 0, z: 0 };

        // Feed rate
        this.feedRate = null;
    }

    /**
     * Update modal state from a parsed G-code command
     * @param {Object} cmd - Parsed command {code, params}
     */
    update(cmd) {
        const code = cmd.code;

        // Motion mode
        if (code === 0 || code === 1 || code === 2 || code === 3) {
            this.motion = code;
        }

        // Distance mode
        if (code === 90) this.distance = 90;
        if (code === 91) this.distance = 91;

        // Arc distance mode
        if (code === 90.1) this.arcDistance = 90.1;
        if (code === 91.1) this.arcDistance = 91.1;

        // Plane selection
        if (code === 17) this.planeSelect = 17;
        if (code === 18) this.planeSelect = 18;
        if (code === 19) this.planeSelect = 19;

        // Units
        if (code === 20) {
            this.units = 20;
            this.unitsScale = 25.4;
        }
        if (code === 21) {
            this.units = 21;
            this.unitsScale = 1.0;
        }

        // Feed rate mode
        if (code === 93) this.feedRateMode = 93;
        if (code === 94) this.feedRateMode = 94;

        // Update position from params
        if (cmd.params) {
            if (this.distance === 90) {
                // Absolute
                if (cmd.params.x !== undefined) this.position.x = cmd.params.x;
                if (cmd.params.y !== undefined) this.position.y = cmd.params.y;
                if (cmd.params.z !== undefined) this.position.z = cmd.params.z;
            } else {
                // Incremental
                if (cmd.params.x !== undefined) this.position.x += cmd.params.x;
                if (cmd.params.y !== undefined) this.position.y += cmd.params.y;
                if (cmd.params.z !== undefined) this.position.z += cmd.params.z;
            }

            if (cmd.params.f !== undefined) this.feedRate = cmd.params.f;
        }
    }

    /**
     * Get axis mapping for current plane
     * @returns {Object} {axis0, axis1, linear} - Primary, secondary, and linear axis
     */
    getAxes() {
        switch (this.planeSelect) {
            case 17: return { axis0: 'x', axis1: 'y', linear: 'z' }; // XY plane
            case 18: return { axis0: 'x', axis1: 'z', linear: 'y' }; // XZ plane
            case 19: return { axis0: 'y', axis1: 'z', linear: 'x' }; // YZ plane
            default: return { axis0: 'x', axis1: 'y', linear: 'z' };
        }
    }

    /**
     * Check if arc IJ offsets are incremental (default) or absolute
     * @returns {boolean}
     */
    isArcIncremental() {
        return this.arcDistance === 91.1;
    }

    /**
     * Clone current state
     * @returns {ModalState}
     */
    clone() {
        const copy = new ModalState();
        copy.motion = this.motion;
        copy.feedRateMode = this.feedRateMode;
        copy.units = this.units;
        copy.unitsScale = this.unitsScale;
        copy.distance = this.distance;
        copy.arcDistance = this.arcDistance;
        copy.planeSelect = this.planeSelect;
        copy.position = { ...this.position };
        copy.feedRate = this.feedRate;
        return copy;
    }
}
