const DEFAULT_OPTIONS = {
    arcSegments: 32,
    circleSegments: 64,
    tolerance: 0.01
};

const toPoint = (p) => ({ x: p.x, y: p.y });

const distSq = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
};

const pointsClose = (a, b, tol) => distSq(a, b) <= tol * tol;

const normalizeLoopPoints = (points, tol) => {
    if (!points || points.length === 0) return [];
    const cleaned = points.map(toPoint);
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (cleaned.length > 2 && pointsClose(first, last, tol)) {
        cleaned.pop();
    }
    return cleaned;
};

const rectToPoints = (rect) => ([
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
]);

const circleToPoints = (circle, segments) => {
    const points = [];
    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push({
            x: circle.center.x + Math.cos(angle) * circle.radius,
            y: circle.center.y + Math.sin(angle) * circle.radius
        });
    }
    return points;
};

const arcToPoints = (arc, segments) => {
    const points = [];
    const totalAngle = Math.abs(arc.sweep);
    const steps = Math.max(segments, Math.ceil(totalAngle / (Math.PI / 18)));

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = arc.startAngle + arc.sweep * t;
        points.push({
            x: arc.cx + arc.radius * Math.cos(angle),
            y: arc.cy + arc.radius * Math.sin(angle)
        });
    }
    return points;
};

const makeSegment = (points, sourceType, arcData) => {
    if (!points || points.length < 2) return null;
    const cleaned = points.map(toPoint);
    return {
        points: cleaned,
        start: cleaned[0],
        end: cleaned[cleaned.length - 1],
        sourceType,
        arcData: arcData || null
    };
};

const connectSegments = (segments, tolerance) => {
    const loops = [];
    const openPaths = [];
    const used = new Array(segments.length).fill(false);

    const findNext = (currentEnd) => {
        let bestIndex = -1;
        let bestReverse = false;
        let bestDist = Infinity;

        for (let i = 0; i < segments.length; i++) {
            if (used[i]) continue;
            const seg = segments[i];
            const distToStart = Math.sqrt(distSq(seg.start, currentEnd));
            const distToEnd = Math.sqrt(distSq(seg.end, currentEnd));

            if (distToStart <= tolerance && distToStart < bestDist) {
                bestIndex = i;
                bestReverse = false;
                bestDist = distToStart;
            }
            if (distToEnd <= tolerance && distToEnd < bestDist) {
                bestIndex = i;
                bestReverse = true;
                bestDist = distToEnd;
            }
        }

        return bestIndex >= 0 ? { index: bestIndex, reverse: bestReverse } : null;
    };

    for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;

        used[i] = true;
        const base = segments[i];
        let pathPoints = base.points.slice();
        const pathSegments = [base];
        let start = pathPoints[0];
        let end = pathPoints[pathPoints.length - 1];

        while (true) {
            if (pointsClose(end, start, tolerance)) {
                const loopPoints = normalizeLoopPoints(pathPoints, tolerance);
                if (loopPoints.length >= 3) {
                    loops.push({
                        points: loopPoints,
                        sourceType: 'composite',
                        sourceCount: pathSegments.length,
                        segments: pathSegments
                    });
                }
                pathPoints = null;
                break;
            }

            const next = findNext(end);
            if (!next) {
                break;
            }

            used[next.index] = true;
            const seg = segments[next.index];
            const segPoints = next.reverse ? seg.points.slice().reverse() : seg.points.slice();

            pathSegments.push(seg);
            pathPoints = pathPoints.concat(segPoints.slice(1));
            end = pathPoints[pathPoints.length - 1];
        }

        if (pathPoints) {
            openPaths.push({
                points: pathPoints,
                segments: pathSegments
            });
        }
    }

    return { loops, openPaths };
};

const polygonSignedArea = (points) => {
    let area = 0;
    const count = points.length;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
};

const polygonCentroid = (points) => {
    let cx = 0;
    let cy = 0;
    let area = 0;
    const count = points.length;

    for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const cross = points[i].x * points[j].y - points[j].x * points[i].y;
        area += cross;
        cx += (points[i].x + points[j].x) * cross;
        cy += (points[i].y + points[j].y) * cross;
    }

    area *= 0.5;
    if (Math.abs(area) < 1e-8) {
        const avg = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        return { x: avg.x / count, y: avg.y / count };
    }

    return { x: cx / (6 * area), y: cy / (6 * area) };
};

const pointInPolygon = (point, polygon) => {
    let inside = false;
    const count = polygon.length;
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const boundsOf = (points) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY };
};

const boundsContain = (outer, inner) => (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
);

