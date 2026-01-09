/**
 * Test file for ArcBuilder.fromThreePoints
 * Tests that arcs created from 3 points have the correct direction and aux point
 */


import { ArcBuilder } from '../src/geometry/arcBuilder.js';
import { PLCOutputGenerator } from '../src/plc/extraction.js';

function assertEqual(actual, expected, message, tolerance = 0.01) {
  if (Math.abs(actual - expected) > tolerance) {
    console.log(`  FAIL: ${message}`);
    console.log(`    Expected: ${expected}`);
    console.log(`    Actual: ${actual}`);
    return false;
  }
  console.log(`  PASS: ${message}`);
  return true;
}

function assertLessThan(actual, threshold, message) {
  if (actual >= threshold) {
    console.log(`  FAIL: ${message}`);
    console.log(`    Expected < ${threshold}, got ${actual}`);
    return false;
  }
  console.log(`  PASS: ${message}`);
  return true;
}

function assertGreaterThan(actual, threshold, message) {
  if (actual <= threshold) {
    console.log(`  FAIL: ${message}`);
    console.log(`    Expected > ${threshold}, got ${actual}`);
    return false;
  }
  console.log(`  PASS: ${message}`);
  return true;
}

// Test 1: Arc curving LEFT (through point LEFT of chord)
function testArcCurvingLeft() {
  console.log('\n=== TEST 1: Arc curving LEFT ===');
  console.log('Arc goes from top to bottom, curving to the LEFT');

  const start = { x: 300, y: 100 };
  const through = { x: 150, y: 250 };  // LEFT of chord
  const end = { x: 300, y: 400 };

  console.log(`  Start: (${start.x}, ${start.y})`);
  console.log(`  Through: (${through.x}, ${through.y})`);
  console.log(`  End: (${end.x}, ${end.y})`);

  const arc = ArcBuilder.fromThreePoints(start, through, end);

  if (!arc) {
    console.log('  FAIL: Arc creation returned null');
    return false;
  }

  console.log(`\n  Arc properties:`);
  console.log(`    Center: (${arc.cx.toFixed(3)}, ${arc.cy.toFixed(3)})`);
  console.log(`    Radius: ${arc.radius.toFixed(3)}`);
  console.log(`    isClockwise: ${arc.isClockwise}`);
  console.log(`    sweep: ${arc.sweep.toFixed(3)} (${(arc.sweep * 180 / Math.PI).toFixed(1)}°)`);

  const midpoint = arc.midpoint;
  console.log(`\n  Midpoint (aux point): (${midpoint.x.toFixed(3)}, ${midpoint.y.toFixed(3)})`);

  // The aux point should be on the LEFT side (X < 300)
  let allPass = true;
  allPass = assertLessThan(midpoint.x, 300, 'Aux point X < 300 (on LEFT side)') && allPass;

  // The aux point should be near the through point
  const distToThrough = Math.sqrt((midpoint.x - through.x) ** 2 + (midpoint.y - through.y) ** 2);
  console.log(`  Distance from aux point to through point: ${distToThrough.toFixed(3)}`);
  allPass = assertLessThan(distToThrough, 50, 'Aux point near through point') && allPass;

  return allPass;
}

// Test 2: Arc curving RIGHT (through point RIGHT of chord)
function testArcCurvingRight() {
  console.log('\n=== TEST 2: Arc curving RIGHT ===');
  console.log('Arc goes from top to bottom, curving to the RIGHT');

  const start = { x: 300, y: 100 };
  const through = { x: 450, y: 250 };  // RIGHT of chord
  const end = { x: 300, y: 400 };

  console.log(`  Start: (${start.x}, ${start.y})`);
  console.log(`  Through: (${through.x}, ${through.y})`);
  console.log(`  End: (${end.x}, ${end.y})`);

  const arc = ArcBuilder.fromThreePoints(start, through, end);

  if (!arc) {
    console.log('  FAIL: Arc creation returned null');
    return false;
  }

  console.log(`\n  Arc properties:`);
  console.log(`    Center: (${arc.cx.toFixed(3)}, ${arc.cy.toFixed(3)})`);
  console.log(`    Radius: ${arc.radius.toFixed(3)}`);
  console.log(`    isClockwise: ${arc.isClockwise}`);
  console.log(`    sweep: ${arc.sweep.toFixed(3)} (${(arc.sweep * 180 / Math.PI).toFixed(1)}°)`);

  const midpoint = arc.midpoint;
  console.log(`\n  Midpoint (aux point): (${midpoint.x.toFixed(3)}, ${midpoint.y.toFixed(3)})`);

  // The aux point should be on the RIGHT side (X > 300)
  let allPass = true;
  allPass = assertGreaterThan(midpoint.x, 300, 'Aux point X > 300 (on RIGHT side)') && allPass;

  // The aux point should be near the through point
  const distToThrough = Math.sqrt((midpoint.x - through.x) ** 2 + (midpoint.y - through.y) ** 2);
  console.log(`  Distance from aux point to through point: ${distToThrough.toFixed(3)}`);
  allPass = assertLessThan(distToThrough, 50, 'Aux point near through point') && allPass;

  return allPass;
}

