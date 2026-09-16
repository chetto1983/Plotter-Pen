# Plotter-Pen Architecture & Roadmap

## Current Architecture (Go Backend)

```
cmd/server/
└── main.go                    # Entry point, Gin router

internal/
├── handler/                   # HTTP API endpoints
│   ├── dxf.go                # POST /api/parse-dxf, /api/smart-import, /api/parse-svg, /api/smart-import-svg, /api/parse-stl
│   ├── plc.go                # POST /api/plc/extract
│   ├── cam.go                # POST /api/cam/profile, /api/cam/drill
│   ├── opcua.go              # OPC UA config, PLCs, certificates, connection, transfer
│   ├── opcua_ws.go           # WS /api/opcua/ws position stream
│   ├── persistence.go        # State/drawings/tools CRUD, PLC simulation settings
│   ├── cam_operation.go      # GET/POST /api/cam/operation
│   ├── cam_job.go            # GET/POST /api/cam/job
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
    ├── cam/
    │   ├── chain.go          # Contour chaining for milling, gaps closed on request
    │   ├── open.go           # Open contours: where they are and the closing gap that closes them
    │   ├── profile.go        # Profile cut: offset rings, depth passes, J/L/A program
    │   ├── drill.go          # Drilling: round holes in a diameter range, G83-like pecks as J/L/WAIT
    │   └── holes.go          # Round holes: circles and closed contours within 0.02 mm of a circle
    │
    └── opcua/
        ├── client.go         # OPC UA client
        ├── nodes.go          # node addresses: node IDs or names of the PLC variables
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
| DXF Import | `internal/service/import/dxf.go`, `reader.go`, `bulge.go` | Done | Read with `whutwxn/dxf-go`: LINE, ARC, CIRCLE, (LW)POLYLINE with bulges, SPLINE; other entities skipped and counted in `stats.skipped`; unit detection; arc fitting on closed splines |
| DXF Export | – | Removed | Removed in commit `15f072e` |
| SVG Import | `internal/service/import/svg.go` | Done | Parse SVG paths with arc fitting |
| B-Spline | `internal/service/import/spline.go` | Done | De Boor algorithm, 800-point sampling |
| Arc Fitting | `internal/service/import/dxf.go`, `internal/service/plc/fit.go` | Done | Greedy 3-point circle fitting; `fit.go` also checks chord midpoints, the import copy still produces false arcs on sparse polylines, see [docs/ARC_FITTING_IMPLEMENTATION.md](docs/ARC_FITTING_IMPLEMENTATION.md) |
| Path Optimizer | `internal/service/plc/optimizer.go` | Done | Nearest-neighbor ordering |
| PLC Extractor | `internal/service/plc/extractor.go` | Done | J/L/A/WAIT with Z-axis |
| G-Code Gen | `pkg/gcode/generator.go` | Unused | G0/G1/G2/G3 and M30; no current endpoint uses it (used by the CAM removed in `7ad8c8f`) |
| Clipper2 | `pkg/clipper/adapter.go` | Done | On go-clipper2 v1.3.0: single-path offsets, concentric pockets, `MergeContours` (even-odd merge), `OffsetContours` (merged set offset with 5 µm arcs) and `Inside` (which rings enclose which); the profile uses the last three |
| Contour Chaining | `internal/service/cam/chain.go` | Done | Joins primitives into closed contours (ends within 0.01 mm, arcs split at 5 µm, no joint where three or more ends meet), naming the primitives of each contour; with a closing gap up to 1 mm the chains left open are joined too, keeping every point, and each open chain gets the closing gap that closes it; used by the profile and the drilling |
| Profile Cut | `internal/service/cam/profile.go` | Done | `POST /api/cam/profile`: closed contours offset by the tool radius (outside or inside), each ring after the rings inside it and then the nearest one, conventional or climb, warnings for contours the tool cannot reach, open contours reported with the gap that closes them and cut once closed (only open contours: 422), passes from the top of the piece (work Z, the bed, + thickness) down by the step-down (at least 0.001 mm, at most 1000 passes) to the overcut below the bed or a depth below the top entered along `L` ramps at the ramp angle, rings fitted at 0.01 mm into `L`/`A` with the arc's middle input point as `I`/`J`. Launched from the operation selector of the PLC output panel; tried on `tools/s7sim` only |
| Drilling | `internal/service/cam/drill.go`, `holes.go` | Done | `POST /api/cam/drill`: the round holes with a diameter in the requested range (1 µm tolerance, one hole per centre within 0.01 mm), circles or closed contours of arcs, polygons or lines whose vertices and side middles lie within 0.02 mm of a circle, while closed contours of hole width that are not round come back as `warnings`; nearest hole first from X 0 Y 0 (`plc.OptimizeOrder`) then 2-opt on the route, rapid to safe Z over each hole and to the retract plane above the piece, then pecks through the piece or to a depth at the plunge speed with a rapid out to the retract plane and back to 0.254 mm above the last peck (G83 with G98 written as `J`/`L`), optional dwell and drill point compensation. Launched from the operation selector of the PLC output panel; tried on `tools/s7sim` only |

### OPC UA (Complete)

| Component | File | Status | Description |
|-----------|------|--------|-------------|
| Client | `internal/service/opcua/client.go` | Done | Auto-discovery, secure endpoints |
| Config | `internal/service/opcua/config.go` | Done | Multi-PLC support, environment overrides |
| Node names | `internal/service/opcua/nodes.go` | Done | Nodes addressed as `ServerInterfaces/Com/Point`, resolved on the server |
| Variable list | `internal/handler/opcua.go` | Done | `GET /variables` and `POST /test` feed the combo boxes of the settings window |
| Tool library | `src/app/ToolLibraryManager.js` | Done | Opened from the diameter of the profile or of the drilling, fills it from `/api/tools` |
| Work area | `src/app/camArea.js` | Done | The selection, or the visible layers; hidden geometry is never cut |
| Profile on the line | `internal/service/cam/profile.go` | Done | `side: "on"` runs the tool centre along the drawing, with no offset |
| Piece in the 3D view | `src/app/camStock.js` | Done | A transparent block over the work area, from the bed up by the thickness |
| Camera on the tool | `src/plc/PLCSimulator3D.js` | Done | A toolbar button keeps the view on the tool; a pan lets it go |
| The tool drawn | `src/plc/toolShapes.js` | Done | Turned profiles through three.js LatheGeometry, from the kind chosen in the library |
| Details out of reach | `internal/service/cam/profile.go` | Done | Measured to 0.01 mm, named in the panel and marked in the drawing |
| Open contours | `internal/service/cam/open.go`, `src/app/CAMOperationManager.js` | Done | Listed and marked, closed on request up to 1 mm |
| Transfer | `internal/service/opcua/transfer.go` | Done | Chunked async with ACK |
| WebSocket | `internal/handler/opcua_ws.go` | Done | Real-time position streaming |
| Simulator | `tools/s7sim/s7sim.py` | Done | S7-1500 OPC UA simulator for transfer tests |

### Persistence

| Model | Status | Description |
|-------|--------|-------------|
| AppState | Done | Singleton autosave |
| Drawing | Done | Saved designs CRUD |
| Tool | Done | Tool library |
| PLCSimulationSettings | Done | Speed, Z heights (work Z: paper for the pen, bed for the router and the drill), wait; profile step-down, plunge speed and ramp angle; drilling retract clearance |
| CAMOperation | Done | Singleton: the operation the PLC output showed before the job (pen, profile or drill, the piece and the parameters, `GET/POST /api/cam/operation`); the panel now reads it only to make the first step of an empty job |
| JobStep | Done | The steps of the one job, in order: layer and the parameters of an operation, shared with CAMOperation through `CAMParams` (`GET/POST /api/cam/job`) |
| OPCUAConfig | Done | Multi-PLC with auth |
| MachineConfig | Model only | Table and default seed; no API since commit `7ad8c8f` |

---

## Next milestone: the whole job

One program at a time is what the app makes today. The milestone is a job: an ordered list of
steps, each with its tool and the layer it works on, sent one at a time with the tool change in
between. The machine has no status node — `statusNode`, `alarmNode` and `progressNode` are empty —
so nothing there says when a cut is over: the operator confirms every step. The plan, with the
decisions behind it, is in `docs/HANDOFF.md` ("Next milestone: the whole job").

| # | Piece | Where |
| --- | --- | --- |
| 1 | Speeds in the tool — done 2026-09-16 | `internal/persistence/db.go`, `src/app/toolCatalog.js`, `src/app/ToolLibraryManager.js` |
| 2 | The job: model and API — done 2026-09-16 | `internal/persistence/db.go`, `internal/handler/cam_job.go` |
| 3 | The job in the panel — done 2026-09-16 | `src/app/JobManager.js`, `src/app/CAMOperationManager.js`, `src/app/LayerManager.js`, `src/ui/components/SidebarRight.js` |
| 4 | Sending in sequence — done 2026-09-16 | `src/app/JobRunner.js`, `src/app/PLCOutputManager.js` |
| 5 | Open contours, closed with help — done 2026-09-16 | `internal/service/cam/chain.go`, `internal/service/cam/open.go`, `src/app/CAMOperationManager.js` |
| 6 | Errors in Italian | `src/app/` where the messages are shown |

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

Go files outside `node_modules`; lines include comments and blank lines. Measured on 2026-09-11 with `git ls-files` and `wc -l`.

| Category | Files | Lines |
|----------|-------|-------|
| Handlers | 6 | 1,599 |
| Services | 20 | 6,409 |
| Packages (`pkg/`) | 4 | 390 |
| Middleware | 6 | 655 |
| Persistence | 1 | 306 |
| System | 3 | 376 |
| Entry point (`cmd/`) | 1 | 108 |
| Tests | 26 | 7,222 |
| **Total Go** | **67** | **17,065** |

---

*Last updated: 2026-09-11*
