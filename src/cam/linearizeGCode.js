/**
 * Converts G2/G3 arcs into G1 segments for robust previewing.
 * Uses cncwebsim-style vector rotation with periodic correction.
 * Handles both I/J mode and R mode arcs.
 */

import { TOLERANCE, LIMITS } from './constants.js';

// Arc linearization tolerance (mm chordal error)
const ARC_TOLERANCE = TOLERANCE.ARC_LINEARIZE;
const MAX_SEGMENTS = LIMITS.MAX_ARC_SEGMENTS;
const TWO_PI = Math.PI * 2;

// N_ARC_CORRECTION: how often to recalculate exact position (0 = every segment)
const N_ARC_CORRECTION = 12;

/**
 * Convert R-mode arc parameters to I/J offsets
 * Based on cncwebsim interpreter.js algorithm
 *
 * @param {number} dx - Delta X (target - current)
 * @param {number} dy - Delta Y (target - current)
 * @param {number} r - Radius (negative for large arc)
 * @param {boolean} isCW - True for G2 (clockwise)
 * @returns {{i: number, j: number, radius: number} | null}
 */
function rToIJ(dx, dy, r, isCW) {
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-12) {
        return null;
    }
    const h_x2_div_d_sq = 4.0 * r * r - d2;

    if (h_x2_div_d_sq < 0) {
        // Radius too small for the distance
        return null;
    }

    let h_x2_div_d = Math.sqrt(h_x2_div_d_sq) / Math.sqrt(d2);

    // For G2 (CW), we want the center to be on the right side of the path start->end.
    // The offset vector calculated below is derived from (-dy, dx).
    // If factor is positive, it points Right.
    // So for G2 (CW), we keep it positive. For G3 (CCW), we negate it.
    if (!isCW) {
        h_x2_div_d = -h_x2_div_d;
    }

    // Negative radius means take the large arc (> 180 degrees)
    if (r < 0) {
        h_x2_div_d = -h_x2_div_d;
        r = -r;
    }

    return {
        i: 0.5 * (dx + dy * h_x2_div_d),
        j: 0.5 * (dy - dx * h_x2_div_d),
        radius: r
    };
}

/**
 * Calculate number of segments for arc linearization
 * Based on cncwebsim formula for chordal tolerance
 *
 * @param {number} angularTravel - Arc sweep in radians
 * @param {number} radius - Arc radius
 * @returns {number}
 */
function calculateSegments(angularTravel, radius) {
    if (!Number.isFinite(radius) || radius <= 0) return 1;
    if (!Number.isFinite(angularTravel) || Math.abs(angularTravel) < 1e-10) return 1;

    // cncwebsim formula: segments = |0.5 * angular * r| / sqrt(tol * (2r - tol))
    const denom = Math.sqrt(ARC_TOLERANCE * (2 * radius - ARC_TOLERANCE));
    if (denom <= 0) return 1;

    let segments = Math.floor(Math.abs(0.5 * angularTravel * radius) / denom);
    segments = Math.max(1, Math.min(segments, MAX_SEGMENTS));

    return segments;
}

/**
 * Linearize G-code by converting G2/G3 arcs to G1 segments
 *
 * @param {string} gcode - Input G-code
 * @returns {string} - Linearized G-code
 */
