import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const DXF_PATH = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf';

const run = async () => {
    console.log(`Reading ${DXF_PATH}`);
    const content = await fs.readFile(DXF_PATH, 'utf8');
    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => { });

    // Use standard toJSON via JSON.parse(JSON.stringify(obj)) or just map
    // Since runCamGo expects plain objects, we can map using the object's properties
    // But importantly, we want to test if `toJSON` works.
    // DXFImporter returns Arc instances.
    const primitives = parsed.primitives.map(p => {
        // We must mimic what happens over the wire (JSON.stringify -> JSON.parse)
        return JSON.parse(JSON.stringify(p));
    });

    console.log(`Sending ${primitives.length} primitives to CAM...`);
    // Debug: check first arc
    const arc = primitives.find(p => p.type === 'arc');
    if (arc) console.log("Debug check Arc radius:", arc.radius);

    const result = await runCamGo({
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
    });

    console.log("CAM Done. G-Code Length:", result?.gcode?.length);
};
run().catch(console.error);
