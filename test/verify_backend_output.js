/**
 * Regression Test for CAM Backend
 * Verifies that straight edges are output as lines (G1) not huge arcs (G2/G3).
 * Run with: node test/verify_backend_output.js
 */
import { spawn } from 'child_process';
import path from 'path';

const enginePath = path.join(process.cwd(), 'server', 'cam-engine', 'cam-engine.exe');

// Simple square 100x100
const payload = {
    "type": "profile",
    "settings": {
        "ToolDiameter": 1.0,
        "SafetyHeight": 5.0,
        "ProfileSide": "outside"
    },
    "primitives": [
        {
            "id": "1",
            "type": "polygon",
            "points": [
                { "x": 0, "y": 0 },
                { "x": 100, "y": 0 },
                { "x": 100, "y": 100 },
                { "x": 0, "y": 100 }
            ],
            "closed": true
        }
    ]
};

console.log(`Running CAM Engine: ${enginePath}`);
const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

let output = '';
let error = '';

child.stdout.on('data', d => output += d);
child.stderr.on('data', d => error += d);

child.on('close', code => {
    if (code !== 0) {
        console.error("Engine failed:", error);
        process.exit(1);
    }

    try {
        const json = JSON.parse(output);
        const gcode = json.gcode || '';
        const lines = gcode.split('\n');

        // Count G1 lines vs G2/G3 lines
        const g1Count = lines.filter(l => l.startsWith('G1 ')).length;
        const arcCount = lines.filter(l => l.startsWith('G2 ') || l.startsWith('G3 ')).length;

        console.log(`Stats: ${g1Count} Lines, ${arcCount} Arcs`);

        // Expectation: A square with rounded corners should have 4 Lines (sides) and 4 Arcs (corners)
        // If we see 0 Lines and 1 big Arc, it's the "Disaster".
        if (g1Count < 4) {
            console.error("FAIL: Expected at least 4 linear moves for a square!");
            process.exit(1);
        }

        if (arcCount > 10) {
            console.error("FAIL: Too many arcs for a simple square!");
            process.exit(1);
        }

        console.log("PASS: Geometry looks correct.");

    } catch (e) {
        console.error("Failed to parse output:", e);
        process.exit(1);
    }
});

child.stdin.write(JSON.stringify(payload));
child.stdin.end();
