import { ToolpathGenerator } from '../src/cam/ToolpathGenerator.js';
import { MachineConfig } from '../src/cam/MachineConfig.js';
import { ToolLibrary } from '../src/cam/ToolLibrary.js';
import { ClipperWrapper } from '../src/cam/ClipperWrapper.js';

async function testProfile() {
    console.log('--- Testing Profile Generation ---');

    // Initialize clipper2-wasm
    await ClipperWrapper.init();

    // 1. Setup
    const machine = new MachineConfig();
    const toolLib = new ToolLibrary();
    toolLib.addTool({
        id: 't1',
        name: 'Endmill 3mm',
        diameter: 3,
        defaults: {
            spindleRPM: 12000,
            feedXY: 800,
            feedZ: 200,
            stepDown: 1
        }
    });

    const generator = new ToolpathGenerator(machine, toolLib);

    // 2. Create Operation (Letter 'L' shape)
    // (0,0) -> (0,10) -> (5,10) -> (5,2) -> (10,2) -> (10,0) -> (0,0)
    const points = [
        { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 5, y: 10 },
        { x: 5, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 0 },
        { x: 0, y: 0 } // Closed
    ];

    const job = {
        operations: [{
            id: 'op1',
            type: 'profile',
            name: 'Profile L',
            toolId: 't1',
            points: points,
            closed: true,
            side: 'outside', // Offset
            startZ: 0,
            targetZ: -1,
            stepDown: 1
        }]
    };

    // 3. Generate
    try {
        const gcode = await generator.generateJob(job);
        console.log('[GENERATED G-CODE]');
        console.log(gcode);
    } catch (e) {
        console.error('Generation Error:', e);
        process.exit(1);
    }
}

testProfile().catch(err => {
    console.error(err);
    process.exit(1);
});
