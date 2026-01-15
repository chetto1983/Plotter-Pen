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

    const primitives = parsed.primitives.map(p => {
        return JSON.parse(JSON.stringify(p));
    });

    console.log(`Sending ${primitives.length} primitives to CAM...`);

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

    // Save G-code to file for inspection
    await fs.writeFile('test/output_earrings.nc', result?.gcode || 'NO GCODE');
    console.log("Saved to test/output_earrings.nc");

    // Print G2/G3 lines for analysis
    const lines = (result?.gcode || '').split('\n');
    const arcLines = lines.filter(l => l.startsWith('G2 ') || l.startsWith('G3 '));
    console.log(`\\nArc commands: ${arcLines.length}`);
    arcLines.forEach((l, i) => console.log(`  ${i}: ${l}`));
};
run().catch(console.error);
