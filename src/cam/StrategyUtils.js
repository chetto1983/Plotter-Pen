/**
 * CAM Strategy Utilities
 * Shared logic for CAM strategies.
 */

/**
 * Apply depth layers to 2D paths
 * @param {Array<Array<{x,y}>>} paths2D - Array of 2D paths (contours)
 * @param {number} startZ - Starting Z height
 * @param {number} targetZ - Final Z height
 * @param {number} stepDown - Depth per pass
 * @param {boolean} closed - Whether the paths should be closed
 * @returns {Array<Array<{x,y,z}>>} 3D paths
 */
export function applyDepthLayers(paths2D, startZ, targetZ, stepDown, closed = true) {
    const paths3D = [];
    let currentZ = startZ;

    // Safety check for infinite loops
    if (stepDown <= 0) stepDown = 1.0;
    if (startZ <= targetZ) {
        // Already at or below target? Just do one pass at target if strictly needed, 
        // or return empty if logic implies cutting downwards. 
        // Assuming Standard Z- is down.
        // If startZ=-5, targetZ=-10. 
    }

    // Standard Milling: Z decreases. 
    // While current > target
    while (currentZ > targetZ) {
        currentZ -= stepDown;
        if (currentZ < targetZ) currentZ = targetZ;

        for (const path of paths2D) {
            if (!path || path.length === 0) continue;

            const layerPath = path.map(p => ({ x: p.x, y: p.y, z: currentZ }));

            // Close loop if requested
            if (closed && path.length > 0) {
                // Check if start equals end already
                const first = layerPath[0];
                const last = layerPath[layerPath.length - 1];
                const dx = first.x - last.x;
                const dy = first.y - last.y;
                if (dx * dx + dy * dy > 0.0001) {
                    layerPath.push({ ...first });
                }
            }
            paths3D.push(layerPath);
        }
    }

    return paths3D;
}
