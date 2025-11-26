export function formatPlcMove(move) {
  if (!move) {
    return '';
  }
  switch (move.type) {
    case 'waypoint':
      return `J X ${move.x.toFixed(3)}, Y ${move.y.toFixed(3)}, Z ${move.z}`;
    case 'Z_down':
      return 'Z_DW';
    case 'line':
      return `L X ${move.x2.toFixed(3)}, Y ${move.y2.toFixed(3)}`;
    case 'arc':
      return `A X ${move.x2.toFixed(3)}, Y ${move.y2.toFixed(3)}, R ${move.r.toFixed(3)}, DIR ${move.dir}`;
    case 'Z_up':
      return 'Z_UP';
    default:
      return '';
  }
}

export function formatPlcMovements(movements) {
  return (movements || []).map(formatPlcMove).join('\n');
}

export function commandToPrimitive(move) {
  if (!move) {
    return null;
  }
  if (move.primitive) {
    return move.primitive;
  }
  if (move.type === 'line') {
    return { type: 'line', x1: move.x1, y1: move.y1, x2: move.x2, y2: move.y2 };
  }
  if (move.type === 'arc') {
    return {
      type: 'arc',
      x1: move.x1,
      y1: move.y1,
      x2: move.x2,
      y2: move.y2,
      cx: move.cx,
      cy: move.cy,
      r: move.r,
      dir: move.dir
    };
  }
  return null;
}
