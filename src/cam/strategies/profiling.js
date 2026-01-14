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
 * @returns {Promise<Array<Array<{x,y,z}>>>} Array of 3D paths
 */
export async function generateProfile(op, tool, _machine) {
    const toolRadius = tool.diameter / 2;
    const stepDown = op.stepDown || tool.defaults.stepDown;
    const startZ = op.startZ || 0;
    const targetZ = op.targetZ || 0;
    const isClosed = op.closed !== false;

    // Calculate Offset
    let offset = 0;
    if (isClosed) {
        if (op.side === 'inside') offset = -toolRadius;
        else if (op.side === 'outside') offset = toolRadius;
    }

    // Handle circles with G2/G3 FIRST - before polygon check (circles may have empty points)
    if (isClosed && op.circleData) {
        const { cx, cy, radius } = op.circleData;
        const newRadius = radius + offset;
        if (newRadius > 0.001) {
            return applyDepthToCircle({ cx, cy, radius: newRadius }, startZ, targetZ, stepDown);
        }
    }

    // Handle arc-only paths without offset (single arcs from DXF)
    if (!isClosed && op.arc && Math.abs(offset) <= 0.001) {
        return applyDepthToArc(op.arc, startZ, targetZ, stepDown);
    }

    // NOW check polygon (after circle/arc handling)
    const polygon = op.points;
    if (!polygon || polygon.length < 2) return [];

    let profilePath2D = [];

    if (Math.abs(offset) > 0.001) {
        if (isClosed) {
            const offsets = await ClipperWrapper.offsetPolygon(polygon, offset, 'Round');
            offsets.forEach(p => profilePath2D.push(p));
        } else {
            const offsets = await ClipperWrapper.offsetPolyline(polygon, offset, 'Round', 'Round');
            offsets.forEach(p => profilePath2D.push(p));
        }
    } else {
        profilePath2D.push(polygon.map(p => ({ x: p.x, y: p.y })));
    }

    return applyDepthLayers(profilePath2D, startZ, targetZ, stepDown, isClosed);
}

function applyDepthToArc(arcData, startZ, targetZ, stepDown) {
    const layers = [];
    let currentZ = startZ;
    let step = stepDown;

    if (step <= 0) step = 1.0;

    while (currentZ > targetZ) {
        currentZ -= step;
        if (currentZ < targetZ) currentZ = targetZ;

        layers.push({
            arc: { ...arcData },
            z: currentZ
        });
    }

    return layers;
}

function applyDepthToCircle(circleData, startZ, targetZ, stepDown) {
    const layers = [];
    let currentZ = startZ;
    let step = stepDown;

    if (step <= 0) step = 1.0;

    while (currentZ > targetZ) {
        currentZ -= step;
        if (currentZ < targetZ) currentZ = targetZ;

        layers.push({
            circle: { ...circleData },
            z: currentZ
        });
    }

    return layers;
}
