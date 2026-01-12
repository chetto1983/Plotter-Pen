
import { PrimitiveExtractor } from './src/plc/PrimitiveExtractor.js';
// Mock dependency imports if Node resolve fails, or ensure we run with appropriate flags
// PrimitiveExtractor imports from ../geometry/primitives.js. We rely on Node resolving relative paths.

// Mock stroke data (approximate circle)
const points = [];
const R = 10;
const CX = 50, CY = 50;
for (let i = 0; i <= 20; i++) {
    const angle = (i / 20) * (Math.PI / 2); // 90 degrees
    points.push({
        x: CX + R * Math.cos(angle),
        y: CY + R * Math.sin(angle)
    });
}

const extractor = new PrimitiveExtractor();
const primitives = extractor.detectPrimitives(points, 0);

console.log('--- Primitive Quality Check ---');
primitives.forEach(p => {
    if (p.type === 'arc') {
        const startR = Math.hypot(p.x1 - p.cx, p.y1 - p.cy);
        const endR = Math.hypot(p.x2 - p.cx, p.y2 - p.cy);
        const diff = Math.abs(startR - endR);

        console.log(`[ARC ${p.id}]`);
        console.log(`  Start R: ${startR.toFixed(5)}`);
        console.log(`  End R:   ${endR.toFixed(5)}`);
        console.log(`  Diff:    ${diff.toFixed(5)}`);
        console.log(`  Center:  ${p.cx.toFixed(4)}, ${p.cy.toFixed(4)}`);

        if (diff > 0.001) {
            console.error('  FAIL: Radius mismatch > 0.001');
            process.exit(1);
        } else {
            console.log('  PASS');
        }
    } else {
        console.log(`[${p.type.toUpperCase()} ${p.id}]`);
    }
});
