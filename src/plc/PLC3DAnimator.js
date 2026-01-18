/**
 * PLC3DAnimator - Parses PLC commands and animates tool movement
 * Handles J (jump/rapid), L (line/cut), A (arc), WAIT commands
 */

export class PLC3DAnimator {
    constructor(simulator) {
        this.sim = simulator;
        this.commands = [];
        this.parsedCommands = [];
        this.currentIndex = 0;
        this.position = { x: 0, y: 0, z: 0 };
        this.animationId = null;
        this.isPlaying = false;
        this.speed = 1.0;
        this.onUpdate = null;
        this.onComplete = null;

        // Animation state
        this.segmentProgress = 0;
        this.segmentStart = null;
        this.segmentEnd = null;
        this.segmentType = null;
        this.lastTimestamp = null;

        // Arc state (midpoint is absolute coordinate ON the arc)
        this.arcMid = null;
        this.arcCenter = null;
        this.arcRadius = 0;
        this.arcStartAngle = 0;
        this.arcEndAngle = 0;
        this.arcClockwise = false;

        // Live trail points (for real-time drawing)
        this.liveTrailPoints = null;
    }

    /**
     * Load PLC commands for animation
     * @param {string[]} commands - Array of PLC command strings
     */
    load(commands) {
        this.stop();
        this.commands = commands;
        this.parsedCommands = commands.map(cmd => this.parseCommand(cmd)).filter(Boolean);
        this.currentIndex = 0;

        // Start tool at first command position (not origin) to avoid long initial rapid
        const firstCmd = this.parsedCommands.find(c => c.type !== 'WAIT');
        if (firstCmd) {
            this.position = { x: firstCmd.x, y: firstCmd.y, z: firstCmd.z };
            this.sim.setToolPosition(firstCmd.x, firstCmd.y, firstCmd.z);
            // Skip first command since we're starting there
            this.currentIndex = this.parsedCommands.indexOf(firstCmd) + 1;
        } else {
            this.position = { x: 0, y: 0, z: 0 };
            this.sim.setToolPosition(0, 0, 0);
        }

        this.sim.clearTrail();
        this.sim.fitToView(this.calculateBounds());
    }

    /**
     * Parse a single PLC command
     * Format: "J X 0.000, Y 0.000, Z 5.000, V 1000.000"
     *         "L X 0.000, Y 0.000, Z -2.000, V 100.000"
     *         "A X 10.000, Y 5.000, Z -2.000, I 5.000, J 2.500, V 100.000"
     *         "WAIT 200"
     */
    parseCommand(line) {
        if (!line || typeof line !== 'string') return null;
        line = line.trim();

        // WAIT command
        if (line.startsWith('WAIT')) {
            const match = line.match(/WAIT\s+(\d+)/);
            if (match) {
                return { type: 'WAIT', duration: parseInt(match[1], 10) };
            }
            return null;
        }

        // J/L/A commands
        const regex = /^([JLA])\s+X\s*([-\d.]+),\s*Y\s*([-\d.]+)(?:,\s*Z\s*([-\d.]+))?(?:,\s*I\s*([-\d.]+),\s*J\s*([-\d.]+))?(?:,\s*V\s*([-\d.]+))?/;
        const match = line.match(regex);

        if (!match) return null;

        const cmd = {
            type: match[1],
            x: parseFloat(match[2]),
            y: parseFloat(match[3]),
            z: match[4] !== undefined ? parseFloat(match[4]) : this.position.z,
            speed: match[7] !== undefined ? parseFloat(match[7]) : 100
        };

        // Arc midpoint (I, J)
        if (match[5] !== undefined && match[6] !== undefined) {
            cmd.midX = parseFloat(match[5]);
            cmd.midY = parseFloat(match[6]);
        }

        return cmd;
    }

