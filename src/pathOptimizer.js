// pathOptimizerExact.js
// Exact orientation-aware TSP (Held-Karp style) + fallback heuristic + 2-opt
// Usage:
//   import { PathOptimizerExact } from './pathOptimizerExact.js'
//   const result = PathOptimizerExact.optimize(primitives, { origin:{x:0,y:0}, maxExactN:12 })

export const PathOptimizer = (() => {

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ensure primitive has .start and .end coordinates
  // and optionally .reversible (default true). For arcs, flipping also toggles clockwise.
  function normalizePrimitives(prims) {
    return prims.map(p => {
      const copy = Object.assign({}, p);
      copy.reversible = (typeof p.reversible === 'boolean') ? p.reversible : true;
      // ensure start/end exist
      if (!p.start || !p.end) {
        throw new Error('Primitive must have start and end points');
      }
      return copy;
    });
  }

  // compute travel cost between prim i with orientation oi to prim j with orientation oj
  function travelCost(p_i, oi, p_j, oj) {
    const from = (oi === 0) ? p_i.end : p_i.start;   // if orientation 0 means normal start->end, so 'end' is where we finish
    const to   = (oj === 0) ? p_j.start : p_j.end;
    return dist(from, to);
  }

  // Held-Karp variant: DP over subsets of segments, track last segment index and its orientation (0=normal,1=reversed)
  function heldKarpOrientation(prims, origin = null) {
    // prims: array of primitives with .start/.end and .reversible
    const N = prims.length;
    const FULL = 1 << N;
    const INF = 1e18;

    // dp[mask][last][orient] -> cost
    // store as typed maps to save memory? Use plain arrays for clarity
    const dp = new Array(FULL);
    const parent = new Array(FULL);

    for (let m = 0; m < FULL; m++) {
      dp[m] = Array.from({length: N}, () => [INF, INF]);
      parent[m] = Array.from({length: N}, () => [null, null]);
    }

    // Initialization: start with each primitive i, either orientation (if allowed)
    for (let i = 0; i < N; i++) {
      const prim = prims[i];
      for (let oi = 0; oi < 2; oi++) {
        if (oi === 1 && !prim.reversible) continue;
        const mask = 1 << i;
        // cost of moving from origin to start of this oriented primitive (if origin provided)
        const startPoint = (oi === 0) ? prim.start : prim.end;
        const originCost = origin ? dist(origin, startPoint) : 0;
        dp[mask][i][oi] = originCost;
        parent[mask][i][oi] = {prevMask: 0, prevIdx: -1, prevOri: -1};
      }
    }

    // iterate masks
    for (let mask = 1; mask < FULL; mask++) {
      for (let last = 0; last < N; last++) {
        if (!(mask & (1 << last))) continue;
        for (let lo = 0; lo < 2; lo++) {
          if (dp[mask][last][lo] >= INF) continue;
          // try to extend with next segment j
          for (let j = 0; j < N; j++) {
            if (mask & (1 << j)) continue;
            const primJ = prims[j];
            for (let oj = 0; oj < 2; oj++) {
              if (oj === 1 && !primJ.reversible) continue;
              const cost = travelCost(prims[last], lo, primJ, oj);
              const nmask = mask | (1 << j);
              const candidate = dp[mask][last][lo] + cost;
              if (candidate < dp[nmask][j][oj]) {
                dp[nmask][j][oj] = candidate;
                parent[nmask][j][oj] = {prevMask: mask, prevIdx: last, prevOri: lo};
              }
            }
          }
        }
      }
    }

    // find best end
    let bestCost = INF;
    let bestEnd = null;
    const finalMask = FULL - 1;
    for (let last = 0; last < N; last++) {
      for (let lo = 0; lo < 2; lo++) {
        if (dp[finalMask][last][lo] < bestCost) {
          bestCost = dp[finalMask][last][lo];
          bestEnd = {idx: last, ori: lo};
        }
      }
    }

    if (bestEnd === null) return null;

    // reconstruct path (in reverse)
    const seq = [];
    let curMask = finalMask;
    let curIdx = bestEnd.idx;
    let curOri = bestEnd.ori;
    while (curMask) {
      seq.push({idx: curIdx, ori: curOri});
      const p = parent[curMask][curIdx][curOri];
      if (!p) break;
      curMask = p.prevMask;
      curIdx = p.prevIdx;
      curOri = p.prevOri;
    }
    seq.reverse();

    // produce oriented primitive list (copy and possibly reversed)
    const ordered = seq.map(s => {
      const prim = Object.assign({}, prims[s.idx]); // shallow copy
      if (s.ori === 1) {
        // swap start/end and if arc toggle clockwise property if present
        const tmp = prim.start;
        prim.start = prim.end;
        prim.end = tmp;
        if (prim.type === 'arc' && typeof prim.clockwise === 'boolean') {
          prim.clockwise = !prim.clockwise;
        }
      }
      // annotate original index
      prim._origIndex = s.idx;
      return prim;
    });

    return {cost: bestCost, order: ordered};
  }

  // 2-opt improvement (operates on ordered array of primitives)
  function twoOptImprove(order, iterations = 1000) {
    if (!order || order.length < 3) return order;
    function pathLen(arr) {
      let L = 0;
      for (let i = 0; i < arr.length - 1; i++) {
        L += dist(arr[i].end, arr[i+1].start);
      }
      return L;
    }
    let improved = true;
    let iter = 0;
    let current = order.slice();
    let bestLen = pathLen(current);
    while (improved && iter < iterations) {
      improved = false;
      iter++;
      for (let i = 0; i < current.length - 2; i++) {
        for (let j = i+1; j < current.length - 1; j++) {
          const candidate = current.slice(0, i+1)
                            .concat(current.slice(i+1, j+1).reverse())
                            .concat(current.slice(j+1));
          const len = pathLen(candidate);
          if (len + 1e-9 < bestLen) {
            current = candidate;
            bestLen = len;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }
    return current;
  }

  // Simple greedy + 2-opt fallback for larger N
  function greedyThenTwoOpt(prims) {
    const N = prims.length;
    const used = new Array(N).fill(false);
    const seq = [];

    // start from first primitive
    seq.push(JSON.parse(JSON.stringify(prims[0])));
    used[0] = true;

    while (seq.length < N) {
      const last = seq[seq.length-1];
      let bestIdx = -1, bestOri = 0, bestD = Infinity;
      for (let j = 0; j < N; j++) {
        if (used[j]) continue;
        for (let oj = 0; oj < 2; oj++) {
          if (oj === 1 && !prims[j].reversible) continue;
          const to = (oj === 0) ? prims[j].start : prims[j].end;
          const d = dist(last.end, to);
          if (d < bestD) { bestD = d; bestIdx = j; bestOri = oj; }
        }
      }
      // add best (apply orientation)
      used[bestIdx] = true;
      const p = JSON.parse(JSON.stringify(prims[bestIdx]));
      if (bestOri === 1) {
        const tmp = p.start; p.start = p.end; p.end = tmp;
        if (p.type === 'arc' && typeof p.clockwise === 'boolean') p.clockwise = !p.clockwise;
      }
      seq.push(p);
    }

    // refine with 2-opt
    return twoOptImprove(seq);
  }

  // Main optimize function
  function optimize(primitives, options = {}) {
    const opts = Object.assign({
      origin: null,      // optional start point {x,y}, used for initial DP cost
      maxExactN: 12,     // if primitives.length <= maxExactN -> run exact DP
      twoOptIterations: 2000
    }, options);

    const prims = normalizePrimitives(primitives);
    if (prims.length === 0) return {order:[], cost:0};

    let result = null;
    if (prims.length <= opts.maxExactN) {
      // exact
      const dpResult = heldKarpOrientation(prims, opts.origin);
      if (dpResult) {
        // apply local improvement
        const improvedOrder = twoOptImprove(dpResult.order, opts.twoOptIterations);
        result = {order: improvedOrder, cost: dpResult.cost};
      }
    }

    if (!result) {
      // fallback heuristic
      const heuristicOrder = greedyThenTwoOpt(prims);
      // compute cost
      let cost = 0;
      if (opts.origin) cost += dist(opts.origin, heuristicOrder[0].start);
      for (let i = 0; i < heuristicOrder.length - 1; i++) {
        cost += dist(heuristicOrder[i].end, heuristicOrder[i+1].start);
      }
      result = {order: heuristicOrder, cost};
    }

    return result;
  }

  return { optimize };

})();
