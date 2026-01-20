# CAM Engine Roadmap v2.1

## Current Architecture (Go Backend)

```
cmd/server/
└── main.go                    # Entry point, Gin router

internal/
├── handler/                   # HTTP API endpoints
│   ├── cam.go                # POST /api/cam/process, /api/cam/parse
│   ├── dxf.go                # POST /api/parse-dxf, /api/smart-import, /api/export-dxf
│   ├── plc.go                # POST /api/plc/extract
│   ├── opcua.go              # OPC UA config & transfer
│   ├── persistence.go        # State/drawings/tools CRUD
│   └── health.go             # Health checks
│
├── middleware/               # CORS, logging, security
│
├── persistence/
│   └── db.go                 # GORM models (AppState, Drawing, Tool, etc.)
│
└── service/
    ├── import/
    │   ├── dxf.go            # ★ DXF parsing + arc fitting (924 lines)
    │   ├── spline.go         # B-spline De Boor algorithm
    │   ├── stl.go            # STL mesh parsing
    │   └── transform.go      # Scale, center, normalize
    │
    ├── plc/
    │   ├── types.go          # Primitive, Command structs
    │   ├── extractor.go      # ★ J/L/A/WAIT command generation
    │   ├── fit.go            # Arc/line fitting algorithm
    │   └── optimizer.go      # Nearest-neighbor TSP
    │
    ├── cam/
    │   ├── profile.go        # Profile toolpath generation
    │   └── pocket.go         # Pocket toolpath generation
    │
    └── opcua/
        ├── client.go         # OPC UA client
        ├── config.go         # Multi-PLC config
        └── transfer.go       # Chunked async transfer

pkg/
├── geom/types.go             # Point, Circle, Path
├── gcode/generator.go        # G-code string builder
├── plc/generator.go          # PLC command builder
└── clipper/adapter.go        # Clipper2 polygon offsetting
```

---

## Component Status

### Core Engine (✅ Complete)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| DXF Import | `internal/service/import/dxf.go` | ✅ | Parse entities, arc fitting, unit detection |
| DXF Export | `internal/service/import/dxf.go` | ✅ | Export primitives to DXF format |
| B-Spline | `internal/service/import/spline.go` | ✅ | De Boor algorithm, 800-point sampling |
| Arc Fitting | `internal/service/plc/fit.go` | ✅ | 3-point circle, tolerance-based fitting |
| Path Optimizer | `internal/service/plc/optimizer.go` | ✅ | Nearest-neighbor TSP |
| PLC Extractor | `internal/service/plc/extractor.go` | ✅ | J/L/A/WAIT with Z-axis |
| G-Code Gen | `pkg/gcode/generator.go` | ✅ | G0/G1/G2/G3/M codes |
| Clipper2 | `pkg/clipper/adapter.go` | ✅ | Polygon offsetting |

### CAM Operations (✅ Complete)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| Profile | `internal/service/cam/profile.go` | ✅ | Inside/outside/on-line offset |
| Pocket | `internal/service/cam/pocket.go` | ✅ | Concentric stepover |

### OPC UA (✅ Complete)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| Client | `internal/service/opcua/client.go` | ✅ | Auto-discovery, secure endpoints |
| Config | `internal/service/opcua/config.go` | ✅ | Multi-PLC support |
| Transfer | `internal/service/opcua/transfer.go` | ✅ | Chunked async with ACK |
| WebSocket | `internal/handler/opcua_ws.go` | ✅ | Real-time position streaming |

### Persistence (✅ Complete)

| Model | Status | Description |
|-------|--------|-------------|
| AppState | ✅ | Singleton autosave |
| Drawing | ✅ | Saved designs CRUD |
| Tool | ✅ | Tool library |
| PLCSimulationSettings | ✅ | Speed, Z heights, wait |
| OPCUAConfig | ✅ | Multi-PLC with auth |
| MachineConfig | ✅ | Multi-machine support |

---

## Critical Values

### Arc Fitting (`fit.go`, `dxf.go`)
```go
tolerance := 0.05           // mm - default fit tolerance
arcSearchRange := 350       // points ahead to search
lineSearchRange := 120      // points ahead for lines
minRadius := 0.005          // mm
maxRadius := 1000000.0      // mm
circleDetectionTol := 0.01  // 1% radius tolerance
```

