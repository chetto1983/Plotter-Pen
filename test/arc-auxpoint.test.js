/**
 * Test file for Arc Aux Point calculation
 * This tests the calculation used for robot post-processor arc output
 */

import { Arc } from '../src/geometry/primitives.js';

// Test case from screenshot:
// Start (green): approximately (265, 123)
// End (red): approximately (201, 430)
// Arc curves LEFT
// Expected aux point: somewhere on the LEFT side of the arc, around X=155-170

function testArcAuxPoint() {
  console.log('=== ARC AUX POINT TEST ===\n');

  // Create an arc similar to the one in the screenshot
  // Arc from top to bottom, curving LEFT
  // We need to figure out the center point

  // Let's create a test arc with known values
  // Start: (300, 100), End: (300, 400), Center: (450, 250) - arc curves LEFT
  const startX = 300, startY = 100;
  const endX = 300, endY = 400;
  const centerX = 450, centerY = 250;

  console.log('Creating arc:');
  console.log(`  Start: (${startX}, ${startY})`);
  console.log(`  End: (${endX}, ${endY})`);
  console.log(`  Center: (${centerX}, ${centerY})`);

  const arc = new Arc(startX, startY, endX, endY, centerX, centerY, null, 'test_arc');

  console.log('\nArc properties:');
  console.log(`  cx, cy: (${arc.cx}, ${arc.cy})`);
  console.log(`  radius: ${arc.radius}`);
  console.log(`  startAngle: ${arc.startAngle} (${arc.startAngle * 180 / Math.PI}°)`);
  console.log(`  endAngle: ${arc.endAngle} (${arc.endAngle * 180 / Math.PI}°)`);
  console.log(`  sweep: ${arc.sweep} (${arc.sweep * 180 / Math.PI}°)`);
  console.log(`  isClockwise: ${arc.isClockwise}`);

  // Get the midpoint using the Arc class method
  const midpoint = arc.midpoint;
  console.log(`\nArc.midpoint: (${midpoint.x.toFixed(3)}, ${midpoint.y.toFixed(3)})`);

  // Calculate aux point the way we do in extraction.js
  const midAngle = arc.startAngle + arc.sweep / 2;
  const auxX = arc.cx + arc.radius * Math.cos(midAngle);
  const auxY = arc.cy + arc.radius * Math.sin(midAngle);
  console.log(`\nCalculated aux point:`);
  console.log(`  midAngle: ${midAngle} (${midAngle * 180 / Math.PI}°)`);
  console.log(`  auxX: ${auxX.toFixed(3)}`);
  console.log(`  auxY: ${auxY.toFixed(3)}`);

  // Verify the aux point is ON the arc (distance from center should equal radius)
  const distFromCenter = Math.sqrt((auxX - arc.cx) ** 2 + (auxY - arc.cy) ** 2);
  console.log(`\nVerification:`);
  console.log(`  Distance from center: ${distFromCenter.toFixed(3)}`);
  console.log(`  Radius: ${arc.radius.toFixed(3)}`);
  console.log(`  On arc: ${Math.abs(distFromCenter - arc.radius) < 0.001 ? 'YES' : 'NO'}`);

  // Check if aux point is between start and end (on the correct arc, not the other side)
  // The aux point should be on the LEFT side (X < startX and X < endX for this arc)
  console.log(`\n  Aux point X (${auxX.toFixed(1)}) < Start X (${startX}): ${auxX < startX ? 'YES - CORRECT' : 'NO - WRONG SIDE!'}`);

  // Get render data to see what canvas would use
  const renderData = arc.getRenderData();
  console.log(`\nRender data:`);
  console.log(`  startAngle: ${renderData.startAngle} (${renderData.startAngle * 180 / Math.PI}°)`);
  console.log(`  endAngle: ${renderData.endAngle} (${renderData.endAngle * 180 / Math.PI}°)`);
  console.log(`  anticlockwise: ${renderData.anticlockwise}`);

  console.log('\n=== TEST COMPLETE ===\n');
}

// Test with user's actual values from screenshot
function testWithUserValues() {
  console.log('=== TEST WITH USER VALUES ===\n');

  // From the screenshot:
  // J X 184.829, Y 93.214, Z 1  (start point)
  // A X 201.335, Y 429.757, I 14.622, J 270.238  (end point, aux point)
  // The aux point I=14.622 is WAY off - should be around X=350-400 (on the arc's LEFT bulge)

  const startX = 184.829, startY = 93.214;
  const endX = 201.335, endY = 429.757;

  // The arc curves LEFT. For this to happen, center must be to the RIGHT of the arc
  // Let's estimate center based on typical arc geometry
  // The arc appears to curve about 150-200 pixels to the left from the chord
  // Mid-chord is around (193, 261)
  // So center would be approximately at X = 193 + 200 = 393, Y = 261

  const centerX = 400, centerY = 261;

  console.log('User arc (estimated center):');
  console.log(`  Start: (${startX}, ${startY})`);
  console.log(`  End: (${endX}, ${endY})`);
  console.log(`  Center (estimated): (${centerX}, ${centerY})`);

  const arc = new Arc(startX, startY, endX, endY, centerX, centerY, null, 'user_arc');

  console.log('\nArc properties:');
  console.log(`  radius: ${arc.radius.toFixed(3)}`);
  console.log(`  startAngle: ${arc.startAngle.toFixed(3)} (${(arc.startAngle * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  endAngle: ${arc.endAngle.toFixed(3)} (${(arc.endAngle * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  sweep: ${arc.sweep.toFixed(3)} (${(arc.sweep * 180 / Math.PI).toFixed(1)}°)`);
  console.log(`  isClockwise: ${arc.isClockwise}`);

  const midpoint = arc.midpoint;
  console.log(`\nArc.midpoint: (${midpoint.x.toFixed(3)}, ${midpoint.y.toFixed(3)})`);

  // The aux point X should be LESS than startX (on the LEFT side)
  console.log(`\nExpected: aux X < ${startX} (on LEFT side of arc)`);
  console.log(`Got: aux X = ${midpoint.x.toFixed(3)}`);
  console.log(`Correct side: ${midpoint.x < startX ? 'YES' : 'NO - WRONG!'}`);

  console.log('\n=== TEST COMPLETE ===\n');
}

// Run tests
testArcAuxPoint();
testWithUserValues();
