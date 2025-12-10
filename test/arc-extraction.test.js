/**
 * Test the full extraction flow for arcs
 */

import { Arc } from '../src/geometry/primitives.js';
import { PLCOutputGenerator } from '../src/plc/extraction.js';

function testExtractionFlow() {
  console.log('=== EXTRACTION FLOW TEST ===\n');

  // Create a test arc
  const startX = 300, startY = 100;
  const endX = 300, endY = 400;
  const centerX = 450, centerY = 250;

  const arc = new Arc(startX, startY, endX, endY, centerX, centerY, null, 'test_arc');

  console.log('Arc created:');
  console.log(`  Start: (${arc.x1}, ${arc.y1})`);
  console.log(`  End: (${arc.x2}, ${arc.y2})`);
  console.log(`  Center: (${arc.cx}, ${arc.cy})`);
  console.log(`  Radius: ${arc.radius}`);
  console.log(`  startAngle: ${arc.startAngle}`);
  console.log(`  sweep: ${arc.sweep}`);
  console.log(`  midpoint: (${arc.midpoint.x.toFixed(3)}, ${arc.midpoint.y.toFixed(3)})`);

  // Add plcData like main.js does
  arc.plcData = {
    type: arc.isClockwise ? 2 : 3,
    x1: arc.x1, y1: arc.y1, x2: arc.x2, y2: arc.y2,
    cx: arc.cx, cy: arc.cy
  };

  console.log('\nplcData:');
  console.log(arc.plcData);

  // Now run through PLCOutputGenerator
  const generator = new PLCOutputGenerator();
  const commands = generator.generate([arc]);

  console.log('\nGenerated commands:');
  for (const cmd of commands) {
    console.log(`  ${cmd.command}`);
  }

  // Check the arc command specifically
  const arcCmd = commands.find(c => c.type === 'arc');
  if (arcCmd) {
    console.log('\nArc command analysis:');
    console.log(`  Full command: ${arcCmd.command}`);

    // Parse the I, J values
    const match = arcCmd.command.match(/I\s+([\d.-]+),\s*J\s+([\d.-]+)/);
    if (match) {
      const auxX = parseFloat(match[1]);
      const auxY = parseFloat(match[2]);
      console.log(`  Extracted aux point: (${auxX}, ${auxY})`);
      console.log(`  Expected aux point: (${arc.midpoint.x.toFixed(3)}, ${arc.midpoint.y.toFixed(3)})`);
      console.log(`  Match: ${Math.abs(auxX - arc.midpoint.x) < 0.01 && Math.abs(auxY - arc.midpoint.y) < 0.01 ? 'YES' : 'NO - MISMATCH!'}`);
    }
  }

  console.log('\n=== TEST COMPLETE ===\n');
}

function testPrimitiveToCommand() {
  console.log('=== PRIMITIVE TO COMMAND TEST ===\n');

  const startX = 300, startY = 100;
  const endX = 300, endY = 400;
  const centerX = 450, centerY = 250;

  const arc = new Arc(startX, startY, endX, endY, centerX, centerY, null, 'test_arc');

  // Check what values primitiveToCommand would use
  console.log('Values that primitiveToCommand will use:');
  console.log(`  primitive.cx: ${arc.cx}`);
  console.log(`  primitive.cy: ${arc.cy}`);
  console.log(`  primitive.radius: ${arc.radius}`);
  console.log(`  primitive.startAngle: ${arc.startAngle}`);
  console.log(`  primitive.sweep: ${arc.sweep}`);

  // Calculate aux point exactly as primitiveToCommand does
  const cx = arc.cx;
  const cy = arc.cy;
  const radius = arc.radius;
  const startAngle = arc.startAngle;
  const sweep = arc.sweep;

  const midAngle = startAngle + sweep / 2;
  const auxX = cx + radius * Math.cos(midAngle);
  const auxY = cy + radius * Math.sin(midAngle);

  console.log('\nCalculated aux point:');
  console.log(`  midAngle: ${midAngle} (${midAngle * 180 / Math.PI}°)`);
  console.log(`  auxX: ${auxX.toFixed(3)}`);
  console.log(`  auxY: ${auxY.toFixed(3)}`);

  // Compare with Arc.midpoint
  const midpoint = arc.midpoint;
  console.log('\nArc.midpoint:');
  console.log(`  x: ${midpoint.x.toFixed(3)}`);
  console.log(`  y: ${midpoint.y.toFixed(3)}`);

  console.log(`\nMatch: ${Math.abs(auxX - midpoint.x) < 0.001 && Math.abs(auxY - midpoint.y) < 0.001 ? 'YES' : 'NO'}`);

  console.log('\n=== TEST COMPLETE ===\n');
}

testExtractionFlow();
testPrimitiveToCommand();