### Spline Sampling (`dxf.go`)
```go
splineSamples := 800  // points per spline curve
```

### Z-Axis (`extractor.go`)
```go
safeZ := 5.0   // rapid move height (default)
workZ := 0.0   // cutting height (can be 0 or positive)
```

### PLC Command Format
```
J X {x}, Y {y}, Z {z}, V {speed}              # Jump (rapid)
L X {x}, Y {y}, Z {z}, V {speed}              # Line (cut)
A X {x}, Y {y}, Z {z}, I {aux_x}, J {aux_y}, V {speed}  # Arc (through-point)
WAIT {ms}                                      # Dwell
```

---

## Backlog

### Priority P1 - Drilling Cycles

**Status**: ❌ TODO
**File**: `internal/service/cam/drilling.go` (NEW)

```go
// G81 - Standard drilling
func G81(x, y, z, r, f float64)

// G82 - Spot drilling (with dwell)
func G82(x, y, z, r, p, f float64)

// G83 - Peck drilling (chip breaking)
func G83(x, y, z, r, q, f float64)
```

### Priority P2 - Lead-in/Lead-out

**Status**: ❌ TODO
**File**: `internal/service/cam/leadin.go` (NEW)

| Type | G-code | Parameters |
|------|--------|------------|
| Direct | G0 → G1 | None |
| Ramp | G1 with Z | Angle, distance |
| Helix | G2/G3 + Z | Radius, pitch |
| Arc | G2/G3 | Radius |

### Priority P3 - Adaptive Clearing

**Status**: ❌ TODO
**File**: `internal/service/cam/pocket.go`

| Strategy | Algorithm | Status |
|----------|-----------|--------|
| Constant Stepover | Offset by fixed % | ✅ Done |
| Adaptive Clearing | Constant chip load | ❌ TODO |
| Trochoidal | Circular + linear | ❌ TODO |
| Spiral | Continuous inside-out | ❌ TODO |

### Priority P4 - Post-Processor Profiles

**Status**: ❌ TODO
**File**: `internal/service/cam/postprocessor.go` (NEW)

```go
type MachineProfile struct {
    Name          string
    LineNumbers   bool
    ArcFormat     string  // "R" or "IJ"
    CommentStyle  string  // ";" or "()"
    Precision     int
}

var Profiles = map[string]MachineProfile{
    "generic": {Name: "Generic 3-Axis", ArcFormat: "R"},
    "fanuc":   {Name: "Fanuc", LineNumbers: true, ArcFormat: "IJ"},
    "grbl":    {Name: "GRBL/LinuxCNC", ArcFormat: "R"},
}
```

---

## Frontend UI Backlog

| Component | Status | Priority |
|-----------|--------|----------|
| Per-operation settings modal | ❌ | P1 |
| Tool selection dropdown | ❌ | P1 |
| Strategy picker | ❌ | P2 |
| Toolpath preview animation | ❌ | P3 |
| Operation reordering | ❌ | P3 |

---

## Testing

```bash
# Run all tests
go test ./...

# Run PLC tests with verbose output
go test ./internal/service/plc/... -v

# Run with race detector
go test -race ./...

# Benchmark
go test ./internal/service/plc/... -bench=.
```

---

## Build & Run

```bash
# Build
go build -o plotter-pen.exe ./cmd/server

# Run
./plotter-pen.exe

# Docker
docker build -t plotter-pen .
docker compose up --build
```

---

## Removed (Legacy)

The following JavaScript files were removed (backend now 100% Go):

- ~~`server.js`~~ - Node.js server
- ~~`src/import/DXFImporter.js`~~ - JS DXF parser
- ~~`src/geometry/biarc.js`~~ - JS arc fitting
- ~~`src/geometry/b-spline.js`~~ - JS B-spline
- ~~`src/lib/dxf-parser.js`~~ - JS DXF library
- ~~`internal/service/import/svg.go`~~ - SVG import (broken, removed)

---

## Code Metrics

| Category | Files | Lines |
|----------|-------|-------|
| Handlers | 10 | ~1,500 |
| Services | 15 | ~3,000 |
| Packages | 8 | ~600 |
| Middleware | 6 | ~400 |
| Persistence | 2 | ~600 |
| Tests | 15+ | ~2,000 |
| **Total Go** | **~56** | **~9,800** |

---

*Last updated: 2026-01-20*
