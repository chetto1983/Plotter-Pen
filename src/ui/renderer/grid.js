import { COLORS } from './colors.js';

/**
 * Draw grid
 */
export function drawGrid(ctx, scale, workspace, grid) {
  const spacing = grid.spacing;
  const majorSpacing = spacing * grid.majorEvery;
  const lineWidth = 1 / scale;

  // Minor grid lines
  ctx.strokeStyle = COLORS.gridMinor;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  for (let x = 0; x <= workspace.width; x += spacing) {
    if (x % majorSpacing !== 0) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, workspace.height);
    }
  }
  for (let y = 0; y <= workspace.height; y += spacing) {
    if (y % majorSpacing !== 0) {
      ctx.moveTo(0, y);
      ctx.lineTo(workspace.width, y);
    }
  }
  ctx.stroke();

  // Major grid lines
  ctx.strokeStyle = COLORS.gridMajor;
  ctx.lineWidth = lineWidth * 1.5;
  ctx.beginPath();

  for (let x = 0; x <= workspace.width; x += majorSpacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, workspace.height);
  }
  for (let y = 0; y <= workspace.height; y += majorSpacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(workspace.width, y);
  }
  ctx.stroke();

  // WCS Indicator - Standard CAD colors (Red=X, Green=Y)
  const axisLength = 40 / scale;
  const boxSize = 6 / scale;
  const labelOffset = 8 / scale;

  // X-Axis (Red/Magenta)
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = lineWidth * 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(axisLength, 0);
  ctx.stroke();

  // Y-Axis (Green)
  ctx.strokeStyle = '#00ff00';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, axisLength);
  ctx.stroke();

  // Origin box (white/gray outline)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);

  // Axis labels - flip text to counter the Y-axis inversion
  ctx.save();
  ctx.font = `${10 / scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // X label (red) - flip Y to draw text right-side up
  ctx.save();
  ctx.translate(axisLength + labelOffset, 0);
  ctx.scale(1, -1);  // Counter the Y-flip
  ctx.fillStyle = '#ff0000';
  ctx.fillText('X', 0, 0);
  ctx.restore();

  // Y label (green) - flip Y to draw text right-side up
  ctx.save();
  ctx.translate(0, axisLength + labelOffset);
  ctx.scale(1, -1);  // Counter the Y-flip
  ctx.fillStyle = '#00ff00';
  ctx.fillText('Y', 0, 0);
  ctx.restore();

  ctx.restore();
}

export default drawGrid;
