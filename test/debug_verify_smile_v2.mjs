
import fs from 'fs/promises';
import { runCamGo } from '../server/workers/cam-go-bridge.js';
import DxfParser from 'dxf-parser';

async function test() {
    console.log('Reading DXF...');
    const dxfContent = await fs.readFile('C:/Users/Davide/OneDrive - Sonepar/Documenti/Plotter-Pen/DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf', 'utf8');
    const parser = new DxfParser();
    const dxf = parser.parseSync(dxfContent);

    let primitives = [];

    // Extractor
    function extract(entities) {
        entities.forEach(entity => {
            if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
                const isArc = entity.type === 'ARC';
                primitives.push({
                    id: primitives.length + 1,
                    type: 'arc',
                    cx: entity.center.x,
                    cy: entity.center.y,
                    radius: entity.radius,
                    startAngle: isArc ? entity.startAngle : 0,
                    endAngle: isArc ? entity.endAngle : 2 * Math.PI,
                    clockwise: false
                });
            } else if (entity.type === 'LWPOLYLINE') {
                const pts = entity.vertices.map(v => ({ x: v.x, y: v.y }));
                primitives.push({
                    id: primitives.length + 1,
                    type: 'polyline',
                    points: pts,
                    closed: entity.shape
                });
            } else if (entity.type === 'SPLINE') {
                // SAMPLE SPLINE LOGIC
                if (entity.controlPoints && entity.controlPoints.length > 0) {
                    const degree = entity.degreeOfSplineCurve || 3;
                    const knots = entity.knotValues;
                    const controls = entity.controlPoints.map(p => [p.x, p.y]);

                    // Helper to simplify B-Spline sampling (Inline simplified or import)
                    // We will interpret it as Polyline for the backend

                    // Simple sampling (Generic)
                    const pts = [];
                    // Check if we can use the b-spline logic.
                    // Ideally we import it. For now, let's just use Control Points as approximation
                    // to verify the PIPELINE (Loop issue). 
                    // Verify: If we send control points as a Polyline, does it Offset?
                    // Yes, treated as Open Path.

                    // Wait, B-Spline visual quality depends on sampling.
                    // But for "Loop Debug", ANY open path works.
                    // I will just send a Polyline of Control Points tagged as "polyline".
                    // The backend sees "points".

                    const polyPts = entity.controlPoints.map(p => ({ x: p.x, y: p.y }));

                    primitives.push({
                        id: primitives.length + 1,
                        type: 'polyline', // Send as Polyline to avoid "Spline" handling complexity in V2 MVP
                        points: polyPts,
                        closed: false // FORCE OPEN
                    });
                }
            } else if (entity.type === 'INSERT') {
                // Ignore blocks for now
            }
        });
    }

    extract(dxf.entities);

    console.log(`Sending ${primitives.length} primitives (Profile)...`);

    const params = {
        primitives,
        type: 'profile',
        settings: {
            toolDiameter: 0.5,
            profileSide: 'outside',
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

    // Convert to JSON exactly as runCamGo does
    const inputPayload = JSON.stringify({
        primitives: params.primitives,
        type: params.type || 'profile',
        settings: params.settings || {}
    });

    await fs.writeFile('debug_input.json', inputPayload);
    console.log('Saved debug_input.json');

    const result = await runCamGo(params);

    console.log(`CAM Done. G-Code Length: ${result.gcode.length}`);
    await fs.writeFile('test/output_verify_smile_v2.nc', result.gcode);
}
test().catch(console.error);
