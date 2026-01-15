import fs from 'node:fs/promises';
import DxfParser from 'dxf-parser';
import { DXFImporter } from '../src/import/DXFImporter.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';

const DXF_PATH = 'C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf';

const run = async () => {
    const content = await fs.readFile(DXF_PATH, 'utf8');
    const importer = new DXFImporter(DxfParser);
    const parsed = await importer.parse(content, () => { });

    console.log(`Primitives: ${parsed.primitives.length}`);
    parsed.primitives.forEach((p, i) => {
        console.log(`[${i}] Type: ${p.type}, Closed: ${p.closed}, Points: ${p.points?.length}`);
    });

    // Run CAM
    // ...
};
run();
