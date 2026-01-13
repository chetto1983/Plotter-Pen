/**
 * Pocketing Strategy
 * Clears the area inside a closed polygon.
 */
import { ClipperWrapper } from '../ClipperWrapper.js';
import { applyDepthLayers } from '../StrategyUtils.js';

/**
 * Generate pocketing toolpaths
 * @param {Object} op - Operation parameters
 * @param {Object} tool - Tool definition
 * @param {Object} machine - Machine configuration
 * @returns {Array<Array<{x,y,z}>>} Array of 3D paths
 */
export function generatePocket(op, tool, _machine) {

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
    let currentPoly = ClipperWrapper.offsetPolygon(polygon, -toolRadius, 'Round');
    let holePolys = [];

    if (holes.length > 0) {
        for (const hole of holes) {
            const offsets = ClipperWrapper.offsetPolygon(hole, toolRadius, 'Round');
            holePolys.push(...offsets);
        }
    }

    // Spiral/Offset inward
    const pocketPaths2D = [];
    let guard = 0;

    // While we still have geometry
    while (currentPoly && currentPoly.length > 0) {
        let layerPolys = currentPoly;
        if (holePolys.length > 0) {
            layerPolys = ClipperWrapper.difference(currentPoly, holePolys);
        }

        if (!layerPolys || layerPolys.length === 0) break;
        layerPolys.forEach(p => pocketPaths2D.push(p));

        // Offset further in by stepOver
        // Note: ClipperWrapper returns Array<Array<{x,y}>>
        // We need to offset ALL polygons in the current "layer"
        currentPoly = ClipperWrapper.offsetPaths(currentPoly, -stepOver, 'Round');
        if (holePolys.length > 0) {
            holePolys = ClipperWrapper.offsetPaths(holePolys, stepOver, 'Round');
        }

        guard += 1;
        if (guard > 5000) {
            console.warn('Pocket strategy aborted: excessive iterations.');
            break;
        }
    }

    // 3. Generate 3D paths for each Z-level
    return applyDepthLayers(pocketPaths2D, startZ, targetZ, stepDown, true);
}
