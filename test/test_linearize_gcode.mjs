import { linearizeGCode } from '../src/cam/linearizeGCode.js';

const gcode = [
  'G21',
  'G90',
  'G0 X0 Y0',
  'G2 X10 Y0 I5 J0',
  'G3 X0 Y10 I0 J5'
].join('\n');

const linearized = linearizeGCode(gcode);
const lines = linearized.split('\n').map(line => line.trim()).filter(Boolean);

const arcLines = lines.filter(line => /^G0?2\b/i.test(line) || /^G0?3\b/i.test(line));
if (arcLines.length > 0) {
  throw new Error(`Expected arcs to be linearized, found: ${arcLines.join(', ')}`);
}

const g1Lines = lines.filter(line => /^G1\b/i.test(line));
if (g1Lines.length === 0) {
  throw new Error('Expected linearized output to contain G1 segments.');
}

const boundaryGcode = [
  'G90',
  'G0 X0 Y-1',
  'G2 X0 Y1 I10000 J1'
].join('\n');

const boundaryLinearized = linearizeGCode(boundaryGcode);
const boundaryLines = boundaryLinearized.split('\n').map(line => line.trim()).filter(Boolean);
const boundarySegments = boundaryLines.filter(line => /^G1\b/i.test(line));

if (boundarySegments.length === 0) {
  throw new Error('Expected boundary arc to be linearized into G1 segments.');
}

let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;

for (const line of boundarySegments) {
  const xMatch = line.match(/[X]([\d.-]+)/);
  const yMatch = line.match(/[Y]([\d.-]+)/);
  if (!xMatch || !yMatch) {
    throw new Error(`Expected boundary segment to include X/Y: ${line}`);
  }
  const x = parseFloat(xMatch[1]);
  const y = parseFloat(yMatch[1]);
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
}

const spanX = maxX - minX;
const spanY = maxY - minY;
if (spanX > 1000 || spanY > 1000) {
  throw new Error(`Boundary arc produced huge bounds: X ${spanX.toFixed(2)} Y ${spanY.toFixed(2)}`);
}

console.log('Linearize G-code test passed.');
