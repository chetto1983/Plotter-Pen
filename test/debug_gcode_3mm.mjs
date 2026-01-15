/**
 * Debug G-code generation with tool offset
 */
import fs from 'node:fs/promises';
import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';

const DXF_PATH = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf';

const run = async () => {
    console.log(`Reading ${DXF_PATH}`);
    const content = await fs.readFile(DXF_PATH, 'utf8');
    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => { });

    const primitives = parsed.primitives.map(p => JSON.parse(JSON.stringify(p)));

    console.log(`\nSending ${primitives.length} primitives to CAM with 3mm tool...`);

    // Use 0.5mm tool as user specified
    const result = await runCamGo({
        primitives,
        type: 'profile',
        settings: {
            toolDiameter: 0.5,  // 0.5mm as user specified
            profileSide: 'inside',  // Try inside cut
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

    console.log("\nCAM Done. G-Code Length:", result?.gcode?.length);

    // Save and analyze G-code
    await fs.writeFile('test/output_earrings_3mm.nc', result?.gcode || 'NO GCODE');
    console.log("Saved to test/output_earrings_3mm.nc");

    // Print all lines for analysis
    const lines = (result?.gcode || '').split('\n');
    console.log("\n=== G-CODE OUTPUT ===");
    lines.forEach((l, i) => {
        if (l.startsWith('G2 ') || l.startsWith('G3 ') || l.startsWith('; Profile')) {
            console.log(`${i}: ${l}`);
        }
    });
};

run().catch(console.error);