export function linearizeGCode(gcode) {
    const lines = gcode.split('\n');
    const output = [];

    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let absolute = true; // G90 default
    let currentFeed = null;

    for (const line of lines) {
        const trimmed = line.trim();

        // Pass through comments and empty lines
        if (!trimmed || trimmed.startsWith('(') || trimmed.startsWith(';')) {
            output.push(line);
            continue;
        }

        // Parse G-code number
        const gCodeMatch = trimmed.match(/^G(\d+(?:\.\d+)?)/i);
        const gCode = gCodeMatch ? parseFloat(gCodeMatch[1]) : null;

        // Track distance mode
        if (trimmed.includes('G90')) absolute = true;
        if (trimmed.includes('G91')) absolute = false;

        // Parse coordinates
        const xMatch = trimmed.match(/X([+-]?\d*\.?\d+)/i);
        const yMatch = trimmed.match(/Y([+-]?\d*\.?\d+)/i);
        const zMatch = trimmed.match(/Z([+-]?\d*\.?\d+)/i);
        const fMatch = trimmed.match(/F([+-]?\d*\.?\d+)/i);

        if (fMatch) currentFeed = parseFloat(fMatch[1]);

        let targetX = currentX;
        let targetY = currentY;
        let targetZ = currentZ;

        if (xMatch) targetX = parseFloat(xMatch[1]);
        if (yMatch) targetY = parseFloat(yMatch[1]);
        if (zMatch) targetZ = parseFloat(zMatch[1]);

        // Handle incremental mode
        if (!absolute) {
            if (xMatch) targetX += currentX;
            if (yMatch) targetY += currentY;
            if (zMatch) targetZ += currentZ;
        }

        // G0/G1: Pass through and update position
        if (gCode === 0 || gCode === 1) {
            currentX = targetX;
            currentY = targetY;
            currentZ = targetZ;
            output.push(line);
            continue;
        }

        // G2/G3: Arc linearization
        if (gCode === 2 || gCode === 3) {
            const isCW = gCode === 2;

            const iMatch = trimmed.match(/I([+-]?\d*\.?\d+)/i);
            const jMatch = trimmed.match(/J([+-]?\d*\.?\d+)/i);
            const rMatch = trimmed.match(/R([+-]?\d*\.?\d+)/i);

            const startX = currentX;
            const startY = currentY;
            const startZ = currentZ;
            const movedXY = Math.abs(targetX - startX) > 1e-9 || Math.abs(targetY - startY) > 1e-9;
            const hasIJ = iMatch !== null || jMatch !== null;
            const isFullCircle = !movedXY && hasIJ;

            let centerX, centerY, radius;

            // Calculate arc center
            if (rMatch) {
                // R-mode: Convert to I/J
                const dx = targetX - startX;
                const dy = targetY - startY;
                const r = parseFloat(rMatch[1]);

                const ij = rToIJ(dx, dy, r, isCW);
                if (!ij) {
                    // Invalid arc - pass through as-is
                    console.warn(`Invalid R-mode arc at line: ${line}`);
                    output.push(line);
                    currentX = targetX;
                    currentY = targetY;
                    currentZ = targetZ;
                    continue;
                }

                centerX = startX + ij.i;
                centerY = startY + ij.j;
                radius = ij.radius;
            } else {
                // I/J mode (standard, relative to start point)
                const i = iMatch ? parseFloat(iMatch[1]) : 0;
                const j = jMatch ? parseFloat(jMatch[1]) : 0;

                centerX = startX + i;
                centerY = startY + j;
                radius = Math.hypot(i, j);
            }

            if (radius < 1e-10) {
                // Degenerate arc - treat as point
                output.push(line);
                currentX = targetX;
                currentY = targetY;
                currentZ = targetZ;
                continue;
            }

            // Calculate angular travel using cncwebsim method
            // r_axis: vector from center to start
            // rt_axis: vector from center to end
            const r_axis0 = startX - centerX;
            const r_axis1 = startY - centerY;
            const rt_axis0 = targetX - centerX;
            const rt_axis1 = targetY - centerY;

            let angularTravel;

            if (isFullCircle) {
                angularTravel = isCW ? -TWO_PI : TWO_PI;
            } else {
                // Angular travel via cross/dot product
                angularTravel = Math.atan2(
                    r_axis0 * rt_axis1 - r_axis1 * rt_axis0,
                    r_axis0 * rt_axis0 + r_axis1 * rt_axis1
                );

                // Adjust for arc direction
                if (isCW) {
                    // CW: angular_travel should be negative
                    if (angularTravel > 0) angularTravel -= TWO_PI;
                } else {
                    // CCW: angular_travel should be positive
                    if (angularTravel < 0) angularTravel += TWO_PI;
                }
            }

            // Calculate segments
            const segments = calculateSegments(angularTravel, radius);
            const thetaPerSegment = angularTravel / segments;
            const zPerSegment = (targetZ - startZ) / segments;

            // Vector rotation optimization (cncwebsim method)
            // Taylor series approximation for small angles
            let cos_T = 2.0 - thetaPerSegment * thetaPerSegment;
            let sin_T = thetaPerSegment * 0.16666667 * (cos_T + 4.0);
            cos_T *= 0.5;

            // Current radius vector (from center to current point)
            let r0 = -r_axis0; // Note: negative because we want center-relative
            let r1 = -r_axis1;

            // Actually use positive direction from center
            r0 = r_axis0;
            r1 = r_axis1;

            let count = 0;

            // Generate segments
            for (let seg = 1; seg < segments; seg++) {
                let newR0, newR1;

                if (count < N_ARC_CORRECTION && N_ARC_CORRECTION > 0) {
                    // Fast vector rotation
                    const r_temp = r0 * sin_T + r1 * cos_T;
                    newR0 = r0 * cos_T - r1 * sin_T;
                    newR1 = r_temp;
                    count++;
                } else {
                    // Exact recalculation to avoid accumulated error
                    const angle = seg * thetaPerSegment;
                    const cos_Ti = Math.cos(angle);
                    const sin_Ti = Math.sin(angle);
                    newR0 = r_axis0 * cos_Ti - r_axis1 * sin_Ti;
                    newR1 = r_axis0 * sin_Ti + r_axis1 * cos_Ti;
                    count = 0;
                }

                r0 = newR0;
                r1 = newR1;

                const px = centerX + r0;
                const py = centerY + r1;
                const pz = startZ + zPerSegment * seg;

                let g1Line = `G1 X${px.toFixed(4)} Y${py.toFixed(4)}`;
                if (Math.abs(pz - startZ) > 1e-6) {
                    g1Line += ` Z${pz.toFixed(4)}`;
                }
                if (currentFeed !== null && seg === 1) {
                    g1Line += ` F${currentFeed}`;
                }

                output.push(g1Line);
            }

            // Final segment to exact endpoint
            let finalLine = `G1 X${targetX.toFixed(4)} Y${targetY.toFixed(4)}`;
            if (Math.abs(targetZ - startZ) > 1e-6) {
                finalLine += ` Z${targetZ.toFixed(4)}`;
            }
            output.push(finalLine);

            currentX = targetX;
            currentY = targetY;
            currentZ = targetZ;
        } else {
            // Pass through all other commands
            output.push(line);
        }
    }

    return output.join('\n');
}
