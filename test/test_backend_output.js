
import { spawn } from 'child_process';
import path from 'path';

const enginePath = path.join(process.cwd(), 'server', 'cam-engine', 'cam-engine.exe');

// Mock simple square 10x10
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

const child = spawn(enginePath, [], { stdio: ['pipe', 'pipe', 'pipe'] });

let output = '';
let error = '';

child.stdout.on('data', d => output += d);
child.stderr.on('data', d => error += d);

child.on('close', code => {
    if (error) console.error("Stderr:", error);
    try {
        const json = JSON.parse(output);
        console.log("Stats:", json.stats);
        console.log("\n--- G-CODE ---");
        console.log(json.gcode);
    } catch (e) {
        console.log("Raw:", output);
    }
});

child.stdin.write(JSON.stringify(payload));
child.stdin.end();
