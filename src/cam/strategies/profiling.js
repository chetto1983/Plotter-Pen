/**
 * Profiling Strategy
 * Cuts along the outline of a shape (Inside, Outside, or On-Line).
 */
import { ClipperWrapper } from '../ClipperWrapper.js';
import { applyDepthLayers } from '../StrategyUtils.js';

/**
 * Generate profiling toolpaths
 * @param {Object} op - Operation parameters
 * @param {Object} tool - Tool definition
 * @param {Object} machine - Machine configuration
 * @returns {Array<Array<{x,y,z}>>} Array of 3D paths
 */
export function generateProfile(op, tool, _machine) {

    const toolRadius = tool.diameter / 2;
    const stepDown = op.stepDown || tool.defaults.stepDown;

    const startZ = op.startZ || 0;
    const targetZ = op.targetZ || 0;

    const polygon = op.points;
    if (!polygon || polygon.length < 2) return [];

    let profilePath2D = [];

    // Calculate Offset
    // side: 'inside', 'outside', 'on'
    let offset = 0;
    if (op.side === 'inside') offset = -toolRadius;
    else if (op.side === 'outside') offset = toolRadius;
    else offset = 0;

    if (Math.abs(offset) > 0.001) {
        // Use Clipper
        // Need to know if closed or open
        const isClosed = op.closed !== false;

        // Note: Outside/Inside direction depends on polygon winding (CW vs CCW)
        // Clipper assumes specific winding. We might need to enforce it.
        // For now, trusting user/Clipper default behavior.

        if (isClosed) {
            const offsets = ClipperWrapper.offsetPolygon(polygon, offset, 'Round');
            // Assuming the largest resulting poly is the main one? 
            // Or just take all (could be islands split)
            offsets.forEach(p => profilePath2D.push(p));
        } else {
            const offsets = ClipperWrapper.offsetPolyline(polygon, offset, 'Round', 'Round');
            offsets.forEach(p => profilePath2D.push(p));
        }
    } else {
        // On-Line, just copy points
        profilePath2D.push(polygon.map(p => ({ x: p.x, y: p.y })));
    }

    // Generate Z-levels
    const isClosed = op.closed !== false;
    return applyDepthLayers(profilePath2D, startZ, targetZ, stepDown, isClosed);
}
