/**
 * Test Pocket G-code Generation
 * Validates that closed primitives generate proper pocket toolpaths
 */
import { ClipperWrapper } from '../src/cam/ClipperWrapper.js';
import { GCodeFromPrimitives } from '../src/cam/GCodeFromPrimitives.js';

async function testPocketGCode() {
    console.log('=== TEST: Pocket G-code Generation ===\n');

    // Initialize Clipper2 WASM
    console.log('[1] Initializing Clipper2 WASM...');
    await ClipperWrapper.init();
    console.log('    OK\n');

    // Test with a simple rectangle
    console.log('[2] Testing pocket with rectangle...');
    const rectangle = {
        type: 'rectangle',
        x: 100,
        y: 100,
        width: 50,
        height: 30
    };

    const generator = new GCodeFromPrimitives({
        precision: 3,
        safeZ: 5,
        feedXY: 800,
        feedZ: 200,
        targetZ: -2,
        toolRadius: 1.5,
        toolDiameter: 3,
        stepOver: 40
    });

    const gcode = await generator.generatePocket([rectangle]);
    const lines = gcode.split('\n').filter(l => l.trim());

    console.log(`    G-code lines: ${lines.length}`);

    // Count G1 moves (pocket passes)
    const g1Lines = lines.filter(l => l.startsWith('G1'));
    console.log(`    G1 moves: ${g1Lines.length}`);

    if (g1Lines.length > 10) {
        console.log('    SUCCESS: Multiple pocket passes generated');
    } else {
        console.log('    WARNING: Few pocket passes - may need adjustment');
    }

    // Show sample
    console.log('\n[3] G-code sample (first 15 lines):');
    lines.slice(0, 15).forEach(l => console.log('    ' + l));

    // Test with a circle
    console.log('\n[4] Testing pocket with circle...');
    const circle = {
        type: 'circle',
        cx: 200,
        cy: 200,
        radius: 25
    };

    const circleGcode = await generator.generatePocket([circle]);
    const circleLines = circleGcode.split('\n').filter(l => l.trim());
    const circleG1 = circleLines.filter(l => l.startsWith('G1'));

    console.log(`    G-code lines: ${circleLines.length}`);
    console.log(`    G1 moves: ${circleG1.length}`);

    if (circleG1.length > 50) {
        console.log('    SUCCESS: Circle pocket generated many passes');
    }

    console.log('\n=== TEST COMPLETE ===');
}

testPocketGCode().catch(err => {
    console.error('Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
