import fs from 'node:fs/promises';

import DxfParser from 'dxf-parser';
import { GCodeParser } from '@polar3d/gcode-viewer';

import { DXFImporter } from '../src/import/DXFImporter.js';
import { PathOptimizer } from '../src/plc/PathOptimizer.js';
import { PLCOutputGenerator } from '../src/plc/PLCOutputGenerator.js';
import { createPrimitiveFromJSON } from '../src/geometry/primitives.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';
import { linearizeGCode } from '../src/cam/linearizeGCode.js';
import { parseGCodeToPrimitives, generatePLCFromGCode } from '../src/cam/GCodePostProcessor.js';

const DEFAULT_DXF = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Modern Love Theme Wall Clock.dxf';
const dxfPath = process.env.DXF_PATH || DEFAULT_DXF;

const fileExists = async (filePath) => {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
};

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const calcLinearBounds = (gcode) => {
    const lines = gcode.split('\n');
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    let currentX = 0;
    let currentY = 0;
    let absolute = true;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('(') || trimmed.startsWith(';')) {
            continue;
        }

        if (trimmed.includes('G90')) absolute = true;
        if (trimmed.includes('G91')) absolute = false;

        const gCodeMatch = trimmed.match(/^G(\d+)(?=[^0-9]|$)/i);
        const gCode = gCodeMatch ? Number.parseInt(gCodeMatch[1], 10) : null;
        if (gCode !== 0 && gCode !== 1) {
            continue;
        }

        const xMatch = trimmed.match(/[X]([\d.-]+)/);
        const yMatch = trimmed.match(/[Y]([\d.-]+)/);

        let nextX = currentX;
        let nextY = currentY;

        if (xMatch) nextX = parseFloat(xMatch[1]);
        if (yMatch) nextY = parseFloat(yMatch[1]);

        if (!absolute) {
            if (xMatch) nextX += currentX;
            if (yMatch) nextY += currentY;
        }

        if (xMatch || yMatch) {
            minX = Math.min(minX, nextX);
            minY = Math.min(minY, nextY);
            maxX = Math.max(maxX, nextX);
            maxY = Math.max(maxY, nextY);
        }

        currentX = nextX;
        currentY = nextY;
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }

    return { minX, minY, maxX, maxY };
};

const normalizePrimitives = (payload) => {
    const bounds = payload.bounds ?? null;
    let diffX = 0;
    let diffY = 0;

    if (bounds) {
        const padding = 1.0;
        diffX = -bounds.minX + padding;
        diffY = -bounds.minY + padding;
        if (Math.abs(diffX) > 0.01 || Math.abs(diffY) > 0.01) {
            for (const prim of payload.primitives) {
                if (prim.translate) {
                    prim.translate(diffX, diffY);
                }
            }
            bounds.minX += diffX;
            bounds.maxX += diffX;
            bounds.minY += diffY;
            bounds.maxY += diffY;
        }
    }

    return bounds;
};

const enrichPlcData = (primitives) => primitives.map((prim) => {
    if (prim.type === 'line') {
        prim.plcData = { type: 1, x1: prim.x1, y1: prim.y1, x2: prim.x2, y2: prim.y2 };
    } else if (prim.type === 'arc') {
        prim.plcData = {
            type: prim.isClockwise ? 2 : 3,
            x1: prim.x1,
            y1: prim.y1,
            x2: prim.x2,
            y2: prim.y2,
            cx: prim.cx,
            cy: prim.cy
        };
    } else if (prim.type === 'circle') {
        const cx = prim.center?.x ?? prim.cx;
        const cy = prim.center?.y ?? prim.cy;
        const r = prim.radius;
        prim.plcData = {
            type: 3,
            x1: cx + r,
            y1: cy,
            x2: cx + r,
            y2: cy,
            cx,
            cy
        };
    } else if (prim.type === 'rectangle') {
        prim.plcData = { type: 'rectangle', x: prim.x, y: prim.y, width: prim.width, height: prim.height };
    } else if (prim.type === 'polygon' || prim.type === 'polyline') {
        prim.plcData = { type: prim.type, points: prim.points, closed: prim.closed };
    }
    return prim;
});

