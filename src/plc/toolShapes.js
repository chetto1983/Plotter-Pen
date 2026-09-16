/**
 * The shape of the tool that is cutting, as a turned profile.
 *
 * These tools are turned: a profile in the (radius, height) plane, spun round the axis, is the
 * whole shape. three.js LatheGeometry does exactly that, so there is nothing to model by hand
 * beyond the half-section of each kind.
 *
 * The profiles start at the tip, on the axis, and go up: the tool is drawn with its tip at the
 * origin, which is where the PLC position is.
 */
import * as THREE from 'three';

// How long the cutting part is drawn, in diameters
const FLUTE_LENGTH = 3;
// A pen is not measured by its diameter: it is drawn as the barrel of a plotter pen
const PEN_DIAMETER = 2.5;
const PEN_TIP = 1.2;

/**
 * The half-section of a tool, from its tip upwards.
 * @param {string} kind pen, endmill, ballnose, vbit or drill
 * @param {number} diameter of the cutting part, in mm
 * @param {number} tipAngle the whole angle of a drill point, in degrees
 * @returns {THREE.Vector2[]} points of the profile, x the radius and y the height
 */
export function toolProfile(kind, diameter, tipAngle = 118) {
  const r = Math.max(diameter, 0.1) / 2;
  const flute = r * 2 * FLUTE_LENGTH;
  const point = (x, y) => new THREE.Vector2(x, y);

  switch (kind) {
    case 'pen': {
      // A cone that opens to the barrel, then the barrel itself
      const pr = PEN_DIAMETER / 2;
      return [point(0, 0), point(pr, PEN_TIP), point(pr, PEN_TIP + flute)];
    }
    case 'ballnose': {
      // A hemisphere of the tool radius, sampled, then the straight part above it
      const profile = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const a = (Math.PI / 2) * (i / steps);
        profile.push(point(r * Math.sin(a), r - r * Math.cos(a)));
      }
      profile.push(point(r, flute));
      return profile;
    }
    case 'vbit': {
      // A 90° point: the radius is reached after as much height as the radius itself
      return [point(0, 0), point(r, r), point(r, flute)];
    }
    case 'drill': {
      // The point of a twist drill: its whole angle is the tip angle, so the half angle rises
      // the radius over r / tan(half)
      const half = (Math.max(Math.min(tipAngle, 179), 1) / 2) * (Math.PI / 180);
      return [point(0, 0), point(r, r / Math.tan(half)), point(r, flute)];
    }
    default:
      // endmill, and anything the library may grow: flat bottom, straight flutes
      return [point(0, 0), point(r, 0), point(r, flute)];
  }
}

/**
 * The tool as a mesh, tip at the origin and pointing down -Z. Only the cutting part is drawn: a
 * shank above it hides the cut without saying anything about it.
 * @returns {THREE.Group}
 */
export function toolMesh(kind, diameter, tipAngle = 118) {
  const group = new THREE.Group();

  // Turned from the profile. The lathe spins round +Y, so the tool is laid down once at the end,
  // tip at the origin and body towards +Z.
  const cutter = new THREE.Mesh(
    new THREE.LatheGeometry(toolProfile(kind, diameter, tipAngle), 32),
    new THREE.MeshPhongMaterial({ color: kind === 'pen' ? 0x2266ff : 0xc8ccd4, shininess: 90 })
  );
  group.add(cutter);

  // Built along +Y, stood up along +Z: the tip stays at the origin and the tool rises above it
  group.rotation.x = Math.PI / 2;
  return group;
}

export default toolMesh;
