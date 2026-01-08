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

  // Origin crosshair
  ctx.strokeStyle = COLORS.gridOrigin;
  ctx.lineWidth = lineWidth * 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.min(50, workspace.width), 0);
  ctx.moveTo(0, 0);
  ctx.lineTo(0, Math.min(50, workspace.height));
  ctx.stroke();
}

export default drawGrid;
