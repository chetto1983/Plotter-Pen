// primitiveExtractor.js
export const PrimitiveExtractor = (() => {

  function dist(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  function lineError(points, p1, p2) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const dx = x2 - x1, dy = y2 - y1;
    const norm = Math.hypot(dx, dy);
    if (norm === 0) return Infinity;
    let err = 0;
    for (const p of points) {
      const num = Math.abs(dy*p.x - dx*p.y + x2*y1 - y2*x1);
      err += (num / norm) ** 2;
    }
    return Math.sqrt(err / points.length);
  }

  function circleFromThreePoints(p1, p2, p3) {
    const d = 2 * (p1.x*(p2.y-p3.y) + p2.x*(p3.y-p1.y) + p3.x*(p1.y-p2.y));
    if (Math.abs(d) < 1e-9) return null;
    const p1sq = p1.x**2 + p1.y**2;
    const p2sq = p2.x**2 + p2.y**2;
    const p3sq = p3.x**2 + p3.y**2;
    const cx = (p1sq*(p2.y-p3.y) + p2sq*(p3.y-p1.y) + p3sq*(p1.y-p2.y)) / d;
    const cy = (p1sq*(p3.x-p2.x) + p2sq*(p1.x-p3.x) + p3sq*(p2.x-p1.x)) / d;
    const r = Math.hypot(p1.x - cx, p1.y - cy);
    return {cx, cy, r};
  }

  function rmsErrorCircle(points, cx, cy, r) {
    let sum = 0;
    for (const p of points) {
      const d = Math.hypot(p.x - cx, p.y - cy);
      sum += (d - r) ** 2;
    }
    return Math.sqrt(sum / points.length);
  }

  function extractPrimitives(points, options = {}) {
    const {epsLine = 0.5, epsArc = 1.0} = options;
    const segments = [];
    let i = 0;
    while (i < points.length - 2) {
      const window = points.slice(i, i+5);
      if (window.length < 3) break;
      const p1 = window[0], p2 = window[2], p3 = window[window.length-1];
      const errLine = lineError(window, p1, p3);
      const circle = circleFromThreePoints(p1, p2, p3);
      let errArc = Infinity;
      if (circle) errArc = rmsErrorCircle(window, circle.cx, circle.cy, circle.r);

      if (errLine < epsLine && errLine < errArc) {
        segments.push({type: "line", start: p1, end: p3});
      } else if (circle && errArc < epsArc) {
        segments.push({
          type: "arc",
          start: p1,
          end: p3,
          center: {x: circle.cx, y: circle.cy},
          r: circle.r
        });
      } else {
        segments.push({type: "line", start: window[0], end: window[1]});
      }
      i += window.length-1;
    }
    return segments;
  }

  return {extractPrimitives};

})();
