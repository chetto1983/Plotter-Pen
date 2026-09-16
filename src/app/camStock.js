/**
 * The piece of material under the tool, as the 3D view needs it.
 *
 * It covers the work area of the CAM with a margin round it, and stands from the bed up by the
 * thickness of the operation. The pen has no piece: it draws on the surface, it does not cut into
 * a thickness.
 */

// How much material is left round what is being cut, on every side
const MARGIN = 5;

/**
 * @param {object[]} primitives the work area, from camArea
 * @param {object} operation the CAM operation state (its name, its thickness)
 * @param {number} workZ the bed the piece rests on
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, z0: number, z1: number}|null}
 */
export function stockOf(primitives, operation, workZ) {
  if (!operation || operation.operation === 'pen' || !(operation.thickness > 0)) return null;
  if (!primitives || primitives.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const primitive of primitives) {
    const box = primitive.getBoundingBox?.();
    if (!box) continue;
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return {
    minX: minX - MARGIN, minY: minY - MARGIN,
    maxX: maxX + MARGIN, maxY: maxY + MARGIN,
    z0: workZ, z1: workZ + operation.thickness
  };
}

export default stockOf;
