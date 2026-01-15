
import fs from 'fs';
import DxfParser from 'dxf-parser';
import { PrimitiveExtractor } from '../src/plc/PrimitiveExtractor.js';
import { runCamGo } from '../server/workers/cam-go-bridge.js';

const DXF_PATH = 'c:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf';

async function testDXFValidation() {
    console.log(`=== Validating DXF: ${DXF_PATH} ===`);

    if (!fs.existsSync(DXF_PATH)) {
        console.error('File not found!');
        return;
    }

    const fileContent = fs.readFileSync(DXF_PATH, 'utf-8');
    const parser = new DxfParser();
    let dxf = null;
    try {
        dxf = parser.parseSync(fileContent);
    } catch (err) {
        console.error('DXF Parse Error:', err);
        return;
    }

    const entities = dxf.entities;
    console.log(`DXF Parsed: ${entities.length} entities found.`);
    const types = entities.map(e => e.type);
    console.log('Entity Types:', [...new Set(types)]);
    fs.writeFileSync('debug_types.json', JSON.stringify([...new Set(types)], null, 2));

    // 1. PLC EXTRACTION

    console.log('\n--- 1. Testing PLC Extraction ---');
    // Map DXF entities to "strokes"
    const strokes = entities.map(ent => {
        if (ent.type === 'LINE') {
            return {
                tool: 'line',
                length: 2,
                0: { x: ent.vertices[0].x, y: ent.vertices[0].y },
                1: { x: ent.vertices[1].x, y: ent.vertices[1].y },
                [Symbol.iterator]: function* () { yield this[0]; yield this[1]; }
            };
        }
        // Handle other types if needed (CIRCLE, ARC, LWPOLYLINE)
        // For simple test, we assume lines or linear approximations
        if (ent.type === 'LWPOLYLINE') {
            const stroke = [];
            stroke.tool = 'polygon';
            ent.vertices.forEach(v => stroke.push({ x: v.x, y: v.y }));
            // Add Iterator
            stroke[Symbol.iterator] = function* () { for (let p of this) yield p; };
            return stroke;
        }
        return null;
    }).filter(s => s !== null);

    const extractor = new PrimitiveExtractor();
    const plcResult = extractor.extractFromStrokes(strokes);
    console.log(`PLC Extracted Primitives: ${plcResult.length}`);

    // 2. CAM EXTRACTION
    console.log('\n--- 2. Testing CAM Extraction ---');

    // Convert to CAM Primitives
    const camPrimitives = [];
    entities.forEach(ent => {
        if (ent.type === 'LINE') {
            camPrimitives.push({
                type: 'line',
                x1: ent.vertices[0].x, y1: ent.vertices[0].y,
                x2: ent.vertices[1].x, y2: ent.vertices[1].y
            });
        } else if (ent.type === 'LWPOLYLINE') {
            camPrimitives.push({
                type: 'polyline',
                points: ent.vertices.map(v => ({ x: v.x, y: v.y })),
                closed: ent.shape // 'shape' often implies closed if true? Need to check exact prop
            });
        } else if (ent.type === 'CIRCLE') {
            camPrimitives.push({
                type: 'circle',
                cx: ent.center.x, cy: ent.center.y,
                radius: ent.radius
            });
        } else if (ent.type === 'SPLINE') {
            if (ent.controlPoints && ent.controlPoints.length > 0) {
                camPrimitives.push({
                    type: 'spline',
                    controlPoints: ent.controlPoints.map(p => ({ x: p.x, y: p.y })),
                    knots: ent.knotValues,
                    degree: ent.degreeOfSplineCurve,
                    closed: ent.closed === true || ent.formDegree === 1
                });
            }
        }
    });

    console.log(`Sending ${camPrimitives.length} primitives to CAM...`);

    const camSettings = {
        profileSide: 'outside',
        toolDiameter: 3.0,
        stepOver: 40,
        startZ: 0,
        targetZ: -1,
        stepDown: 1,
        tolerance: 0.5 // Validating robust stitching
    };

    // Test PROFILE
    try {
        console.log('Testing PROFILE...');
        const profileRes = await runCamGo({
            primitives: camPrimitives,
            type: 'profile',
            settings: camSettings
        }, 5000);
        console.log(`Profile Result: ${profileRes.stats?.gcodeLines} lines, ${profileRes.stats?.loops} loops`);
    } catch (e) {
        console.error('CAM Profile Error:', e.message);
    }

    // Test POCKET
    try {
        console.log('Testing POCKET...');
        const pocketRes = await runCamGo({
            primitives: camPrimitives,
            type: 'pocket',
            settings: camSettings
        }, 5000);
        console.log(`Pocket Result: ${pocketRes.stats?.gcodeLines} lines, ${pocketRes.stats?.loops} loops`);

        if (pocketRes.stats.loops === 0) {
            console.log('-> Pocket generated 0 loops. This indicates OPEN GEOMETRY or DISCONNECTED segments in DXF.');
        }
    } catch (e) {
        console.error('CAM Pocket Error:', e.message);
    }
}

testDXFValidation().catch(console.error);