const serializePrimitive = (prim) => {
    if (!prim || !prim.type) return null;
    const data = { type: prim.type };

    switch (prim.type) {
        case 'circle':
            data.cx = prim.center?.x ?? prim.cx;
            data.cy = prim.center?.y ?? prim.cy;
            data.radius = prim.radius ?? prim._radius;
            break;
        case 'arc':
            data.cx = prim.cx ?? prim.center?.x;
            data.cy = prim.cy ?? prim.center?.y;
            data.radius = prim.radius;
            data.startAngle = prim.startAngle ?? prim._startAngle;
            data.sweep = prim.sweep ?? prim._sweep;
            data.x1 = prim.x1;
            data.y1 = prim.y1;
            data.x2 = prim.x2;
            data.y2 = prim.y2;
            break;
        case 'line':
            data.x1 = prim.x1;
            data.y1 = prim.y1;
            data.x2 = prim.x2;
            data.y2 = prim.y2;
            break;
        case 'rectangle':
            data.x = prim.x;
            data.y = prim.y;
            data.width = prim.width;
            data.height = prim.height;
            break;
        case 'polygon':
        case 'polyline':
            data.points = prim.points?.map(p => ({ x: p.x, y: p.y }));
            data.closed = prim.closed;
            break;
        default:
            return null;
    }
    return data;
};

const run = async () => {
    assert(await fileExists(dxfPath), `DXF file not found: ${dxfPath}`);

    console.log(`DXF file: ${dxfPath}`);
    const content = await fs.readFile(dxfPath, 'utf8');
    assert(content.length > 0, 'DXF file is empty.');

    console.log('Parsing DXF...');
    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => {});
    assert(parsed?.primitives?.length > 0, 'DXF parse returned no primitives.');

    console.log(`Parsed primitives: ${parsed.primitives.length}`);
    const bounds = normalizePrimitives(parsed);

    const enriched = enrichPlcData(parsed.primitives);
    const optimized = PathOptimizer.optimizeOrder(enriched);
    assert(optimized.length > 0, 'Path optimizer returned no primitives.');

    const plcGenerator = new PLCOutputGenerator();
    const plcCommands = plcGenerator.generate(optimized);
    assert(plcCommands.length > 0, 'PLC output is empty.');

    const serialized = optimized.map((prim) => {
        const json = prim.toJSON();
        json.plcData = prim.plcData;
        return json;
    });

    const rehydrated = serialized.map(createPrimitiveFromJSON);
    assert(rehydrated.length === optimized.length, 'Rehydration count mismatch.');

    const primitives = rehydrated
        .map(serializePrimitive)
        .filter(Boolean);

    assert(primitives.length > 0, 'No CAM primitives created.');
    console.log(`CAM primitives: ${primitives.length}`);

    const result = await runCamGo({
        primitives,
        type: 'profile',
        settings: {
            toolDiameter: 3,
            stepOver: 40,
            startZ: 0,
            targetZ: -1,
            stepDown: 1,
            feedXY: 800,
            feedZ: 200,
            safetyHeight: 5,
            spindleRPM: 12000
        }
    });

    const gcode = result?.gcode ?? '';
    assert(gcode.trim().length > 0, 'Generated CAM G-code is empty.');
    assert(!/NaN|undefined/.test(gcode), 'Generated CAM G-code contains invalid tokens.');

    const previewGcode = linearizeGCode(gcode);
    const parser = new GCodeParser();
    const parsedPreview = parser.parse(previewGcode);
    assert(parsedPreview?.layers?.length > 0, 'Preview parser returned no layers.');

    const gcodePrimitives = parseGCodeToPrimitives(gcode);
    assert(gcodePrimitives.length > 0, 'G-code parser returned no primitives.');

    const previewBounds = calcLinearBounds(previewGcode);
    assert(previewBounds, 'Failed to compute bounds from linearized G-code.');

    if (bounds && previewBounds) {
        const dxfSpanX = bounds.maxX - bounds.minX;
        const dxfSpanY = bounds.maxY - bounds.minY;
        const previewSpanX = previewBounds.maxX - previewBounds.minX;
        const previewSpanY = previewBounds.maxY - previewBounds.minY;
        const maxDxfSpan = Math.max(dxfSpanX, dxfSpanY);
        const maxPreviewSpan = Math.max(previewSpanX, previewSpanY);

        if (maxDxfSpan > 0 && maxPreviewSpan > maxDxfSpan * 10) {
            throw new Error(`Preview bounds too large (${maxPreviewSpan.toFixed(2)} > ${maxDxfSpan.toFixed(2)} * 10).`);
        }
    }

    const post = generatePLCFromGCode(gcode);
    assert(post.commands?.length > 0, 'Post-processed PLC commands are empty.');

    if (bounds) {
        console.log(`DXF bounds: ${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)} -> ${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)}`);
    }
    console.log(`Preview bounds: ${previewBounds.minX.toFixed(2)}, ${previewBounds.minY.toFixed(2)} -> ${previewBounds.maxX.toFixed(2)}, ${previewBounds.maxY.toFixed(2)}`);
    console.log('DXF end-to-end validation passed.');
};

run().catch((error) => {
    console.error(`DXF end-to-end validation failed: ${error.message}`);
    process.exit(1);
});