export const buildSelectionPaths = (primitives, options = {}) => {
    const { arcSegments, circleSegments, tolerance } = { ...DEFAULT_OPTIONS, ...options };
    const loops = [];
    const segments = [];
    const unsupportedTypes = new Set();
    let unsupportedCount = 0;

    for (const prim of primitives) {
        if (!prim || !prim.type) continue;

        switch (prim.type) {
            case 'polygon': {
                const points = normalizeLoopPoints(prim.points.map(toPoint), tolerance);
                if (points.length >= 3) {
                    loops.push({ points, sourceType: 'polygon', sourceCount: 1 });
                } else {
                    unsupportedCount += 1;
                }
                break;
            }
            case 'rectangle': {
                const points = normalizeLoopPoints(rectToPoints(prim), tolerance);
                if (points.length >= 3) {
                    loops.push({ points, sourceType: 'rectangle', sourceCount: 1 });
                } else {
                    unsupportedCount += 1;
                }
                break;
            }
            case 'circle': {
                const points = normalizeLoopPoints(circleToPoints(prim, circleSegments), tolerance);
                if (points.length >= 3) {
                    loops.push({ points, sourceType: 'circle', sourceCount: 1 });
                } else {
                    unsupportedCount += 1;
                }
                break;
            }
            case 'polyline': {
                const points = prim.points ? prim.points.map(toPoint) : [];
                const segment = makeSegment(points, 'polyline');
                if (segment) {
                    segments.push(segment);
                } else {
                    unsupportedCount += 1;
                }
                break;
            }
            case 'line': {
                const segment = makeSegment([
                    { x: prim.x1, y: prim.y1 },
                    { x: prim.x2, y: prim.y2 }
                ], 'line');
                if (segment) {
                    segments.push(segment);
                } else {
                    unsupportedCount += 1;
                }
                break;
            }
            case 'arc': {
                const points = arcToPoints(prim, arcSegments);
                const arcData = {
                    x1: prim.x1,
                    y1: prim.y1,
                    x2: prim.x2,
                    y2: prim.y2,
                    cx: prim.cx,
                    cy: prim.cy,
                    radius: prim.radius,
                    clockwise: prim.isClockwise === true
                };
                const segment = makeSegment(points, 'arc', arcData);
                if (segment) {
                    segments.push(segment);
                } else {
                    unsupportedCount += 1;
                }
                break;
            }
            default:
                unsupportedTypes.add(prim.type);
                unsupportedCount += 1;
                break;
        }
    }

    const { loops: segmentLoops, openPaths } = connectSegments(segments, tolerance);

    return {
        loops: loops.concat(segmentLoops),
        openPaths,
        unsupportedTypes,
        unsupportedCount
    };
};

export const groupLoopsByContainment = (loops, options = {}) => {
    const { tolerance } = { ...DEFAULT_OPTIONS, ...options };
    const loopInfos = loops
        .map((loop, index) => {
            const points = normalizeLoopPoints(loop.points, tolerance);
            if (points.length < 3) return null;
            return {
                index,
                points,
                bounds: boundsOf(points),
                area: Math.abs(polygonSignedArea(points)),
                centroid: polygonCentroid(points),
                sourceType: loop.sourceType,
                sourceCount: loop.sourceCount,
                segments: loop.segments || []
            };
        })
        .filter(Boolean);

    for (const info of loopInfos) {
        let parent = null;
        for (const candidate of loopInfos) {
            if (candidate.index === info.index) continue;
            if (candidate.area <= info.area) continue;
            if (!boundsContain(candidate.bounds, info.bounds)) continue;
            if (!pointInPolygon(info.centroid, candidate.points)) continue;

            if (!parent || candidate.area < parent.area) {
                parent = candidate;
            }
        }
        info.parent = parent ? parent.index : null;
    }

    const depthMap = new Map();
    const getDepth = (info) => {
        if (depthMap.has(info.index)) return depthMap.get(info.index);
        if (info.parent === null) {
            depthMap.set(info.index, 0);
            return 0;
        }
        const parentInfo = loopInfos.find(loop => loop.index === info.parent);
        const depth = parentInfo ? getDepth(parentInfo) + 1 : 0;
        depthMap.set(info.index, depth);
        return depth;
    };

    for (const info of loopInfos) {
        info.depth = getDepth(info);
    }

    const groups = [];
    for (const info of loopInfos) {
        if (info.depth % 2 !== 0) continue;
        const holes = loopInfos
            .filter(candidate => candidate.parent === info.index && candidate.depth % 2 === 1)
            .map(candidate => ({
                points: candidate.points,
                sourceType: candidate.sourceType,
                sourceCount: candidate.sourceCount,
                segments: candidate.segments
            }));

        groups.push({
            outer: info.points,
            holes,
            sourceType: info.sourceType,
            sourceCount: info.sourceCount,
            segments: info.segments
        });
    }

    return groups;
};
