import fs from 'node:fs/promises';
import path from 'node:path';
import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';

const DXF_DIR = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF';

// Helper to count G-code types
const analyzeGCode = (gcode) => {
    const lines = gcode.split('\n');
    let lineCount = 0;
    let arcCount = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const l of lines) {
        const t = l.trim();
        if (t.startsWith('G1 ') || t.startsWith('G01 ')) lineCount++;
        if (t.startsWith('G2 ') || t.startsWith('G02 ') || t.startsWith('G3 ') || t.startsWith('G03 ')) arcCount++;

        // Bounds check
        const xMatch = t.match(/X([\d.-]+)/);
        const yMatch = t.match(/Y([\d.-]+)/);
        if (xMatch) {
            const val = parseFloat(xMatch[1]);
            if (!isNaN(val)) {
                if (val < minX) minX = val;
                if (val > maxX) maxX = val;
            }
        }
        if (yMatch) {
            const val = parseFloat(yMatch[1]);
            if (!isNaN(val)) {
                if (val < minY) minY = val;
                if (val > maxY) maxY = val;
            }
        }
    }
    return { lineCount, arcCount, minX, maxX, minY, maxY };
};

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
            data.x1 = prim.x1; data.y1 = prim.y1; data.x2 = prim.x2; data.y2 = prim.y2;
            break;
        case 'line':
            data.x1 = prim.x1; data.y1 = prim.y1; data.x2 = prim.x2; data.y2 = prim.y2;
            break;
        case 'rectangle':
            data.x = prim.x; data.y = prim.y; data.width = prim.width; data.height = prim.height;
            break;
        case 'polygon': case 'polyline':
            data.points = prim.points?.map(p => ({ x: p.x, y: p.y }));
            data.closed = prim.closed;
            break;
        default: return null;
    }
    return data;
};

const runBatch = async () => {
    console.log(`Scanning ${DXF_DIR}...`);
    const files = await fs.readdir(DXF_DIR);
    const dxfFiles = files.filter(f => f.toLowerCase().endsWith('.dxf'));

    console.log(`Found ${dxfFiles.length} DXF files.`);

    let failures = 0;

    for (const file of dxfFiles) {
        console.log(`\n----------------------------------------`);
        console.log(`Processing: ${file}`);
        const filePath = path.join(DXF_DIR, file);

        try {
            const content = await fs.readFile(filePath, 'utf8');
            const importer = new DXFImporter(DxfParser);
            const parsed = await importer.parse(content, () => { });

            if (!parsed?.primitives?.length) {
                console.warn(`[WARN] No primitives found in ${file}`);
                continue;
            }

            // Normalize translations/bounds if needed (simple version)
            // convert to CAM primitives
            const primitives = parsed.primitives.map(serializePrimitive).filter(Boolean);
            console.log(`  Primitives: ${primitives.length}`);

            const start = Date.now();
            const result = await runCamGo({
                primitives,
                type: 'profile',
                settings: {
                    toolDiameter: 1.0, // Standard pen plotter test
                    stepOver: 40,
                    startZ: 0,
                    targetZ: -1,
                    stepDown: 1,
                    feedXY: 1000,
                    feedZ: 500,
                    safetyHeight: 5,
                    tolerance: 0.01 // Strict tolerance
                }
            });
            const elapsed = Date.now() - start;

            if (!result || !result.gcode) {
                console.error(`[FAIL] No G-code generated for ${file}`);
                failures++;
                continue;
            }

            const stats = analyzeGCode(result.gcode);
            console.log(`  CAM Time: ${elapsed}ms`);
            console.log(`  G-Code Stats:`);
            console.log(`    Lines: ${stats.lineCount}`);
            console.log(`    Arcs:  ${stats.arcCount}`);
            console.log(`    Bounds: [${stats.minX.toFixed(2)}, ${stats.minY.toFixed(2)}] to [${stats.maxX.toFixed(2)}, ${stats.maxY.toFixed(2)}]`);

            // Validation logic
            const width = stats.maxX - stats.minX;
            const height = stats.maxY - stats.minY;
            if (width > 5000 || height > 5000) {
                console.error(`  [FAIL] Bounds too large! Explosion detected? Width=${width.toFixed(2)}`);
                failures++;
            } else if (stats.arcCount === 0 && primitives.some(p => p.type === 'circle' || p.type === 'arc')) {
                console.warn(`  [WARN] Input has circles/arcs but output has 0 arcs. (Greedy might have chosen lines?)`);
            } else {
                console.log(`  [PASS] Output looks valid.`);
            }

        } catch (err) {
            console.error(`[ERROR] Failed to process ${file}:`, err);
            failures++;
        }
    }

    console.log(`\nBatch complete. Failures: ${failures}`);
    if (failures > 0) process.exit(1);
};

runBatch();
