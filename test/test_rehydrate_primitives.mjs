import { FileManager } from '../src/app/FileManager.js';

global.requestAnimationFrame = (cb) => cb();

const appStub = {
  ui: {
    updateStatus: () => {}
  }
};

const fileManager = new FileManager(appStub);

const payload = [
  { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0 },
  { type: 'arc', ax: 10, ay: 0, bx: 0, by: 10, cx: 5, cy: 5 },
  { type: 'circle', cx: 5, cy: 5, radius: 2 },
  { type: 'rectangle', x: 0, y: 0, width: 4, height: 2 },
  { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }], closed: true },
  { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], closed: false }
];

const primitives = await fileManager.createPrimitivesFromDataAsync(payload);
const types = primitives.map(p => p.type).sort();
const expected = ['arc', 'circle', 'line', 'polygon', 'polyline', 'rectangle'].sort();

if (types.length !== expected.length) {
  throw new Error(`Expected ${expected.length} primitives, got ${types.length}`);
}

for (const type of expected) {
  if (!types.includes(type)) {
    throw new Error(`Missing primitive type: ${type}`);
  }
}

console.log('DXF rehydrate primitives test passed.');
