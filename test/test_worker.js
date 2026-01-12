// @ts-nocheck
import { parentPort as _parentPort } from 'worker_threads'; // Mock if needed, or just ignore for this test

import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { PathOptimizer } from '../src/plc/extraction.js';
import fs from 'fs';
import path from 'path';



// Polyfills
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.DxfParser = DxfParser;

async function testWorkerLogic() {
    console.log('--- Testing Worker Logic on Large File ---');
    try {
        const filePath = path.join(process.cwd(), 'DXF', 'Laser Cut Modern Love Theme Wall Clock.dxf');
        console.log('Reading file:', filePath);

        if (!fs.existsSync(filePath)) {
            console.error('File not found:', filePath);
            return;
        }
        const dxfContent = fs.readFileSync(filePath, 'utf8');

        console.log('1. Instantiating DXFImporter...');
        const importer = new DXFImporter(DxfParser);

        console.log('2. Parsing...');
        const primitivesRaw = await importer.parse(dxfContent, (_p, _m) => { });
        console.log(`Parsed ${primitivesRaw.primitives.length} primitives.`);

        console.log('3. Optimizing...');
        const primitivesWithData = primitivesRaw.primitives.map(p => {
            p.plcData = { type: 1, x1: 0, y1: 0, x2: 10, y2: 10 };
            return p;
        });

        const optimizedPrimitives = PathOptimizer.optimizeOrder(primitivesWithData);
        console.log(`Optimized ${optimizedPrimitives.length} primitives.`);

        console.log('--- TEST PASSED ---');

    } catch (error) {
        console.error('--- TEST FAILED ---');
        console.error(error);
        process.exit(1);
    }
}

testWorkerLogic();
