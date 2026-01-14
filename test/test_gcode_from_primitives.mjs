/**
 * Test GCodeFromPrimitives - Direct primitive to G-code (like PLC)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';

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

    const primitives = circles.slice(0, 5).map(circle => ({
        type: 'circle',
        cx: circle.center?.x ?? circle.cx,
        cy: circle.center?.y ?? circle.cy,
        radius: circle.radius ?? circle._radius
    }));

    const result = await runCamGo({
        primitives,
        type: 'profile',
        settings: {
            toolDiameter: 3,
            startZ: 0,
            targetZ: -1,
            stepDown: 1,
            feedXY: 800,
            feedZ: 200,
            safetyHeight: 5
        }
    });

    const gcode = result?.gcode ?? '';
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

    const arcLines = gcode.split('\n').filter(line => /^\s*G0?2\b/i.test(line) || /^\s*G0?3\b/i.test(line));
    if (arcLines.length === 0) {
        throw new Error('Expected G2/G3 arcs for circle profiles.');
    }

    console.log('\n=== TEST COMPLETE ===');
}

testGCodeFromPrimitives().catch(err => {
    console.error('Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
