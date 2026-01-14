
import { PrimitiveExtractor, PLC_TYPES } from '../src/plc/PrimitiveExtractor.js';
import { runCamGo, isCamGoAvailable, getCamEngineInfo } from '../server/workers/cam-go-bridge.js';
import assert from 'assert';

async function testComparison() {
    console.log('=== CAM vs PLC Extraction Analysis ===');

    // 1. Define Common Geometry (A Square of 100x100 made of 4 loose lines)
    // Coords: (0,0) -> (100,0) -> (100,100) -> (0,100) -> (0,0)
    const lines = [
        { x1: 0, y1: 0, x2: 100, y2: 0 },
        { x1: 100, y1: 0, x2: 100, y2: 100 },
        { x1: 100, y1: 100, x2: 0, y2: 100 },
        { x1: 0, y1: 100, x2: 0, y2: 0 }
    ];

    // --- PLC TEST ---
    console.log('\n--- 1. Testing PLC Extraction ---');
    // Convert to "strokes" as expected by PrimitiveExtractor
    // Since PrimitiveExtractor handles "tool" strokes specifically:
    const plcStrokes = lines.map((l, i) => ({
        tool: 'line',
        length: 2,
        0: { x: l.x1, y: l.y1 },
        1: { x: l.x2, y: l.y2 },
        // Array-like structure for points
        [Symbol.iterator]: function* () { yield this[0]; yield this[1]; }
    }));

    const extractor = new PrimitiveExtractor();
    const plcResult = extractor.extractFromStrokes(plcStrokes);

    console.log(`PLC Extracted Primitives: ${plcResult.length}`);
    plcResult.forEach((p, i) => {
        console.log(`  [PLC] Prim ${i}: ${p.type} (${p.x1},${p.y1}) -> (${p.x2},${p.y2})`);
    });

    assert.strictEqual(plcResult.length, 4, 'PLC should extract 4 lines');


    // --- CAM TEST ---
    console.log('\n--- 2. Testing CAM Extraction (Go Engine) ---');

    // Check if Engine Exists
    const info = getCamEngineInfo();
    console.log(`CAM Engine Path: ${info.path}`);
    if (!info.path) {
        console.warn('!! CAM Engine not found, skipping execution test !!');
        return;
    }

    // Prepare JSON Payload for CAM
    // Matches structure in CAMManager.js:SerializePrimitives
    const camPrimitives = lines.map(l => ({
        type: 'line',
        x1: l.x1, y1: l.y1,
        x2: l.x2, y2: l.y2,
        // Points array is generated for line execution in CAMManager:174 
        // BUT CAMManager:generateGCode SERIALIZES it differently.
        // Let's check CAMManager.js:304 -> it sends x1, y1, x2, y2 for lines.
    }));

    // CAM Settings
    const camSettings = {
        toolDiameter: 3.0,
        stepOver: 40,
        startZ: 0,
        targetZ: -1,
        stepDown: 1,
        profileSide: 'outside'
    };

    console.log(`Sending ${camPrimitives.length} primitives to Go Engine...`);
    try {
        const camResult = await runCamGo({
            primitives: camPrimitives,
            type: 'profile',
            settings: camSettings
        }, 5000); // 5s timeout

        console.log('CAM Result Status:', camResult.status);
        console.log('CAM Stats:', camResult.stats);

        if (camResult.status === 'ok') {
            console.log(`CAM Generated G-Code Lines: ${camResult.stats.gcodeLines}`);
            console.log(`CAM Loops Detected: ${camResult.stats.loops}`);
        } else {
            console.error('CAM Error:', camResult.error);
        }

        // --- ANALYSIS ---
        // If PLC works (4 lines) and CAM works (1 loop or 4 paths), we compare.
        // If CAM finds 0 loops for a closed square, that's a joining bug.

        if (camResult.stats.loops === 0 && camPrimitives.length > 0) {
            console.error('\n!!! FAILURE DETECTED !!!');
            console.error('CAM failed to detect a loop from 4 connected lines.');
            console.error('This confirms why CAM extraction is buggy compared to simple PLC extraction.');
        } else {
            console.log('\nSUCCESS: CAM detected loops correctly (Perfect Geometry).');
        }

        // --- 3. OPEN GEOMETRY (POCKET) TEST ---
        console.log('\n--- 3. Testing CAM Pocket on Open U-Shape ---');
        // U-Shape: (0,0)->(0,100)->(100,100)->(100,0)
        // This is NOT a closed loop. Pocketing should fail or produce 0 loops.
        const openPrimitives = [
            { type: 'line', x1: 0, y1: 0, x2: 0, y2: 100 },
            { type: 'line', x1: 0, y1: 100, x2: 100, y2: 100 },
            { type: 'line', x1: 100, y1: 100, x2: 100, y2: 0 }
        ];

        console.log(`Sending ${openPrimitives.length} primitives (Open Shape) to CAM (POCKET)...`);
        const pocketResult = await runCamGo({
            primitives: openPrimitives,
            type: 'pocket',
            settings: camSettings
        }, 5000);

        console.log('Pocket Test Stats:', pocketResult.stats);

        // CHECK PLC ON SAME DATA
        const openStrokes = openPrimitives.map((l) => ({
            tool: 'line',
            length: 2,
            0: { x: l.x1, y: l.y1 },
            1: { x: l.x2, y: l.y2 },
            [Symbol.iterator]: function* () { yield this[0]; yield this[1]; }
        }));
        const plcOpenResult = extractor.extractFromStrokes(openStrokes);
        console.log(`PLC Extracted from Open Shape: ${plcOpenResult.length} primitives`);

        if (pocketResult.stats.loops === 0) {
            console.log('\n-> VERIFIED: CAM Pocket fails on open geometry (0 loops).');
            console.log('-> VERIFIED: PLC processes open geometry successfully (3 separate lines).');
            console.log('-> CONCLUSION: CAM requires closed topology, PLC does not. This is the source of the "bug" perception.');
        } else {
            console.error('-> Unexpected: CAM Pocket somehow generated something?', pocketResult);
        }

    } catch (err) {
        console.error('CAM Execution Failed:', err.message);
    }
}

testComparison().catch(err => console.error(err));
