import { distanceToArc, distanceToLineSegment } from "./geometry.js";

export function createHoverManager(state, pointerHelper, renderer) {
  function findPlcCommandForPrimitive(primitive) {
    const last = state.extraction.last;
    if (!last || !Array.isArray(last.plc_movements)) {
      return null;
    }
    for (const move of last.plc_movements) {
      if (move.type === 'line' && primitive.type === 'line') {
        const sameStart = Math.abs(move.x1 - primitive.x1) < 0.001 && Math.abs(move.y1 - primitive.y1) < 0.001;
        const sameEnd = Math.abs(move.x2 - primitive.x2) < 0.001 && Math.abs(move.y2 - primitive.y2) < 0.001;
        if (sameStart && sameEnd) {
          return `L X ${move.x2.toFixed(3)}, Y ${move.y2.toFixed(3)}`;
        }
      } else if (move.type === 'arc' && primitive.type === 'arc') {
        const sameStart = Math.abs(move.x1 - primitive.x1) < 0.001 && Math.abs(move.y1 - primitive.y1) < 0.001;
        const sameEnd = Math.abs(move.x2 - primitive.x2) < 0.001 && Math.abs(move.y2 - primitive.y2) < 0.001;
        if (sameStart && sameEnd) {
          return `A X ${move.x2.toFixed(3)}, Y ${move.y2.toFixed(3)}, R ${move.r.toFixed(3)}, DIR ${move.dir}`;
        }
      }
    }
    return null;
  }

  function showTooltip(e, primitive, plcCommand) {
    const tooltip = state.elements.hoverTooltip;
    if (!tooltip) {
      return;
    }
    const tooltipContent = tooltip.querySelector('.tooltip-content');
    if (!tooltipContent) {
      return;
    }

    let infoHtml = `<div style="color: #ff6b6b; font-weight: bold;">${primitive.type.toUpperCase()}</div>`;
    if (plcCommand) {
      infoHtml += `<div style="margin-top: 5px; color: #52a8ff;">PLC: ${plcCommand}</div>`;
    }
    if (primitive.type === 'line') {
      infoHtml += `<div style="margin-top: 3px; font-size: 11px; color: #a9b0c0;">` +
        `Start: (${primitive.x1.toFixed(1)}, ${primitive.y1.toFixed(1)})<br>` +
        `End: (${primitive.x2.toFixed(1)}, ${primitive.y2.toFixed(1)})` +
        `</div>`;
    } else if (primitive.type === 'arc') {
      infoHtml += `<div style="margin-top: 3px; font-size: 11px; color: #a9b0c0;">` +
        `Start: (${primitive.x1.toFixed(1)}, ${primitive.y1.toFixed(1)})<br>` +
        `End: (${primitive.x2.toFixed(1)}, ${primitive.y2.toFixed(1)})<br>` +
        `Radius: ${primitive.r.toFixed(1)}mm` +
        `</div>`;
    }

    tooltipContent.innerHTML = infoHtml;
    tooltip.style.display = 'block';

    const tooltipWidth = 200;
    const tooltipHeight = 120;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = e.clientX + 15;
    let top = e.clientY + 15;
    if (left + tooltipWidth > viewportWidth) {
      left = e.clientX - tooltipWidth - 15;
    }
    if (top + tooltipHeight > viewportHeight) {
      top = e.clientY - tooltipHeight - 15;
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    renderer.hideHoverTooltip();
  }

  function attach() {
    const { canvas } = state.elements;
    if (!canvas) {
      return;
    }

    canvas.addEventListener('mousemove', (e) => {
      const last = state.extraction.last;
      const merged = last && Array.isArray(last.merged_primitives) ? last.merged_primitives : null;
      if (!merged) {
        hideTooltip();
        return;
      }

      const pos = pointerHelper.getPosition(e);
      const screenToleranceLine = 8;
      const screenToleranceArc = 12;
      const scale = state.view.scaleFactor * (state.view.zoom || 1);
      const mmToleranceLine = scale ? screenToleranceLine / scale : screenToleranceLine;
      const mmToleranceArc = scale ? screenToleranceArc / scale : screenToleranceArc;

      if (state.hover.timeoutId) {
        clearTimeout(state.hover.timeoutId);
        state.hover.timeoutId = null;
      }

      let hoveredPrimitive = null;
      let minDistance = Infinity;
      let plcCommand = '';

      for (const prim of merged) {
        let dist = Infinity;
        if (prim.type === 'line') {
          dist = distanceToLineSegment(prim.x1, prim.y1, prim.x2, prim.y2, pos.x, pos.y);
          if (dist < minDistance && dist < mmToleranceLine) {
            minDistance = dist;
            hoveredPrimitive = prim;
            plcCommand = findPlcCommandForPrimitive(prim) || '';
          }
        } else if (prim.type === 'arc') {
          dist = distanceToArc(prim, pos);
          if (dist < minDistance && dist < mmToleranceArc) {
            minDistance = dist;
            hoveredPrimitive = prim;
            plcCommand = findPlcCommandForPrimitive(prim) || '';
          }
        }
      }

      if (hoveredPrimitive) {
        state.hover.timeoutId = setTimeout(() => {
          showTooltip(e, hoveredPrimitive, plcCommand);
          if (!state.hover.isHovering || state.hover.lastPrimitive !== hoveredPrimitive) {
            state.hover.lastPrimitive = hoveredPrimitive;
            state.hover.isHovering = true;
            renderer.redrawAll();
            renderer.renderPrimitive(hoveredPrimitive);
          }
        }, 50);
      } else {
        hideTooltip();
        if (state.hover.isHovering) {
          state.hover.isHovering = false;
          state.hover.lastPrimitive = null;
          renderer.redrawAll();
        }
      }
    });

    canvas.addEventListener('mouseleave', () => {
      hideTooltip();
      if (state.hover.isHovering) {
        state.hover.isHovering = false;
        state.hover.lastPrimitive = null;
        renderer.redrawAll();
      }
    });
  }

  return { attach, hideTooltip };
}
