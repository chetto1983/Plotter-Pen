# Arc Fitting — Current Implementation

**Last verified:** 2026-09-11 (after commit `97371a5`)

This document describes how the code turns point sequences into arcs and lines today. The Taubin + RANSAC fitter described in earlier versions of this file (and in [ARC_FIX_VALIDATION.md](ARC_FIX_VALIDATION.md)) lived in `internal/service/import/arc_fitting.go` and was removed in commit `71be963`.

---

## Algorithm

Two copies of the greedy algorithm exist; they differ only in the arc acceptance test:

| Function | File | Callers |
|----------|------|---------|
| `fitArcsToPoints` | `internal/service/import/dxf.go` | DXF and SVG import |
| `FitArcsAndLines` | `internal/service/plc/fit.go` | None in production code since the CAM removal (`7ad8c8f`) |

For each start index `i`:

1. For every `j` from `i+2` up to `i+349`, build the circle through points `i`, `(i+j)/2` and `j`. Accept it when every vertex from `i` to `j` lies within the tolerance of the circle and the radius is between 0.005 and 1,000,000 mm; `FitArcsAndLines` also requires the midpoint of every chord between consecutive points to lie within the tolerance. Keep the longest accepted arc.
2. If no arc is accepted, extend a line from `i` while every intermediate vertex stays within the tolerance of the chord (up to 119 points ahead).

Closed DXF curves are first tested as full circles (`detectCircle`): at least 10 points, circle through three samples, every point within 1% of the radius.

---

## Where It Runs

| Input | Behaviour |
|-------|-----------|
| DXF `SPLINE`, closed | Sampled at 800 points (De Boor). Becomes a circle if `detectCircle` succeeds; otherwise `fitArcsToPoints` with `ArcFitTolerance` (0.05 mm), kept only when it yields fewer segments than half the samples (a closing line is added when the ends are more than 0.1 mm apart); otherwise a polygon simplified at 0.02 mm |
| DXF `SPLINE`, open | Polyline simplified at 0.02 mm, no fitting |
| DXF `LINE`, `ARC`, `CIRCLE` | Native primitives, no fitting |
| DXF `LWPOLYLINE`, `POLYLINE` | Polyline or polygon from the vertices, no fitting; bulge values are ignored |
| SVG curves | `fitArcsToPoints` when the `fitArcs` option is true (straight subsegments are split out at parse time) |
| `/api/plc/extract` | No fitting: polylines and polygons become `L` commands |

`ImportOptions.FitArcs` and `ImportOptions.ArcTolerance` are not read by the DXF path (`SmartImport`), even though `internal/handler/dxf.go` sets them for raw `text/plain` requests. The SVG path reads `FitArcs` but not `ArcTolerance`.

---

## Output

The import JSON (`internal/service/import/primitive_json.go`) writes arcs as `ax`, `ay` (start), `bx`, `by` (end), `cx`, `cy`, `radius`, `startAngle` and `sweep` (radians, negative = clockwise), plus `throughPoint` (the middle sample of the fitted span). Lines use `x1`, `y1`, `x2`, `y2`.

The PLC extractor emits `A X…, Y…, Z…, I…, J…, V…`, where `I`/`J` is a point on the arc, not a centre offset. It uses `throughPoint` when present, otherwise the point at `startAngle + sweep/2` (`arcAuxPoint` in `internal/service/plc/extractor.go`). The frontend converts its primitives before calling `/api/plc/extract` (`primitiveToRequest` in `src/app/PLCOutputManager.js`).

---

## Known Limitations

Verified on 2026-09-11.

1. **False arcs on sparse polylines in `fitArcsToPoints`.** Three points always define a circle and the import copy checks only the vertices, so any three non-collinear vertices are accepted as an arc, and so are four concyclic ones (every rectangle): the closed rectangle (3,3)–(97,3)–(97,47)–(3,47) at tolerance 0.01 becomes one arc of radius 51.894 (the circumcircle) and one line, up to 29.9 mm away from the rectangle. The import is not affected in practice because it only fits densely sampled curves. `FitArcsAndLines` checks the chord midpoints and returns the four sides as lines; on the Clipper2 tool paths of `L28YO-tree-of-life-wall-spiritual-art.dxf` (tools Ø2, Ø3 and Ø6, tolerance 0.01) its maximum deviation is 0.011 mm, where the vertex-only check reached 1.5 mm. Adding a turning-direction check left the deviation unchanged and only added segments, so it is not applied.
2. **`FitSegment` carries no direction.** Callers must take the direction from the source points (the through point). Deriving it from the cross product of the start and end radii is wrong for arcs larger than 180°: on the tree-of-life tool paths this happens to 1 arc in about 2000.
3. **Bulges are ignored** in `LWPOLYLINE` and `POLYLINE`, so their arc segments arrive as straight chords.
4. **Fixed import tolerance:** 0.05 mm, whatever the request options say.

---

## How to Check

```bash
go test ./internal/service/import/... ./internal/service/plc/...

# Local server on port 8000 (Docker Compose publishes host port 41880)
curl -X POST http://localhost:8000/api/smart-import \
  -H "Content-Type: text/plain" \
  --data-binary "@dxf/L28YO-tree-of-life-wall-spiritual-art.dxf"
```

Reference measurement (2026-09-11, Compose deployment on port 41880): the file above (45 closed `SPLINE` entities, `$INSUNITS` = 5, centimetres) imports as 2167 primitives (2161 arcs, 6 lines) in about 0.5 s, and the arcs chain into 45 closed contours with no gaps. The `dxf/` folder is ignored by git, so the file exists only locally.

---

## History

- 2026-01-18: Taubin + RANSAC fitter in `internal/service/import/arc_fitting.go`, validated in [ARC_FIX_VALIDATION.md](ARC_FIX_VALIDATION.md).
- Commit `71be963`: that file was removed; the greedy algorithm above is what remains.
