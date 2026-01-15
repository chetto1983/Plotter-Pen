/**
 * Test script to debug arc linearization
 */
import fs from 'node:fs/promises';
import { linearizeGCode } from '../src/cam/linearizeGCode.js';

const GCODE_PATH = 'test/output_earrings.nc';

const run = async () => {
    console.log('Reading G-code from:', GCODE_PATH);
    const gcode = await fs.readFile(GCODE_PATH, 'utf8');

    console.log('\nOriginal G-code lines:', gcode.split('\n').length);
    console.log('\nRunning linearization...\n');

    const linearized = linearizeGCode(gcode);

    console.log('\nLinearized G-code lines:', linearized.split('\n').length);

    // Count G2/G3 in original vs linearized
    const origArcs = (gcode.match(/G[23] /gi) || []).length;
    const linArcs = (linearized.match(/G[23] /gi) || []).length;

    console.log(`Original arcs: ${origArcs}, After linearization: ${linArcs}`);
};

run().catch(console.error);
