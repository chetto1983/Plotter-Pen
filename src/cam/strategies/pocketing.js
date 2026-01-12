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

    if (!polygon || polygon.length < 3) return [];

    // 2. Generate generic XY offset paths (2D)
    // Initial offset to account for tool radius (keep tool inside)
    let currentPoly = ClipperWrapper.offsetPolygon(polygon, -toolRadius, 'Round');

    // Spiral/Offset inward
    const pocketPaths2D = [];

    // While we still have geometry
    while (currentPoly && currentPoly.length > 0) {
        // Clipper offset returns array of paths (islands etc), we flatten for simple pocketing
        // In complex pockets, we might need to handle islands properly.
        currentPoly.forEach(p => pocketPaths2D.push(p));

        // Offset further in by stepOver
        // Note: ClipperWrapper returns Array<Array<{x,y}>>
        // We need to offset ALL polygons in the current "layer"
        let nextPolys = [];
        for (const poly of currentPoly) {
            const offsets = ClipperWrapper.offsetPolygon(poly, -stepOver, 'Round');
            nextPolys.push(...offsets);
        }
        currentPoly = nextPolys;
    }

    // 3. Generate 3D paths for each Z-level
    return applyDepthLayers(pocketPaths2D, startZ, targetZ, stepDown, true);
}
