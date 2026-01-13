/**
 * Pocketing Strategy
 * Clears the area inside a closed polygon.
 */
import { ClipperWrapper } from '../ClipperWrapper.js';
import { applyDepthLayers } from '../StrategyUtils.js';
import { LIMITS, TOLERANCE } from '../constants.js';

const polygonArea = (points) => {
    let area = 0;
    const count = points.length;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return area / 2;
};

const totalArea = (paths) => {
    if (!Array.isArray(paths)) return 0;
    return paths.reduce((sum, path) => {
        if (!Array.isArray(path) || path.length < 3) return sum;
        return sum + Math.abs(polygonArea(path));
    }, 0);
};

/**
 * Generate pocketing toolpaths
 * @param {Object} op - Operation parameters
 * @param {Object} tool - Tool definition
 * @param {Object} machine - Machine configuration
 * @returns {Promise<Array<Array<{x,y,z}>>>} Array of 3D paths
 */
export async function generatePocket(op, tool, _machine) {
    const toolRadius = tool.diameter / 2;
    const stepOver = (op.stepOver || tool.defaults.stepOver || 40) / 100 * tool.diameter;
    const stepDown = op.stepDown || tool.defaults.stepDown;

    // Target depth
    const startZ = op.startZ || 0;
    const targetZ = op.targetZ || 0; // Usually negative

    // 1. Get Geometry Points from op (assuming op.geometry is list of points)
    // In a real app, we'd need to extract points from the Primitive ID stored in op.
    // For now, let's assume op.points is passed or we resolve it here.
    const polygon = op.points;
    const holes = Array.isArray(op.holes) ? op.holes : [];

    if (!polygon || polygon.length < 3) return [];
    if (stepOver <= 0) return [];

    // 2. Generate generic XY offset paths (2D)
    // Initial offset to account for tool radius (keep tool inside)
    let currentPoly = await ClipperWrapper.offsetPolygon(polygon, -toolRadius, 'Round');
    let holePolys = [];

    if (holes.length > 0) {
        for (const hole of holes) {
            const offsets = await ClipperWrapper.offsetPolygon(hole, toolRadius, 'Round');
            holePolys.push(...offsets);
        }
    }

    // Spiral/Offset inward
    const pocketPaths2D = [];
    let iterations = 0;
    let lastArea = totalArea(currentPoly);
    const maxIterations = LIMITS.POCKETING_ITERATIONS;
    const areaEpsilon = TOLERANCE.AREA_EPSILON;

    // While we still have geometry
    while (currentPoly && currentPoly.length > 0) {
        let layerPolys = currentPoly;
        if (holePolys.length > 0) {
            layerPolys = await ClipperWrapper.difference(currentPoly, holePolys);
        }

        if (!layerPolys || layerPolys.length === 0) break;
        layerPolys.forEach(p => pocketPaths2D.push(p));

        // Offset further in by stepOver
        // Note: ClipperWrapper returns Array<Array<{x,y}>>
        // We need to offset ALL polygons in the current "layer"
        const nextPoly = await ClipperWrapper.offsetPaths(currentPoly, -stepOver, 'Round');
        const nextArea = totalArea(nextPoly);
        const minArea = Math.max(areaEpsilon, lastArea * areaEpsilon);

        if (!Number.isFinite(nextArea) || nextArea <= minArea) {
            break;
        }

        if (nextArea >= lastArea - minArea) {
            console.warn('Pocket strategy aborted: no offset progress.');
            break;
        }

        currentPoly = nextPoly;
        lastArea = nextArea;

        if (holePolys.length > 0) {
            holePolys = await ClipperWrapper.offsetPaths(holePolys, stepOver, 'Round');
        }

        iterations++;
        if (iterations >= maxIterations) {
            console.warn(`Pocket strategy aborted: reached ${maxIterations} iterations limit.`);
            break;
        }
    }

    // 3. Generate 3D paths for each Z-level
    return applyDepthLayers(pocketPaths2D, startZ, targetZ, stepDown, true);
}
