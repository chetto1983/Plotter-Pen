/**
 * Converts G2/G3 arcs into G1 segments for robust previewing.
 * Handles relative I/J (Standard) and R params.
 */
export function linearizeGCode(gcode) {
  const lines = gcode.split('\n');
  const output = [];

  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;
  let absolute = true; // G90 default

  const SEGMENT_LENGTH = 0.5; // mm per segment

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('(') || trimmed.startsWith(';')) {
      output.push(line);
      continue;
    }

    const gCodeMatch = trimmed.match(/^G(\d+)(?=[^0-9]|$)/i);
    const gCode = gCodeMatch ? Number.parseInt(gCodeMatch[1], 10) : null;

    // Check Mode
    if (trimmed.includes('G90')) absolute = true;
    if (trimmed.includes('G91')) absolute = false;

    // Coordinates
    const xMatch = trimmed.match(/[X]([\d.-]+)/);
    const yMatch = trimmed.match(/[Y]([\d.-]+)/);
    const zMatch = trimmed.match(/[Z]([\d.-]+)/);

    let targetX = currentX;
    let targetY = currentY;
    let targetZ = currentZ;

    if (xMatch) targetX = parseFloat(xMatch[1]);
    if (yMatch) targetY = parseFloat(yMatch[1]);
    if (zMatch) targetZ = parseFloat(zMatch[1]);

    if (!absolute) {
      if (xMatch) targetX += currentX;
      if (yMatch) targetY += currentY;
      if (zMatch) targetZ += currentZ;
    }

    if (gCode === 0 || gCode === 1) {
      currentX = targetX;
      currentY = targetY;
      currentZ = targetZ;
      output.push(line);
      continue;
    }

    // ARCS
    if (gCode === 2 || gCode === 3) {
      const isCw = gCode === 2;
      const iMatch = trimmed.match(/[I]([\d.-]+)/);
      const jMatch = trimmed.match(/[J]([\d.-]+)/);
      const rMatch = trimmed.match(/[R]([\d.-]+)/); // Just in case R appears

      const startX = currentX;
      const startY = currentY;

      let centerX;
      let centerY;
      let radius;
      let startAngle;
      let endAngle;

      if (rMatch) {
        // R mode - fallback: pass through (if we can't linearize, pass it)
        // Or simplified linearize for R?
        // For now, let's just pass R lines through, assuming viewer handles R better than I/J
        output.push(line);
        currentX = targetX;
        currentY = targetY;
        continue;
      } else {
        // I/J Mode (Standard Relative)
        const i = iMatch ? parseFloat(iMatch[1]) : 0;
        const j = jMatch ? parseFloat(jMatch[1]) : 0;

        centerX = startX + i;
        centerY = startY + j;
        radius = Math.hypot(i, j);
        startAngle = Math.atan2(startY - centerY, startX - centerX);
        endAngle = Math.atan2(targetY - centerY, targetX - centerX);
      }

      // Handle angle wrap (avoid full-circle sweeps for boundary-crossing arcs)
      const twoPi = 2 * Math.PI;
      let sweep = endAngle - startAngle;
      if (isCw) {
        if (sweep > 0) sweep -= twoPi;
        while (sweep <= -twoPi) sweep += twoPi;
      } else {
        if (sweep < 0) sweep += twoPi;
        while (sweep >= twoPi) sweep -= twoPi;
      }

      // Linearize
      const arcLength = Math.abs(sweep * radius);
      const segments = Math.max(1, Math.ceil(arcLength / SEGMENT_LENGTH));

      for (let s = 1; s <= segments; s++) {
        const t = s / segments;
        const angle = startAngle + sweep * t;
        const px = centerX + radius * Math.cos(angle);
        const py = centerY + radius * Math.sin(angle);
        output.push(`G1 X${px.toFixed(4)} Y${py.toFixed(4)}`);
      }

      currentX = targetX;
      currentY = targetY;
    } else {
      output.push(line);
    }
  }

  return output.join('\n');
}
