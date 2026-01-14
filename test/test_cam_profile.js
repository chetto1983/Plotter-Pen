import { runCamGo } from '../server/workers/cam-go-bridge.js';

async function testProfile() {
    console.log('--- Testing Go CAM Profile Generation ---');

    const primitives = [
        { type: 'circle', cx: 5, cy: 5, radius: 5 }
    ];

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
            safetyHeight: 5,
            spindleRPM: 12000
        }
    });

    const gcode = result?.gcode ?? '';
    if (!gcode.trim()) {
        throw new Error('Profile G-code was empty.');
    }

    const arcLines = gcode.split('\n').filter(line => /^\s*G0?2\b/i.test(line) || /^\s*G0?3\b/i.test(line));
    if (arcLines.length === 0) {
        throw new Error('Expected profile G-code to include G2/G3 arcs for circles.');
    }

    console.log('[GENERATED G-CODE]');
    console.log(gcode);
}

testProfile().catch(err => {
    console.error(err);
    process.exit(1);
});
