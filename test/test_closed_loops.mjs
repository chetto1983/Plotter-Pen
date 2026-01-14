/**
 * Test Closed Loop Detection - O(n log n) with Spatial Indexing
 * Tests segment connection using grid-based spatial indexing
 */
import { buildClosedLoops, buildSelectionPaths } from '../src/cam/selectionUtils.js';

console.log('=== TEST: Closed Loop Detection (Spatial Grid) ===\n');

// Test 1: Direct closed shapes (circle, rectangle)
console.log('[1] Testing direct closed shapes...');
const directShapes = [
    { type: 'circle', cx: 50, cy: 50, radius: 20 },
    { type: 'rectangle', x: 100, y: 100, width: 30, height: 20 }
];

const loops1 = buildClosedLoops(directShapes);
console.log(`    Input: 1 circle + 1 rectangle`);
console.log(`    Output: ${loops1.length} closed loop(s)`);
if (loops1.length === 2) {
    console.log('    SUCCESS\n');
} else {
    console.log('    FAIL\n');
    process.exit(1);
}

// Test 2: 4 lines forming a square (should connect)
console.log('[2] Testing 4 connected lines forming a square...');
const lines = [
    { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
    { type: 'line', x1: 10, y1: 0, x2: 10, y2: 10 },
    { type: 'line', x1: 10, y1: 10, x2: 0, y2: 10 },
    { type: 'line', x1: 0, y1: 10, x2: 0, y2: 0 }
];

const loops2 = buildClosedLoops(lines);
console.log(`    Input: 4 lines`);
console.log(`    Output: ${loops2.length} closed loop(s)`);
if (loops2.length === 1) {
    console.log(`    Points in loop: ${loops2[0].length}`);
    console.log('    SUCCESS: Lines connected into closed loop\n');
} else {
    console.log('    FAIL: Expected 1 closed loop\n');
    process.exit(1);
}

// Test 3: Arc + lines forming closed shape
console.log('[3] Testing arc + lines forming closed shape...');
const arcAndLines = [
    { type: 'arc', cx: 5, cy: 0, radius: 5, startAngle: 0, sweep: Math.PI, x1: 10, y1: 0, x2: 0, y2: 0 },
    { type: 'line', x1: 0, y1: 0, x2: 0, y2: -10 },
    { type: 'line', x1: 0, y1: -10, x2: 10, y2: -10 },
    { type: 'line', x1: 10, y1: -10, x2: 10, y2: 0 }
];

const loops3 = buildClosedLoops(arcAndLines);
console.log(`    Input: 1 arc + 3 lines`);
console.log(`    Output: ${loops3.length} closed loop(s)`);
if (loops3.length === 1) {
    console.log(`    Points in loop: ${loops3[0].length}`);
    console.log('    SUCCESS\n');
} else {
    console.log('    FAIL\n');
    process.exit(1);
}

// Test 4: Mixed - circle + connected lines (separate shapes)
console.log('[4] Testing mixed: circle + connected lines...');
const mixed = [
    { type: 'circle', cx: 0, cy: 0, radius: 10 },
    { type: 'line', x1: 50, y1: 50, x2: 60, y2: 50 },
    { type: 'line', x1: 60, y1: 50, x2: 60, y2: 60 },
    { type: 'line', x1: 60, y1: 60, x2: 50, y2: 60 },
    { type: 'line', x1: 50, y1: 60, x2: 50, y2: 50 }
];

const loops4 = buildClosedLoops(mixed);
console.log(`    Input: 1 circle + 4 lines`);
console.log(`    Output: ${loops4.length} closed loop(s)`);
if (loops4.length === 2) {
    console.log('    SUCCESS: Circle + connected lines = 2 separate loops\n');
} else {
    console.log(`    FAIL: Expected 2, got ${loops4.length}\n`);
    process.exit(1);
}

// Test 5: buildSelectionPaths returns proper structure
console.log('[5] Testing buildSelectionPaths structure...');
const { loops: pathLoops, openPaths } = buildSelectionPaths(directShapes);
console.log(`    Loops: ${pathLoops.length}, Open paths: ${openPaths.length}`);
if (pathLoops.length === 2 && pathLoops[0].points && pathLoops[0].circleData) {
    console.log('    SUCCESS: Structure includes points and circleData\n');
} else {
    console.log('    FAIL: Missing structure\n');
    process.exit(1);
}

console.log('=== ALL TESTS PASSED ===');
