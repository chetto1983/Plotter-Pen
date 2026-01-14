/**
 * Test Pocket G-code Generation
 * Validates that closed primitives generate proper pocket toolpaths
 */
import { runCamGo } from '../server/workers/cam-go-bridge.js';

async function testPocketGCode() {
    console.log('=== TEST: Pocket G-code Generation ===\n');

    // Test with a simple rectangle
    console.log('[2] Testing pocket with rectangle...');
    const rectangle = [
        { type: 'rectangle', x: 100, y: 100, width: 50, height: 30 }
    ];

    const rectResult = await runCamGo({
        primitives: rectangle,
        type: 'pocket',
        settings: {
            toolDiameter: 3,
            stepOver: 40,
            startZ: 0,
            targetZ: -2,
            stepDown: 1,
            feedXY: 800,
            feedZ: 200,
            safetyHeight: 5
        }
    });

    const rectGcode = rectResult?.gcode ?? '';
    const lines = rectGcode.split('\n').filter(l => l.trim());

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
    const circle = [
        { type: 'circle', cx: 200, cy: 200, radius: 25 }
    ];

    const circleResult = await runCamGo({
        primitives: circle,
        type: 'pocket',
        settings: {
            toolDiameter: 3,
            stepOver: 40,
            startZ: 0,
            targetZ: -2,
            stepDown: 1,
            feedXY: 800,
            feedZ: 200,
            safetyHeight: 5
        }
    });

    const circleGcode = circleResult?.gcode ?? '';
    const circleLines = circleGcode.split('\n').filter(l => l.trim());
    const circleG1 = circleLines.filter(l => l.startsWith('G1'));
    const circleArcs = circleLines.filter(l => l.startsWith('G2') || l.startsWith('G3'));

    console.log(`    G-code lines: ${circleLines.length}`);
    console.log(`    G1 moves: ${circleG1.length}`);

    if (circleG1.length > 50) {
        console.log('    SUCCESS: Circle pocket generated many passes');
    }
    if (circleArcs.length === 0) {
        console.log('    WARNING: Expected circle pocket arcs but none found.');
    }

    console.log('\n=== TEST COMPLETE ===');
}

testPocketGCode().catch(err => {
    console.error('Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
