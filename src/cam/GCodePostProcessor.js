/**
 * G-code post-processing for PLC output.
 * Converts G0/G1/G2/G3 moves to PLC-ready primitives.
 */
import { Line, Arc } from '../geometry/primitives.js';
import { PLCOutputGenerator } from '../plc/PLCOutputGenerator.js';

const MM_PER_INCH = 25.4;
const TWO_PI = Math.PI * 2;
const EPSILON = 1e-6;

function stripComments(line) {
    const semicolonIndex = line.indexOf(';');
    let code = semicolonIndex >= 0 ? line.slice(0, semicolonIndex) : line;
    code = code.replace(/\([^)]*\)/g, '');
    return code.trim();
}

function parseWords(line) {
    const words = [];
    const regex = /([A-Za-z])\s*([-+]?\d*\.?\d+)/g;
    let match = null;

    while ((match = regex.exec(line)) !== null) {
        const letter = match[1].toUpperCase();
        const value = parseFloat(match[2]);
        if (!Number.isNaN(value)) {
            words.push({ letter, value });
        }
    }

    return words;
}

function isGCode(value, target) {
    return Math.abs(value - target) < 1e-6;
}

function computeSweep(startAngle, endAngle, clockwise) {
    let sweep = endAngle - startAngle;
    if (clockwise) {
        if (sweep >= 0) sweep -= TWO_PI;
    } else {
        if (sweep <= 0) sweep += TWO_PI;
    }
    return sweep;
}

function buildArc(startX, startY, endX, endY, cx, cy, clockwise, id) {
    const startAngle = Math.atan2(startY - cy, startX - cx);
    const endAngle = Math.atan2(endY - cy, endX - cx);
    const sweep = computeSweep(startAngle, endAngle, clockwise);
    const radius = Math.hypot(startX - cx, startY - cy);
    const midAngle = startAngle + sweep / 2;
    const throughPoint = {
        x: cx + radius * Math.cos(midAngle),
        y: cy + radius * Math.sin(midAngle)
    };

    const arc = new Arc(startX, startY, endX, endY, cx, cy, throughPoint, `garc_${id}`);
    arc.plcData = {
        type: clockwise ? 2 : 3,
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        cx,
        cy
    };

    return arc;
}

function computeArcCenterFromRadius(start, end, radius, clockwise) {
    const r = Math.abs(radius);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const chord = Math.hypot(dx, dy);

    if (chord < EPSILON || r < EPSILON) {
        return null;
    }

    const half = chord / 2;
    const hSq = r * r - half * half;
    if (hSq < 0) {
        return null;
    }

    const h = Math.sqrt(hSq);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const ux = -dy / chord;
    const uy = dx / chord;

    const c1 = { cx: mx + ux * h, cy: my + uy * h };
    const c2 = { cx: mx - ux * h, cy: my - uy * h };

    const sweep1 = computeSweep(
        Math.atan2(start.y - c1.cy, start.x - c1.cx),
        Math.atan2(end.y - c1.cy, end.x - c1.cx),
        clockwise
    );
    const sweep2 = computeSweep(
        Math.atan2(start.y - c2.cy, start.x - c2.cx),
        Math.atan2(end.y - c2.cy, end.x - c2.cx),
        clockwise
    );

    const preferLarge = radius < 0;
    if (preferLarge) {
        return Math.abs(sweep1) > Math.abs(sweep2) ? c1 : c2;
    }

    return Math.abs(sweep1) < Math.abs(sweep2) ? c1 : c2;
}

