import { createRequire } from 'node:module';

import { ToolpathGenerator } from '../src/cam/ToolpathGenerator.js';
import { MachineConfig } from '../src/cam/MachineConfig.js';
import { ToolLibrary } from '../src/cam/ToolLibrary.js';

if (!globalThis.self) {
    globalThis.self = globalThis;
}

const require = createRequire(import.meta.url);
require('../src/lib/clipper.js');
if (globalThis.self?.ClipperLib) {
    globalThis.ClipperLib = globalThis.self.ClipperLib;
}

const tools = new ToolLibrary();
const generator = new ToolpathGenerator(new MachineConfig(), tools);

const op = {
    id: 'op-pocket-1',
    name: 'Pocket Test',
    type: 'pocket',
    toolId: '1',
    points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 }
    ],
    closed: true,
    startZ: 0,
    targetZ: -1,
    stepDown: 1
};

const job = { operations: [op] };
const gcode = generator.generateJob(job);
const lines = gcode.split('\n');
const arcLines = lines.filter(line => /^\s*G0?2\b/i.test(line) || /^\s*G0?3\b/i.test(line));
if (arcLines.length > 0) {
    throw new Error(`Pocket G-code should be linear only, found arcs: ${arcLines.join(', ')}`);
}

let currentX = null;
let currentY = null;
let pathStart = null;
let pathEnd = null;
let inPath = false;
let checkedPaths = 0;

const parseAxis = (line, axis) => {
    const match = line.match(new RegExp(`${axis}([-+]?\\d*\\.?\\d+)`));
    return match ? parseFloat(match[1]) : null;
};

for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('(')) continue;

    if (trimmed.startsWith('G0')) {
        const z = parseAxis(trimmed, 'Z');
        const x = parseAxis(trimmed, 'X');
        const y = parseAxis(trimmed, 'Y');

        if (x !== null) currentX = x;
        if (y !== null) currentY = y;

        if (inPath && z !== null) {
            checkedPaths += 1;
            const dx = (pathEnd?.x ?? 0) - (pathStart?.x ?? 0);
            const dy = (pathEnd?.y ?? 0) - (pathStart?.y ?? 0);
            if (Math.hypot(dx, dy) > 1e-3) {
                throw new Error(`Pocket path ${checkedPaths} did not close (start=${pathStart?.x},${pathStart?.y} end=${pathEnd?.x},${pathEnd?.y}).`);
            }
            inPath = false;
            pathStart = null;
            pathEnd = null;
        }
        continue;
    }

    if (trimmed.startsWith('G1')) {
        const x = parseAxis(trimmed, 'X');
        const y = parseAxis(trimmed, 'Y');
        const z = parseAxis(trimmed, 'Z');

        if (!inPath && z !== null && currentX !== null && currentY !== null) {
            pathStart = { x: currentX, y: currentY };
            pathEnd = { x: currentX, y: currentY };
            inPath = true;
        }

        if (x !== null) currentX = x;
        if (y !== null) currentY = y;

        if (inPath && (x !== null || y !== null)) {
            pathEnd = { x: currentX, y: currentY };
        }
    }
}

if (checkedPaths === 0) {
    throw new Error('No pocket paths were validated.');
}

console.log('Pocket G-code closure test passed.');
