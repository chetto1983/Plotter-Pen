/**
 * Command Parser Utilities
 */

const VECTOR_PATTERN = /^(@)?(.+)(,|<)(.+)$/;

export function parseNumber(str) {
  try {
    const val = parseFloat(str);
    if (isNaN(val)) return 'Numero non valido: ' + str;
    return val;
  } catch (e) {
    return 'Errore nel parsing: ' + str;
  }
}

export function parseVector(referencePoint, command) {
  command = command.replace(/\s+/g, '');

  const match = command.match(VECTOR_PATTERN);
  if (match) {
    const isRelative = match[1] !== undefined;
    let x = parseNumber(match[2]);
    if (typeof x === 'string') return { error: x };

    const isPolar = match[3] === '<';
    let y = parseNumber(match[4]);
    if (typeof y === 'string') return { error: y };

    if (isPolar) {
      const angle = y * Math.PI / 180;
      const radius = x;
      x = radius * Math.cos(angle);
      y = radius * Math.sin(angle);
    }

    if (isRelative && referencePoint) {
      x += referencePoint.x;
      y += referencePoint.y;
    }

    return { x, y };
  }

  return { error: 'Formato non valido. Usa: x,y | @x,y | r<angolo | @r<angolo' };
}

/**
 * Parse command input and return coordinates or null
 * Used by UIController for coordinate input
 */
export function parseCommandInput(input, referencePoint) {
  const result = parseVector(referencePoint || { x: 0, y: 0 }, input);
  if (result.error) return null;
  return result;
}

export default parseCommandInput;
