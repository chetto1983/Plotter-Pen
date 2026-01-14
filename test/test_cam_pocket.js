import { runCamGo } from '../server/workers/cam-go-bridge.js';

async function runTest() {
    const primitives = [
        { type: 'circle', cx: 0, cy: 0, radius: 10 }
    ];

    const result = await runCamGo({
        primitives,
        type: 'pocket',
        settings: {
            toolDiameter: 3,
            stepOver: 40,
            startZ: 0,
            targetZ: -1,
            stepDown: 1,
            feedXY: 800,
            feedZ: 200,
            safetyHeight: 5
        }
    });

    const gcode = result?.gcode ?? '';
    if (!gcode.trim()) {
        throw new Error('Pocket G-code was empty.');
    }

    const arcLines = gcode.split('\n').filter(line => /^\s*G0?2\b/i.test(line) || /^\s*G0?3\b/i.test(line));
    if (arcLines.length === 0) {
        throw new Error('Expected pocket G-code to include G2/G3 arcs for circle pockets.');
    }

    console.log('Pocket arc fitting test passed.');
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
