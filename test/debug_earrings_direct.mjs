
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';

const DXF_PATH = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf';
const BIN_PATH = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/server/cam-engine/cam-engine.exe';

const run = async () => {
    console.log(`Reading ${DXF_PATH}`);
    const content = await fs.readFile(DXF_PATH, 'utf8');
    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => { });

    // Serialize
    const serializePrimitive = (prim) => {
        if (!prim || !prim.type) return null;
        const data = { type: prim.type };
        switch (prim.type) {
            case 'circle':
                data.cx = prim.center?.x ?? prim.cx;
                data.cy = prim.center?.y ?? prim.cy;
                data.radius = prim.radius ?? prim._radius;
                break;
            case 'arc':
                data.cx = prim.cx ?? prim.center?.x;
                data.cy = prim.cy ?? prim.center?.y;
                data.radius = prim.radius;
                data.startAngle = prim.startAngle ?? prim._startAngle;
                data.sweep = prim.sweep ?? prim._sweep;
                data.x1 = prim.x1; data.y1 = prim.y1; data.x2 = prim.x2; data.y2 = prim.y2;
                break;
            case 'line':
                data.x1 = prim.x1; data.y1 = prim.y1; data.x2 = prim.x2; data.y2 = prim.y2;
                break;
        }
        return data;
    };

    const primitives = parsed.primitives.map(serializePrimitive).filter(Boolean);

    // Prepare payload
    const payload = {
        primitives,
        type: 'profile',
        settings: {
            toolDiameter: 0.1,
            stepOver: 40,
            startZ: 0,
            targetZ: -1,
            stepDown: 1,
            feedXY: 1000,
            feedZ: 500,
            safetyHeight: 5,
            tolerance: 0.01
        }
    };

    console.log("Spawning CAM Engine directly...");
    const logFile = await fs.open('cam_debug.log', 'w');
    const proc = spawn(BIN_PATH, [], {
        stdio: ['pipe', 'inherit', logFile.fd]
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();

    proc.on('close', async (code) => {
        console.log(`CAM Engine exited with code ${code}`);
        await logFile.close();
        const logs = await fs.readFile('cam_debug.log', 'utf8');
        console.log("--- CAM ENGINE STDERR LOGS ---");
        console.log(logs);
        console.log("------------------------------");
    });
};
run();
