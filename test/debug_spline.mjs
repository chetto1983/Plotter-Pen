/**
 * Debug script to test spline evaluation and rendering
 */

import bSpline from '../src/geometry/b-spline.js';
import { DxfParser } from 'dxf-parser';
import fs from 'fs';

const dxfContent = fs.readFileSync('./DXF/Laser Cut Wooden Earring Blanks Dangle Charms .dxf', 'utf-8');
const parser = new DxfParser();
const dxf = parser.parseSync(dxfContent);

console.log('=== DXF Debug ===');
console.log('Entities:', dxf.entities.length);
console.log('Entity types:', dxf.entities.map(e => e.type));

// Look at each spline
dxf.entities.filter(e => e.type === 'SPLINE').forEach((spline, idx) => {
    console.log(`\n=== SPLINE ${idx + 1} ===`);
    console.log('Degree:', spline.degreeOfSplineCurve);
    console.log('Closed:', spline.closed);
    console.log('Control Points:', spline.controlPoints?.length);
    console.log('Knots:', spline.knotValues?.length);
    console.log('Fit Points:', spline.fitPoints?.length);

    if (spline.controlPoints && spline.controlPoints.length > 0) {
        console.log('First CP:', spline.controlPoints[0]);
        console.log('Last CP:', spline.controlPoints[spline.controlPoints.length - 1]);

        // Check if closed (first == last)
        const first = spline.controlPoints[0];
        const last = spline.controlPoints[spline.controlPoints.length - 1];
        const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
        console.log('First-Last distance:', dist.toFixed(6));
    }

    // Sample some points
    if (spline.controlPoints && spline.knotValues) {
        const degree = spline.degreeOfSplineCurve || 3;
        const knots = spline.knotValues;
        const cp = spline.controlPoints.map(p => [p.x, p.y]);

        const minT = knots[degree];
        const maxT = knots[knots.length - 1 - degree];

        console.log('Parameter range:', minT, 'to', maxT);

        // Sample at start and end
        try {
            const startPt = bSpline(minT, degree, cp, knots);
            const endPt = bSpline(maxT, degree, cp, knots);
            console.log('Curve start:', startPt);
            console.log('Curve end:', endPt);

            const curveDist = Math.sqrt((startPt[0] - endPt[0]) ** 2 + (startPt[1] - endPt[1]) ** 2);
            console.log('Curve start-end distance:', curveDist.toFixed(6));
        } catch (e) {
            console.log('Error sampling:', e.message);
        }
    }
});
