/**
 * Test GCodeFromPrimitives - Direct primitive to G-code (like PLC)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { GCodeFromPrimitives } from '../src/cam/GCodeFromPrimitives.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function testGCodeFromPrimitives() {
    console.log('=== TEST: GCodeFromPrimitives (PLC-style) ===\n');

    // Load DXF
    console.log('[1] Loading DXF...');
    const dxfPath = path.join(PROJECT_ROOT, 'DXF/Laser Cut Modern Love Theme Wall Clock.dxf');
    const content = await fs.readFile(dxfPath, 'utf-8');
    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => {});
    console.log(`    Primitives: ${parsed.primitives.length}`);

    // Simulate translation (like FileManager does)
    console.log('\n[2] Applying workspace centering...');
    const bounds = parsed.bounds;
    const drawingWidth = bounds.maxX - bounds.minX;
    const drawingHeight = bounds.maxY - bounds.minY;
    const workspaceWidth = Math.max(1035, Math.ceil(drawingWidth + 40));
    const workspaceHeight = Math.max(1045, Math.ceil(drawingHeight + 40));
    const centerX = (workspaceWidth - drawingWidth) / 2;
    const centerY = (workspaceHeight - drawingHeight) / 2;
    const offsetX = centerX - bounds.minX;
    const offsetY = centerY - bounds.minY;

    for (const prim of parsed.primitives) {
        prim.translate(offsetX, offsetY);
    }
    console.log(`    Translation: X+${offsetX.toFixed(2)}, Y+${offsetY.toFixed(2)}`);

    // Test with just circles first
    const circles = parsed.primitives.filter(p => p.type === 'circle');
    console.log(`\n[3] Testing with ${circles.length} circles...`);

    const generator = new GCodeFromPrimitives({
        precision: 4,
        safeZ: 5,
        feedXY: 800,
        feedZ: 200,
        targetZ: -1,
        toolRadius: 1.5,
        offsetSide: 'outside'
    });

    const gcode = generator.generate(circles.slice(0, 5)); // Test with first 5 circles
    console.log('\n[4] Generated G-code:\n');
    console.log(gcode);

    // Check coordinates
    console.log('\n[5] Coordinate verification:');
    const firstCircle = circles[0];
    const cx = firstCircle.center?.x ?? firstCircle.cx;
    const cy = firstCircle.center?.y ?? firstCircle.cy;
    const r = firstCircle.radius ?? firstCircle._radius;
    console.log(`    Circle 1: cx=${cx.toFixed(2)}, cy=${cy.toFixed(2)}, r=${r.toFixed(2)}`);
    console.log(`    Expected G0 X: ${(cx + r + 1.5).toFixed(2)}`);

    // Check G0 in output
    const g0Line = gcode.split('\n').find(l => l.startsWith('G0 X'));
    if (g0Line) {
        console.log(`    Actual G0: ${g0Line}`);
    }

    console.log('\n=== TEST COMPLETE ===');
}

testGCodeFromPrimitives().catch(err => {
    console.error('Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
