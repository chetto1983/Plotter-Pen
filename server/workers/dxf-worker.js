
import { parentPort } from 'worker_threads';
import DxfParser from 'dxf-parser';
import { DXFImporter } from '../../src/import/DXFImporter.js';
import { PathOptimizer, PLCOutputGenerator } from '../../src/plc/extraction.js';

// Polyfills for Browser-code compatibility
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.DxfParser = DxfParser;

parentPort.on('message', async (dxfContent) => {
    try {
        if (!dxfContent) throw new Error('No content');

        console.log('Worker: Starting processing...');

        // 1. Parse
        const importer = new DXFImporter(DxfParser);
        const primitivesRaw = await importer.parse(dxfContent, () => { });
        console.log(`Worker: Parsed ${primitivesRaw.primitives.length} primitives`);

        // 2. NORMALIZE COORDINATES
        const bounds = primitivesRaw.bounds;
        let diffX = 0;
        let diffY = 0;

        if (bounds) {
            const padding = 1.0;
            diffX = -bounds.minX + padding;
            diffY = -bounds.minY + padding;

            if (Math.abs(diffX) > 0.01 || Math.abs(diffY) > 0.01) {
                console.log('Worker: Normalizing coordinates...');
                for (const p of primitivesRaw.primitives) {
                    if (p.translate) {
                        p.translate(diffX, diffY);
                    }
                }
                bounds.minX += diffX;
                bounds.maxX += diffX;
                bounds.minY += diffY;
                bounds.maxY += diffY;
            }
        }

        // 3. Enrich with PLC Data
        console.log('Worker: Enriching data...');
        const primitivesWithData = primitivesRaw.primitives.map(p => {
            // Re-map after normalization
            if (p.type === 'line') {
                p.plcData = { type: 1, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
            } else if (p.type === 'arc') {
                p.plcData = {
                    type: p.isClockwise ? 2 : 3,
                    x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, cx: p.cx, cy: p.cy
                };
            } else if (p.type === 'circle') {
                const cx = p.center?.x ?? p.cx;
                const cy = p.center?.y ?? p.cy;
                const r = p.radius;
                p.plcData = {
                    type: 3,
                    x1: cx + r, y1: cy,
                    x2: cx + r, y2: cy,
                    cx: cx, cy: cy
                };
            } else if (p.type === 'rectangle') {
                p.plcData = { type: 'rectangle', x: p.x, y: p.y, width: p.width, height: p.height };
            } else if (p.type === 'polygon' || p.type === 'polyline') {
                p.plcData = { type: p.type, points: p.points, closed: p.closed };
            }
            return p;
        });

        // 4. Optimize
        console.log('Worker: Optimizing path...');
        const optimizedPrimitives = PathOptimizer.optimizeOrder(primitivesWithData);

        // 5. Generate PLC
        console.log('Worker: Generating PLC commands...');
        const generator = new PLCOutputGenerator();
        const plcCommands = generator.generate(optimizedPrimitives);
        const plcOutput = plcCommands.map(c => c.command);

        // 6. Serialize & Stringify
        // We stringify HERE to avoid slowing down the main thread with massive object transfer and serialization
        console.log('Worker: Serializing result...');

        const primitivesSerialized = optimizedPrimitives.map(p => {
            const json = p.toJSON();
            json.plcData = p.plcData;
            return json;
        });

        const plcCommandsSerialized = plcCommands.map(c => ({
            ...c,
            primitive: undefined,
            primitiveId: c.primitive?.id
        }));

        const resultObject = {
            status: 'ok',
            primitives: primitivesSerialized,
            plcCommands: plcCommandsSerialized,
            plcOutput,
            bounds
        };

        console.log('Worker: Stringifying JSON...');
        const jsonString = JSON.stringify(resultObject);
        console.log(`Worker: Done. Payload size approx ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);

        parentPort.postMessage({ type: 'success', data: jsonString });

    } catch (error) {
        console.error('Worker Error:', error);
        parentPort.postMessage({ type: 'error', message: error.message, stack: error.stack });
    }
});