    /**
     * Calculate bounding box of all commands (including arc extents)
     */
    calculateBounds() {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const cmd of this.parsedCommands) {
            if (cmd.type === 'WAIT') continue;

            minX = Math.min(minX, cmd.x);
            minY = Math.min(minY, cmd.y);
            minZ = Math.min(minZ, cmd.z);
            maxX = Math.max(maxX, cmd.x);
            maxY = Math.max(maxY, cmd.y);
            maxZ = Math.max(maxZ, cmd.z);

            // Include arc midpoint in bounds
            if (cmd.type === 'A' && cmd.midX !== undefined) {
                minX = Math.min(minX, cmd.midX);
                minY = Math.min(minY, cmd.midY);
                maxX = Math.max(maxX, cmd.midX);
                maxY = Math.max(maxY, cmd.midY);
            }
        }

        return {
            minX: isFinite(minX) ? minX : 0,
            minY: isFinite(minY) ? minY : 0,
            minZ: isFinite(minZ) ? minZ : 0,
            maxX: isFinite(maxX) ? maxX : 500,
            maxY: isFinite(maxY) ? maxY : 500,
            maxZ: isFinite(maxZ) ? maxZ : 50
        };
    }

    /** Calculate circle center from 3 points using perpendicular bisector */
    calculateArcCenter(p1, p2, p3) {
        const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(d) < EPSILON) return null;
        const aSq = ax * ax + ay * ay, bSq = bx * bx + by * by, cSq = cx * cx + cy * cy;
        const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
        const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;
        return { cx: centerX, cy: centerY, radius: Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2) };
    }

    /** Determine arc direction based on 3 points (cross product sign) */
    isArcClockwise(start, mid, end) {
        return (mid.x - start.x) * (end.y - start.y) - (mid.y - start.y) * (end.x - start.x) < 0;
    }

    /**
     * Interpolate position along arc at parameter t (0 to 1)
     */
    interpolateArc(t) {
        if (!this.arcCenter) {
            // Fallback to linear if arc calc failed
            return {
                x: this.segmentStart.x + (this.segmentEnd.x - this.segmentStart.x) * t,
                y: this.segmentStart.y + (this.segmentEnd.y - this.segmentStart.y) * t,
                z: this.segmentStart.z + (this.segmentEnd.z - this.segmentStart.z) * t
            };
        }

        // Interpolate angle
        let angle;
        if (this.arcClockwise) {
            // CW: startAngle → endAngle (decreasing)
            let sweep = this.arcStartAngle - this.arcEndAngle;
            if (sweep < 0) sweep += 2 * Math.PI;
            angle = this.arcStartAngle - sweep * t;
        } else {
            // CCW: startAngle → endAngle (increasing)
            let sweep = this.arcEndAngle - this.arcStartAngle;
            if (sweep < 0) sweep += 2 * Math.PI;
            angle = this.arcStartAngle + sweep * t;
        }

        // Calculate position on arc
        const x = this.arcCenter.cx + this.arcRadius * Math.cos(angle);
        const y = this.arcCenter.cy + this.arcRadius * Math.sin(angle);
        // Z interpolates linearly
        const z = this.segmentStart.z + (this.segmentEnd.z - this.segmentStart.z) * t;

        return { x, y, z };
    }

    /**
     * Start or resume animation
     */
    play() {
        if (this.isPlaying) return;
        if (this.currentIndex >= this.parsedCommands.length) {
            // Reset to first command position when replaying
            this.sim.clearTrail();
            const firstCmd = this.parsedCommands.find(c => c.type !== 'WAIT');
            if (firstCmd) {
                this.currentIndex = this.parsedCommands.indexOf(firstCmd) + 1;
                this.position = { x: firstCmd.x, y: firstCmd.y, z: firstCmd.z };
                this.sim.setToolPosition(firstCmd.x, firstCmd.y, firstCmd.z);
            } else {
                this.currentIndex = 0;
                this.position = { x: 0, y: 0, z: 0 };
            }
        }

        this.isPlaying = true;
        this.lastTimestamp = null;
        this.segmentProgress = 0;
        this.prepareNextSegment();
        this.animationId = requestAnimationFrame((t) => this.animate(t));
    }

    /**
     * Pause animation
     */
    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Stop and reset animation
     */
    stop() {
        this.pause();
        this.segmentProgress = 0;
        this.sim.clearTrail();

        // Reset to first command position (not origin)
        const firstCmd = this.parsedCommands.find(c => c.type !== 'WAIT');
        if (firstCmd) {
            this.currentIndex = this.parsedCommands.indexOf(firstCmd) + 1;
            this.position = { x: firstCmd.x, y: firstCmd.y, z: firstCmd.z };
            this.sim.setToolPosition(firstCmd.x, firstCmd.y, firstCmd.z);
        } else {
            this.currentIndex = 0;
            this.position = { x: 0, y: 0, z: 0 };
            this.sim.setToolPosition(0, 0, 0);
        }
    }

    /**
     * Step to next command
     */
    step() {
        if (this.currentIndex >= this.parsedCommands.length) return;

        const cmd = this.parsedCommands[this.currentIndex];
        if (!cmd || cmd.type === 'WAIT') {
            this.currentIndex++;
            this.step();
            return;
        }

        // Execute full segment instantly
        const from = { ...this.position };
        const to = { x: cmd.x, y: cmd.y, z: cmd.z };

        if (cmd.type === 'A' && cmd.midX !== undefined) {
            // Arc step - calculate and draw arc
            const mid = { x: cmd.midX, y: cmd.midY };
            const center = this.calculateArcCenter(from, mid, to);
            if (center) {
                const startAngle = Math.atan2(from.y - center.cy, from.x - center.cx);
                const endAngle = Math.atan2(to.y - center.cy, to.x - center.cx);
                const clockwise = this.isArcClockwise(from, mid, to);
                this.sim.addArcTrailSegment(from, to, center, center.radius, startAngle, endAngle, clockwise);
            } else {
                // Fallback to line if collinear
                this.sim.addTrailSegment(from, to, false);
            }
        } else {
            this.sim.addTrailSegment(from, to, cmd.type === 'J');
        }

        this.position = to;
        this.sim.setToolPosition(to.x, to.y, to.z);

        this.currentIndex++;
        this.onUpdate?.(this.currentIndex, this.parsedCommands.length);

        if (this.currentIndex >= this.parsedCommands.length) {
            this.onComplete?.();
        }
    }

    /**
     * Prepare next segment for animation
     */
    prepareNextSegment() {
        if (this.currentIndex >= this.parsedCommands.length) {
            this.isPlaying = false;
            this.onComplete?.();
            return false;
        }

        const cmd = this.parsedCommands[this.currentIndex];

        if (cmd.type === 'WAIT') {
            this.segmentType = 'WAIT';
            this.waitRemaining = cmd.duration;
            return true;
        }

        this.segmentStart = { ...this.position };
        this.segmentEnd = { x: cmd.x, y: cmd.y, z: cmd.z };
        this.segmentType = cmd.type;
        this.segmentSpeed = cmd.speed;
        this.segmentProgress = 0;

        // Reset arc state
        this.arcMid = null;
        this.arcCenter = null;

        // Calculate segment length for timing
        if (cmd.type === 'A' && cmd.midX !== undefined) {
            // Arc: calculate center and arc length
            this.arcMid = { x: cmd.midX, y: cmd.midY };
            const center = this.calculateArcCenter(
                this.segmentStart,
                this.arcMid,
                this.segmentEnd
            );

            if (center) {
                this.arcCenter = center;
                this.arcRadius = center.radius;
                this.arcStartAngle = Math.atan2(
                    this.segmentStart.y - center.cy,
                    this.segmentStart.x - center.cx
                );
                this.arcEndAngle = Math.atan2(
                    this.segmentEnd.y - center.cy,
                    this.segmentEnd.x - center.cx
                );
                this.arcClockwise = this.isArcClockwise(
                    this.segmentStart,
                    this.arcMid,
                    this.segmentEnd
                );

                // Arc length = radius * sweep angle
                let sweep = this.arcClockwise
                    ? this.arcStartAngle - this.arcEndAngle
                    : this.arcEndAngle - this.arcStartAngle;
                if (sweep < 0) sweep += 2 * Math.PI;
                this.segmentLength = this.arcRadius * sweep;
            } else {
                // Fallback to linear distance if collinear
                const dx = this.segmentEnd.x - this.segmentStart.x;
                const dy = this.segmentEnd.y - this.segmentStart.y;
                const dz = this.segmentEnd.z - this.segmentStart.z;
                this.segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
        } else {
            // Linear: straight line distance
            const dx = this.segmentEnd.x - this.segmentStart.x;
            const dy = this.segmentEnd.y - this.segmentStart.y;
            const dz = this.segmentEnd.z - this.segmentStart.z;
            this.segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        return true;
    }

    /**
     * Animation loop
     */
    animate(timestamp) {
        if (!this.isPlaying) return;

        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }

        const deltaTime = (timestamp - this.lastTimestamp) * this.speed;
        this.lastTimestamp = timestamp;

        // Handle WAIT
        if (this.segmentType === 'WAIT') {
            this.waitRemaining -= deltaTime;
            if (this.waitRemaining <= 0) {
                this.currentIndex++;
                this.onUpdate?.(this.currentIndex, this.parsedCommands.length);
                if (!this.prepareNextSegment()) return;
            }
            this.animationId = requestAnimationFrame((t) => this.animate(t));
            return;
        }

        // Calculate progress based on speed (mm/s) and time (ms)
        if (this.segmentLength > EPSILON) {
            const distancePerMs = this.segmentSpeed / 1000;
            const progressIncrement = (distancePerMs * deltaTime) / this.segmentLength;
            this.segmentProgress += progressIncrement;
        } else {
            this.segmentProgress = 1;
        }

        // Interpolate position (arc or linear)
        const t = Math.min(1, this.segmentProgress);
        let pos;
        if (this.segmentType === 'A' && this.arcCenter) {
            pos = this.interpolateArc(t);
        } else {
            pos = {
                x: this.segmentStart.x + (this.segmentEnd.x - this.segmentStart.x) * t,
                y: this.segmentStart.y + (this.segmentEnd.y - this.segmentStart.y) * t,
                z: this.segmentStart.z + (this.segmentEnd.z - this.segmentStart.z) * t
            };
        }

        this.sim.setToolPosition(pos.x, pos.y, pos.z);

        // Real-time trail: draw line as pen moves (only for cut moves, not rapid/jump)
        if (this.segmentType !== 'J' && this.segmentType !== 'WAIT') {
            if (!this.liveTrailPoints) {
                this.liveTrailPoints = [{ ...this.segmentStart }];
            }
            this.liveTrailPoints.push({ ...pos });
            this.sim.updateLiveTrail(this.liveTrailPoints);
        }

        // Segment complete
        if (this.segmentProgress >= 1) {
            // Clear live trail before finalizing
            this.liveTrailPoints = null;
            this.sim.clearLiveTrail();
            if (this.segmentType === 'A' && this.arcCenter) {
                // Add arc trail
                this.sim.addArcTrailSegment(
                    this.segmentStart,
                    this.segmentEnd,
                    this.arcCenter,
                    this.arcRadius,
                    this.arcStartAngle,
                    this.arcEndAngle,
                    this.arcClockwise
                );
            } else {
                this.sim.addTrailSegment(this.segmentStart, this.segmentEnd, this.segmentType === 'J');
            }
            this.position = { ...this.segmentEnd };
            this.currentIndex++;
            this.onUpdate?.(this.currentIndex, this.parsedCommands.length);

            if (!this.prepareNextSegment()) return;
        }

        this.animationId = requestAnimationFrame((t) => this.animate(t));
    }

    /**
     * Set animation speed multiplier
     */
    setSpeed(multiplier) {
        this.speed = Math.max(0.1, Math.min(10, multiplier));
    }

    /**
     * Get current progress
     */
    getProgress() {
        return {
            current: this.currentIndex,
            total: this.parsedCommands.length,
            percent: this.parsedCommands.length > 0
                ? Math.round((this.currentIndex / this.parsedCommands.length) * 100)
                : 0
        };
    }

    /**
     * Cleanup
     */
    dispose() {
        this.stop();
        this.sim = null;
        this.onUpdate = null;
        this.onComplete = null;
    }
}

const EPSILON = 1e-6;

export default PLC3DAnimator;
