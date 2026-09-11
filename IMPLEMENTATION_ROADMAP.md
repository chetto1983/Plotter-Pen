# Plotter-Pen Architecture & Roadmap

## Current Architecture (Go Backend)

```
cmd/server/
└── main.go                    # Entry point, Gin router

internal/
├── handler/                   # HTTP API endpoints
│   ├── dxf.go                # POST /api/parse-dxf, /api/smart-import, /api/parse-svg, /api/smart-import-svg, /api/parse-stl
│   ├── plc.go                # POST /api/plc/extract
│   ├── opcua.go              # OPC UA config, PLCs, certificates, connection, transfer
│   ├── opcua_ws.go           # WS /api/opcua/ws position stream
│   ├── persistence.go        # State/drawings/tools CRUD, PLC simulation settings
│   └── health.go             # Health checks
│
├── middleware/               # CORS, logging, security, rate limiting
│
├── persistence/
│   └── db.go                 # GORM models (AppState, Drawing, Tool, etc.)
│
├── system/                   # Runtime config, port and browser helpers
│
└── service/
    ├── import/
    │   ├── dxf.go            # DXF parsing + arc fitting
    │   ├── svg.go            # SVG parsing + arc fitting
    │   ├── spline.go         # B-spline De Boor algorithm
    │   ├── stl.go            # STL mesh parsing
    │   ├── transform.go      # Scale, center, normalize
    │   ├── cache.go          # Smart import cache
    │   └── primitive_json.go # JSON field names for the frontend
    │
    ├── plc/
    │   ├── types.go          # Primitive, Command structs
    │   ├── extractor.go      # J/L/A/WAIT command generation
    │   ├── fit.go            # Arc/line fitting algorithm
    │   └── optimizer.go      # Nearest-neighbor ordering
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

tools/s7sim/                  # S7-1500 OPC UA simulator (Python, not part of Compose)
```

---

## Component Status

### Core Engine

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| DXF Import | `internal/service/import/dxf.go` | Done | LINE, ARC, CIRCLE, (LW)POLYLINE, SPLINE; unit detection; arc fitting on closed splines; polyline bulges ignored |
| DXF Export | – | Removed | Removed in commit `15f072e` |
| SVG Import | `internal/service/import/svg.go` | Done | Parse SVG paths with arc fitting |
| B-Spline | `internal/service/import/spline.go` | Done | De Boor algorithm, 800-point sampling |
| Arc Fitting | `internal/service/import/dxf.go`, `internal/service/plc/fit.go` | Done | Greedy 3-point circle fitting; produces false arcs on sparse polylines, see [docs/ARC_FITTING_IMPLEMENTATION.md](docs/ARC_FITTING_IMPLEMENTATION.md) |
| Path Optimizer | `internal/service/plc/optimizer.go` | Done | Nearest-neighbor ordering |
| PLC Extractor | `internal/service/plc/extractor.go` | Done | J/L/A/WAIT with Z-axis |
| G-Code Gen | `pkg/gcode/generator.go` | Unused | G0/G1/G2/G3/G4 and M30; no current endpoint uses it (used by the CAM removed in `7ad8c8f`) |
| Clipper2 | `pkg/clipper/adapter.go` | Unused | Single-path offsets and concentric pockets on go-clipper2 v1.3.0; no current endpoint uses it (used by the CAM removed in `7ad8c8f`) |

### OPC UA (Complete)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| Client | `internal/service/opcua/client.go` | Done | Auto-discovery, secure endpoints |
| Config | `internal/service/opcua/config.go` | Done | Multi-PLC support, environment overrides |
| Transfer | `internal/service/opcua/transfer.go` | Done | Chunked async with ACK |
| WebSocket | `internal/handler/opcua_ws.go` | Done | Real-time position streaming |
| Simulator | `tools/s7sim/s7sim.py` | Done | S7-1500 OPC UA simulator for transfer tests |

### Persistence

| Model | Status | Description |
|-------|--------|-------------|
| AppState | Done | Singleton autosave |
| Drawing | Done | Saved designs CRUD |
| Tool | Done | Tool library |
| PLCSimulationSettings | Done | Speed, Z heights, wait |
| OPCUAConfig | Done | Multi-PLC with auth |
| MachineConfig | Model only | Table and default seed; no API since commit `7ad8c8f` |

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

`V` is in mm/s, the unit shown in the UI and used by `tools/s7sim`.

---

## Testing

```bash
# Run all tests
go test ./...

# Run PLC tests with verbose output
go test ./internal/service/plc/... -v

# Run with race detector
go test -race ./...

# OPC UA transfer against the S7 simulator (start tools/s7sim first)
go test -tags=s7sim -run S7Sim -v ./internal/service/opcua/
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

## Code Metrics

Tracked Go files; lines include comments and blank lines. Measured on 2026-09-11 with `git ls-files` and `wc -l`.

| Category | Files | Lines |
|----------|-------|-------|
| Handlers | 6 | 1,593 |
| Services | 19 | 6,287 |
| Packages (`pkg/`) | 4 | 421 |
| Middleware | 6 | 655 |
| Persistence | 1 | 306 |
| System | 3 | 388 |
| Entry point (`cmd/`) | 1 | 108 |
| Tests | 21 | 6,741 |
| **Total Go** | **61** | **16,499** |

---

*Last updated: 2026-09-11*
