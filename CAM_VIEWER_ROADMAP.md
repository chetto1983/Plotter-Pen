# CAM Engine Roadmap

## Architecture

```
Go CAM Engine (server/cam-engine/)
├── main.go      - HTTP API /api/cam/*
├── gcode.go     - G0/G1/G2/G3/M codes
├── geometry.go  - Loops, segments, spatial grid
├── biarc.go     - Arc fitting (TODO)
├── profile.go   - Profile toolpaths
├── pocket.go    - Pocket strategies
└── clipper.go   - go.clipper boolean ops
```

## Current Issues

| Issue | Root Cause | Fix |
|-------|------------|-----|
| Profile = G1 only | No biarc in Go | Add `biarc.go` |
| 1000s lines vs 100 | Linearized points | Use fitted arcs |
| PLC ≠ G-code | Separate generators | Unify via Go |

## P0: Biarc Fitting

Port `src/geometry/biarc.js` → `server/cam-engine/biarc.go`

```go
func FitArcsAndLines(points []Point, tolerance float64) []PathSegment
func CircleFrom3Points(p1, p2, p3 Point) *Circle
```

Update `profile.go`:
- `writeClosedPath()` → use fitted segments
- `writeOpenPath()` → use fitted segments
- Output G2/G3 for arcs, G1 for lines

## Verification

```bash
cd server/cam-engine && go build
# Test profile output has G2/G3
grep -c "G2\|G3" output.nc  # Should be > 0
```

## Backlog

| Pri | Feature | File |
|-----|---------|------|
| P1 | Drilling cycles | drilling.go |
| P2 | Lead-in/out | leadin.go |
| P3 | Adaptive clear | pocket.go |
| P4 | Post-processor | postprocessor.go |

## Integration

| Endpoint | Purpose |
|----------|---------|
| `POST /api/cam/generate` | Primitives → G-code |
| `POST /api/cam/parse` | G-code → primitives |
| `POST /api/cam/postprocess` | G-code → PLC |

## Decisions

- **G-code is source of truth** for CAM output
- **All CAM in Go** - single codebase
- **Worker thread** for heavy ops
- **PLC post-process** from G-code, not parallel path