export function parseGCodeToPrimitives(gcodeText, options = {}) {
    if (typeof gcodeText !== 'string') {
        return [];
    }

    const state = {
        x: 0,
        y: 0,
        z: 0,
        absolute: options.absolute ?? true,
        units: options.units ?? 'mm',
        motion: null,
        arcAbsolute: options.arcAbsolute ?? false
    };

    const primitives = [];
    let id = 0;

    const lines = gcodeText.split(/\r?\n/);
    for (const rawLine of lines) {
        const code = stripComments(rawLine);
        if (!code) {
            continue;
        }

        const words = parseWords(code);
        if (!words.length) {
            continue;
        }

        let motion = null;
        let hasG92 = false;
        let hasG28 = false;

        for (const word of words) {
            if (word.letter !== 'G') {
                continue;
            }

            const g = word.value;
            if (isGCode(g, 0) || isGCode(g, 1) || isGCode(g, 2) || isGCode(g, 3)) {
                motion = Math.round(g);
                continue;
            }

            if (isGCode(g, 90)) {
                state.absolute = true;
                continue;
            }
            if (isGCode(g, 91)) {
                state.absolute = false;
                continue;
            }
            if (isGCode(g, 90.1)) {
                state.arcAbsolute = true;
                continue;
            }
            if (isGCode(g, 91.1)) {
                state.arcAbsolute = false;
                continue;
            }
            if (isGCode(g, 20)) {
                state.units = 'in';
                continue;
            }
            if (isGCode(g, 21)) {
                state.units = 'mm';
                continue;
            }
            if (isGCode(g, 92)) {
                hasG92 = true;
                continue;
            }
            if (isGCode(g, 28)) {
                hasG28 = true;
                continue;
            }
        }

        const unitScale = state.units === 'in' ? MM_PER_INCH : 1;
        const values = {};

        for (const word of words) {
            switch (word.letter) {
                case 'X':
                    values.x = word.value * unitScale;
                    break;
                case 'Y':
                    values.y = word.value * unitScale;
                    break;
                case 'Z':
                    values.z = word.value * unitScale;
                    break;
                case 'I':
                    values.i = word.value * unitScale;
                    break;
                case 'J':
                    values.j = word.value * unitScale;
                    break;
                case 'R':
                    values.r = word.value * unitScale;
                    break;
                default:
                    break;
            }
        }

        if (hasG28) {
            const hasAxis = values.x !== undefined || values.y !== undefined || values.z !== undefined;
            if (!hasAxis || values.x !== undefined) state.x = 0;
            if (!hasAxis || values.y !== undefined) state.y = 0;
            if (!hasAxis || values.z !== undefined) state.z = 0;
            continue;
        }

        if (hasG92) {
            if (values.x !== undefined) state.x = values.x;
            if (values.y !== undefined) state.y = values.y;
            if (values.z !== undefined) state.z = values.z;
            continue;
        }

        const activeMotion = motion !== null ? motion : state.motion;
        if (motion !== null) {
            state.motion = motion;
        }

        if (activeMotion === null) {
            continue;
        }

        const startX = state.x;
        const startY = state.y;
        const startZ = state.z;

        const targetX = values.x !== undefined ? (state.absolute ? values.x : startX + values.x) : startX;
        const targetY = values.y !== undefined ? (state.absolute ? values.y : startY + values.y) : startY;
        const targetZ = values.z !== undefined ? (state.absolute ? values.z : startZ + values.z) : startZ;
        const movedXY = Math.abs(targetX - startX) > EPSILON || Math.abs(targetY - startY) > EPSILON;

        if (activeMotion === 0) {
            state.x = targetX;
            state.y = targetY;
            state.z = targetZ;
            continue;
        }

        if (activeMotion === 1) {
            if (movedXY) {
                const line = new Line(startX, startY, targetX, targetY, `gline_${id++}`);
                line.plcData = { type: 1, x1: startX, y1: startY, x2: targetX, y2: targetY };
                primitives.push(line);
            }

            state.x = targetX;
            state.y = targetY;
            state.z = targetZ;
            continue;
        }

        if (activeMotion === 2 || activeMotion === 3) {
            const clockwise = activeMotion === 2;
            if (movedXY) {
                let cx;
                let cy;

                if (values.i !== undefined || values.j !== undefined) {
                    const iVal = values.i ?? 0;
                    const jVal = values.j ?? 0;
                    if (state.arcAbsolute) {
                        cx = iVal;
                        cy = jVal;
                    } else {
                        cx = startX + iVal;
                        cy = startY + jVal;
                    }
                } else if (values.r !== undefined) {
                    const center = computeArcCenterFromRadius(
                        { x: startX, y: startY },
                        { x: targetX, y: targetY },
                        values.r,
                        clockwise
                    );
                    if (center) {
                        cx = center.cx;
                        cy = center.cy;
                    } else {
                        const dist = Math.hypot(targetX - startX, targetY - startY);
                        console.warn(
                            `Invalid R-mode arc: R=${values.r} too small for distance ${dist.toFixed(4)}. ` +
                            `Arc degraded to line. Start=(${startX.toFixed(2)}, ${startY.toFixed(2)}), ` +
                            `End=(${targetX.toFixed(2)}, ${targetY.toFixed(2)})`
                        );
                    }
                }

                if (Number.isFinite(cx) && Number.isFinite(cy)) {
                    primitives.push(buildArc(startX, startY, targetX, targetY, cx, cy, clockwise, id++));
                } else {
                    // Arc center could not be computed - degrade to line
                    const line = new Line(startX, startY, targetX, targetY, `gline_${id++}`);
                    line.plcData = { type: 1, x1: startX, y1: startY, x2: targetX, y2: targetY };
                    primitives.push(line);
                }
            }

            state.x = targetX;
            state.y = targetY;
            state.z = targetZ;
        }
    }

    return primitives;
}

export function generatePLCFromGCode(gcodeText, options = {}) {
    const primitives = parseGCodeToPrimitives(gcodeText, options);
    const generator = new PLCOutputGenerator(options);
    const rawCommands = generator.generate(primitives);
    const commands = rawCommands.map((cmd, index) => ({
        index,
        type: cmd.type,
        command: cmd.command
    }));

    return {
        primitives,
        commands,
        output: commands.map((cmd) => cmd.command)
    };
}