// Test 3: User's actual arc (similar to screenshot values)
function testUserArc() {
  console.log('\n=== TEST 3: User arc (from screenshot) ===');

  // Estimated values from user's screenshot
  const start = { x: 265, y: 123 };
  const through = { x: 70, y: 280 };  // Arc bulges to the LEFT
  const end = { x: 201, y: 430 };

  console.log(`  Start: (${start.x}, ${start.y})`);
  console.log(`  Through: (${through.x}, ${through.y})`);
  console.log(`  End: (${end.x}, ${end.y})`);

  const arc = ArcBuilder.fromThreePoints(start, through, end);

  if (!arc) {
    console.log('  FAIL: Arc creation returned null');
    return false;
  }

  console.log(`\n  Arc properties:`);
  console.log(`    Center: (${arc.cx.toFixed(3)}, ${arc.cy.toFixed(3)})`);
  console.log(`    Radius: ${arc.radius.toFixed(3)}`);
  console.log(`    isClockwise: ${arc.isClockwise}`);
  console.log(`    sweep: ${arc.sweep.toFixed(3)} (${(arc.sweep * 180 / Math.PI).toFixed(1)}°)`);

  const midpoint = arc.midpoint;
  console.log(`\n  Midpoint (aux point): (${midpoint.x.toFixed(3)}, ${midpoint.y.toFixed(3)})`);

  // The aux point should be on the LEFT side of the chord
  const _chordMidX = (start.x + end.x) / 2;  // ~233
  let allPass = true;

  // Aux point X should be less than both start and end X (on the left side)
  allPass = assertLessThan(midpoint.x, Math.min(start.x, end.x), 'Aux point on LEFT of arc endpoints') && allPass;

  return allPass;
}

// Test 4: Full PLC extraction flow with fromThreePoints arc
function testPLCExtraction() {
  console.log('\n=== TEST 4: Full PLC extraction with fromThreePoints arc ===');

  const start = { x: 300, y: 100 };
  const through = { x: 150, y: 250 };  // LEFT of chord
  const end = { x: 300, y: 400 };

  const arc = ArcBuilder.fromThreePoints(start, through, end);

  if (!arc) {
    console.log('  FAIL: Arc creation returned null');
    return false;
  }

  // Add plcData like main.js does
  arc.plcData = {
    type: arc.isClockwise ? 2 : 3,
    x1: arc.x1, y1: arc.y1,
    x2: arc.x2, y2: arc.y2,
    cx: arc.cx, cy: arc.cy
  };

  console.log(`  plcData.type: ${arc.plcData.type} (${arc.plcData.type === 2 ? 'CW' : 'CCW'})`);

  const generator = new PLCOutputGenerator();
  const commands = generator.generate([arc]);

  console.log('\n  Generated commands:');
  for (const cmd of commands) {
    console.log(`    ${cmd.command}`);
  }

  // Check the arc command
  const arcCmd = commands.find(c => c.type === 'arc');
  if (!arcCmd) {
    console.log('  FAIL: No arc command generated');
    return false;
  }

  // Parse I, J values
  const match = arcCmd.command.match(/I\s+([\d.-]+),\s*J\s+([\d.-]+)/);
  if (!match) {
    console.log('  FAIL: Could not parse I, J from command');
    return false;
  }

  const auxX = parseFloat(match[1]);
  const auxY = parseFloat(match[2]);
  console.log(`\n  Extracted aux point from command: (${auxX}, ${auxY})`);

  let allPass = true;

  // Aux point should be on LEFT side (X < 300)
  allPass = assertLessThan(auxX, 300, 'PLC aux X < 300 (on LEFT side)') && allPass;

  // Aux point should match arc.midpoint
  const midpoint = arc.midpoint;
  allPass = assertEqual(auxX, midpoint.x, 'PLC aux X matches arc.midpoint.x') && allPass;
  allPass = assertEqual(auxY, midpoint.y, 'PLC aux Y matches arc.midpoint.y') && allPass;

  return allPass;
}

// Test 5: Major arc (through point on far side)
function testMajorArc() {
  console.log('\n=== TEST 5: Major arc (> 180 degrees) ===');

  // Create a major arc - the through point is on the far side from center
  const start = { x: 200, y: 200 };
  const through = { x: 400, y: 300 };  // Far from center (center will be on left)
  const end = { x: 200, y: 400 };

  console.log(`  Start: (${start.x}, ${start.y})`);
  console.log(`  Through: (${through.x}, ${through.y})`);
  console.log(`  End: (${end.x}, ${end.y})`);

  const arc = ArcBuilder.fromThreePoints(start, through, end);

  if (!arc) {
    console.log('  FAIL: Arc creation returned null');
    return false;
  }

  console.log(`\n  Arc properties:`);
  console.log(`    Center: (${arc.cx.toFixed(3)}, ${arc.cy.toFixed(3)})`);
  console.log(`    Radius: ${arc.radius.toFixed(3)}`);
  console.log(`    isClockwise: ${arc.isClockwise}`);
  console.log(`    sweep: ${arc.sweep.toFixed(3)} (${(arc.sweep * 180 / Math.PI).toFixed(1)}°)`);

  const midpoint = arc.midpoint;
  console.log(`\n  Midpoint (aux point): (${midpoint.x.toFixed(3)}, ${midpoint.y.toFixed(3)})`);

  let allPass = true;

  // For this major arc, the aux point should be on the RIGHT side (X > start.x)
  allPass = assertGreaterThan(midpoint.x, start.x, 'Aux point on correct side for major arc') && allPass;

  // The sweep should be > 180 degrees (major arc)
  const sweepDegrees = Math.abs(arc.sweep * 180 / Math.PI);
  console.log(`  Sweep angle: ${sweepDegrees.toFixed(1)}°`);
  allPass = assertGreaterThan(sweepDegrees, 180, 'Sweep > 180° (major arc)') && allPass;

  return allPass;
}

// Run all tests
console.log('========================================');
console.log('ArcBuilder.fromThreePoints TEST SUITE');
console.log('========================================');

let passed = 0;
let failed = 0;

if (testArcCurvingLeft()) passed++; else failed++;
if (testArcCurvingRight()) passed++; else failed++;
if (testUserArc()) passed++; else failed++;
if (testPLCExtraction()) passed++; else failed++;
if (testMajorArc()) passed++; else failed++;

console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
}
