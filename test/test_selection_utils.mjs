import { buildSelectionPaths, groupLoopsByContainment } from '../src/cam/selectionUtils.js';

const primitives = [
    { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
    { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 },
    { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }
];

const { loops, openPaths, unsupportedTypes, unsupportedCount } = buildSelectionPaths(primitives);

if (unsupportedTypes.size !== 0) {
    throw new Error(`Unexpected unsupported types: ${Array.from(unsupportedTypes).join(', ')}`);
}

if (unsupportedCount !== 0) {
    throw new Error(`Unexpected unsupported primitive count: ${unsupportedCount}`);
}

if (openPaths.length !== 1) {
    throw new Error(`Expected 1 open path, got ${openPaths.length}`);
}

const groups = groupLoopsByContainment(loops);
if (groups.length !== 1) {
    throw new Error(`Expected 1 grouped loop, got ${groups.length}`);
}

if (!Array.isArray(groups[0].holes) || groups[0].holes.length !== 1) {
    throw new Error(`Expected 1 hole in grouped loop, got ${groups[0].holes?.length ?? 0}`);
}

const hole = groups[0].holes[0];
if (!Array.isArray(hole.points) || hole.points.length === 0) {
    throw new Error('Expected hole to include point list.');
}

console.log('Selection utils grouping test passed.');
