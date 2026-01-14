/**
 * CAM Worker Integration Test
 * Tests the full CAM worker flow: DXF → Primitives → CAM Operations → G-code
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { PathOptimizer } from '../src/plc/PathOptimizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DXF_PATH = path.join(PROJECT_ROOT, 'DXF', 'Laser Cut Modern Love Theme Wall Clock.dxf');
const WORKER_PATH = path.join(PROJECT_ROOT, 'server', 'workers', 'cam-worker.js');

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
};

const fileExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const buildPoints = (primitive) => {
    if (!primitive || typeof primitive.samplePoints !== 'function') {
        return null;
    }
    return primitive.samplePoints();
};

const isClosedPrimitive = (primitive) => {
    if (!primitive) return false;
    if (primitive.type === 'circle' || primitive.type === 'rectangle' || primitive.type === 'polygon') {
        return true;
    }
    return primitive.closed === true;
};

const enrichPlcData = (primitives) => primitives.map((prim) => {
    if (prim.type === 'line') {
        prim.plcData = { type: 1, x1: prim.x1, y1: prim.y1, x2: prim.x2, y2: prim.y2 };
    } else if (prim.type === 'arc') {
        prim.plcData = {
            type: prim.isClockwise ? 2 : 3,
            x1: prim.x1, y1: prim.y1,
            x2: prim.x2, y2: prim.y2,
            cx: prim.cx, cy: prim.cy
        };
    } else if (prim.type === 'circle') {
        const cx = prim.center?.x ?? prim.cx;
        const cy = prim.center?.y ?? prim.cy;
        const r = prim.radius;
        prim.plcData = { type: 3, x1: cx + r, y1: cy, x2: cx + r, y2: cy, cx, cy };
    } else if (prim.type === 'rectangle') {
        prim.plcData = { type: 'rectangle', x: prim.x, y: prim.y, width: prim.width, height: prim.height };
    } else if (prim.type === 'polygon' || prim.type === 'polyline') {
        prim.plcData = { type: prim.type, points: prim.points, closed: prim.closed };
    }
    return prim;
});

async function loadAndParseDXF() {
    assert(await fileExists(DXF_PATH), `DXF file not found: ${DXF_PATH}`);

    const content = await fs.readFile(DXF_PATH, 'utf8');
    assert(content.length > 0, 'DXF file is empty');

    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => {});
    assert(parsed?.primitives?.length > 0, 'DXF parse returned no primitives');

    return parsed;
}

function buildCAMOperations(primitives, maxOps = 10) {
    const enriched = enrichPlcData(primitives);
    const optimized = PathOptimizer.optimizeOrder(enriched);

    const ops = [];
    let opId = 0;

    for (const prim of optimized) {
        if (ops.length >= maxOps) break;

        const points = buildPoints(prim);
        if (!points || points.length < 2) continue;

        ops.push({
            id: `profile_${opId}`,
            name: `Profile ${opId}`,
            type: 'profile',
            toolId: 't1',
            points,
            closed: isClosedPrimitive(prim),
            startZ: 0,
            targetZ: -1,
            stepDown: 1,
            side: 'outside'
        });
        opId += 1;
    }

    return ops;
}

function sendWorkerMessage(worker, message, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Worker timeout after ${timeout}ms`));
        }, timeout);

        const handler = (response) => {
            clearTimeout(timer);
            worker.off('message', handler);
            resolve(response);
        };

        worker.on('message', handler);
        worker.postMessage(message);
    });
}

async function testGenerateCommand(worker, operations) {
    console.log(`  Sending 'generate' command with ${operations.length} operations...`);

    const job = { operations };
    const tools = [{
        id: 't1',
        name: 'Endmill 3mm',
        diameter: 3,
        defaults: { spindleRPM: 12000, feedXY: 800, feedZ: 200, stepDown: 1 }
    }];

    const response = await sendWorkerMessage(worker, {
        command: 'generate',
        data: { job, tools }
    });

    assert(response.type === 'success', `Generate failed: ${response.message || 'unknown error'}`);
    assert(typeof response.gcode === 'string', 'G-code is not a string');
    assert(response.gcode.length > 0, 'G-code is empty');
    assert(!response.gcode.includes('NaN'), 'G-code contains NaN');
    assert(!response.gcode.includes('undefined'), 'G-code contains undefined');

    console.log(`  G-code generated: ${response.gcode.length} chars, ${response.gcode.split('\n').length} lines`);
    return response.gcode;
}

async function testParseCommand(worker, gcode) {
    console.log('  Sending \'parse\' command...');

    const response = await sendWorkerMessage(worker, {
        command: 'parse',
        data: { gcode }
    });

    assert(response.type === 'success', `Parse failed: ${response.message || 'unknown error'}`);
    assert(typeof response.data === 'string', 'Parse data is not a string');

    const parsed = JSON.parse(response.data);
    assert(parsed.status === 'ok', 'Parse status not ok');
    assert(Array.isArray(parsed.layers), 'Layers is not an array');

    console.log(`  Parsed: ${parsed.layers.length} layers`);
    return parsed;
}

async function testPostprocessCommand(worker, gcode) {
    console.log('  Sending \'postprocess\' command...');

    const response = await sendWorkerMessage(worker, {
        command: 'postprocess',
        data: { gcode }
    });

    assert(response.type === 'success', `Postprocess failed: ${response.message || 'unknown error'}`);
    assert(typeof response.data === 'string', 'Postprocess data is not a string');

    const result = JSON.parse(response.data);
    assert(result.status === 'ok', 'Postprocess status not ok');
    assert(Array.isArray(result.commands), 'Commands is not an array');

    console.log(`  Postprocessed: ${result.commands.length} PLC commands`);
    return result;
}

async function run() {
    console.log('=== CAM WORKER INTEGRATION TEST ===\n');

    // Verify worker file exists
    assert(await fileExists(WORKER_PATH), `Worker file not found: ${WORKER_PATH}`);

    // Load and parse DXF
    console.log('[1/5] Loading DXF file...');
    const parsed = await loadAndParseDXF();
    console.log(`  Primitives: ${parsed.primitives.length}`);

    // Build CAM operations (limit to 10 for speed)
    console.log('\n[2/5] Building CAM operations...');
    const operations = buildCAMOperations(parsed.primitives, 10);
    assert(operations.length > 0, 'No CAM operations created');
    console.log(`  Operations: ${operations.length}`);

    // Spawn worker
    console.log('\n[3/5] Spawning CAM worker...');
    const worker = new Worker(WORKER_PATH);

    try {
        // Test generate command
        console.log('\n[4/5] Testing worker commands...');
        const gcode = await testGenerateCommand(worker, operations);

        // Test parse command
        await testParseCommand(worker, gcode);

        // Test postprocess command
        await testPostprocessCommand(worker, gcode);

        console.log('\n[5/5] Cleanup...');
        await worker.terminate();

        console.log('\n=== ALL TESTS PASSED ===');
    } catch (error) {
        await worker.terminate();
        throw error;
    }
}

run().catch((error) => {
    console.error(`\n=== TEST FAILED ===`);
    console.error(error.message);
    if (error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
});
