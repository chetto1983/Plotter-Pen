import { distance, pointToSegmentDistance } from "./geometry.js";

export function createStrokeManager(state, renderer, snapManager) {
  function smoothStroke(points, iterations = 2) {
    if (!Array.isArray(points) || points.length <= 2) {
      return points ? points.slice() : [];
    }

    let current = points.map((p) => ({ x: p.x, y: p.y }));
    for (let iter = 0; iter < iterations; iter++) {
      const next = [current[0]];
      for (let i = 1; i < current.length - 1; i++) {
        const prev = current[i - 1];
        const curr = current[i];
        const nextPt = current[i + 1];
        const smoothedX = (prev.x + 4 * curr.x + nextPt.x) / 6;
        const smoothedY = (prev.y + 4 * curr.y + nextPt.y) / 6;
        next.push({ x: smoothedX, y: smoothedY });
      }
      next.push(current[current.length - 1]);
      current = next;
    }
    return current;
  }

  function mergeNearPoints(points, threshold = 0.12) {
    if (!Array.isArray(points) || points.length === 0) {
      return [];
    }
    const merged = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = points[i];
      if (distance(prev, curr) >= threshold) {
        merged.push(curr);
      }
    }
    return merged;
  }

  function douglasPeucker(points, epsilon = 0.25) {
    if (!Array.isArray(points) || points.length <= 2) {
      return points ? points.slice() : [];
    }

    const stack = [[0, points.length - 1]];
    const keep = new Array(points.length).fill(false);
    keep[0] = keep[keep.length - 1] = true;

    while (stack.length) {
      const [startIdx, endIdx] = stack.pop();
      let maxDistance = 0;
      let index = -1;
      for (let i = startIdx + 1; i < endIdx; i++) {
        const d = pointToSegmentDistance(points[startIdx], points[endIdx], points[i]);
        if (d > maxDistance) {
          index = i;
          maxDistance = d;
        }
      }
      if (maxDistance > epsilon) {
        keep[index] = true;
        stack.push([startIdx, index], [index, endIdx]);
      }
    }

    const result = [];
    for (let i = 0; i < points.length; i++) {
      if (keep[i]) {
        result.push(points[i]);
      }
    }
    return result;
  }

  function simplifyFreehandStroke(points, options = {}) {
    if (!Array.isArray(points) || points.length <= 2) {
      return points ? points.slice() : [];
    }
    const iterations = options.iterations != null ? options.iterations : 2;
    const epsilon = options.epsilon != null ? options.epsilon : 0.25;
    const mergeThreshold = options.mergeThreshold != null ? options.mergeThreshold : 0.12;

    const smoothed = smoothStroke(points, iterations);
    const simplified = douglasPeucker(smoothed, epsilon);
    return mergeNearPoints(simplified, mergeThreshold);
  }

  function beginStroke(x, y) {
    state.drawing.isDrawing = true;
    state.drawing.currentStroke = [{ x, y }];
    renderer.drawDot(x, y);
  }

  function extendStroke(x, y) {
    if (!state.drawing.isDrawing) {
      return;
    }
    const currentStroke = state.drawing.currentStroke;
    const last = currentStroke[currentStroke.length - 1];
    if (!last || distance(last, { x, y }) >= 0.5) {
      currentStroke.push({ x, y });
      renderer.drawSegment(last.x, last.y, x, y);
    }
  }

  function endStroke() {
    const currentStroke = state.drawing.currentStroke;
    if (state.drawing.isDrawing && currentStroke.length > 1) {
      const iterations = currentStroke.length > 120 ? 3 : 2;
      const simplified = simplifyFreehandStroke(currentStroke, {
        iterations,
        epsilon: 0.22 + Math.min(0.4, currentStroke.length * 0.0015),
        mergeThreshold: 0.12
      });
      simplified.sourceTool = 'freehand';
      state.drawing.strokes.push(simplified);
      snapManager.markAnchorsDirty();
    } else if (state.drawing.isDrawing && currentStroke.length === 1) {
      const singlePoint = currentStroke.slice();
      singlePoint.sourceTool = 'freehand';
      state.drawing.strokes.push(singlePoint);
      snapManager.markAnchorsDirty();
    }
    state.drawing.isDrawing = false;
    state.drawing.currentStroke = [];
    renderer.redrawAll();
  }

  return {
    beginStroke,
    extendStroke,
    endStroke,
    simplifyFreehandStroke,
    smoothStroke,
    douglasPeucker,
    mergeNearPoints
  };
}
