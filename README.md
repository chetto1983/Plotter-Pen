# Plotter-Pen

CAD editor for pen plotters with PLC integration via OPC UA. Features a Go backend with Gin/GORM and a browser-based JavaScript frontend with Three.js 3D visualization.

## Features

- **CAD Editor**: Draw lines, arcs, circles, polygons with snap and constraints
- **File Import**: DXF and SVG with B-spline sampling and arc fitting (closed DXF splines, SVG curves); STL parsing
- **PLC Output**: Generate optimized toolpaths with J/L/A commands
- **OPC UA**: Send commands directly to industrial PLCs (Siemens S7-1500 tested)
- **3D Simulation**: Real-time tool visualization with Three.js thick line rendering, zoom controls, rotation
- **Touch Support**: Tablet/HMI optimized with pinch-zoom, two-finger pan, single-finger orbit
- **Persistence**: SQLite database for drawings, tools, settings and OPC UA configurations

## Prerequisites

- Go 1.27.1+ (for production backend)
- Node.js for the webpack build and the Three.js Line2 modules (the Docker build stage uses Node 24)
- Docker (optional, for containerized deployment)

## Quick Start

### Go Backend (Recommended)

```bash
# Install frontend dependencies
npm install

# Build frontend bundle (Webpack)
npm run build

# Build
go build -o plotter-pen.exe ./cmd/server

# Run: opens http://localhost:8000 in the browser unless OPEN_BROWSER=false
./plotter-pen.exe
```

### Docker

```bash
# Build (includes frontend bundle)
docker build -t plotter-pen .

# Run with Docker Compose, then open http://localhost:41880
# (Compose maps host port 41880 to container port 8000)
docker compose up --build
```

## Configuration

### OPC UA Settings

OPC UA connections are stored in the SQLite database and managed from the web UI or through `/api/opcua/config` and `/api/opcua/plcs` (several PLCs, one active). Each configuration holds the endpoint, namespace, trigger/reset/data/end-of-file nodes, position nodes, chunk size and ACK timeout, security mode and policy, certificates and credentials. A default configuration is seeded into an empty database.

A node is written either as a node ID (`ns=4;i=12`) or as the path of browse names of the PLC variable (`ServerInterfaces/Com/Point`), which the app resolves on the server it connects to. The names are the default because the numbers behind them change with the PLC program, while the same names fit the machine and the simulator. The settings window offers the variables the connected PLC exposes (`GET /api/opcua/variables`) in a list on every node field, and `Prova connessione` tries the settings on screen before they are saved (`POST /api/opcua/test`), without touching the connection the app is using.

`opcua_config.json` in the repository root is not read by the server.

`POST /api/opcua/certificates/generate` writes `client.pem`, `client.der` and `client.key` under `certs/`. Its optional `outputDir` must be a relative path within that directory (for example, `certs/machine`); paths and symlinks that escape it are rejected. New certificate directories use mode `0700`, and generated files use `0600` on Unix. Status and download endpoints still refer to `certs/client.*`. Local `OPCUA_CERT_PATH` and `OPCUA_KEY_PATH` settings can select other directories for automatic certificate loading and generation.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port; if busy, the following ports are tried | 8000 |
| `SERVER_PORT` | Overrides `PORT` | - |
| `HOST` | Bind address | all interfaces |
| `DB_PATH` | SQLite database path | plotter_pen.db |
| `STATIC_DIR` | Folder containing `plotter_pen.html`, `dist/` and `src/` | . |
| `OPEN_BROWSER` | Open the browser at startup | true |
| `GIN_MODE` | Gin mode (debug/release) | release |
| `MAX_PORT_TRIES` | Ports tried when `PORT` is busy | 10 |
| `BROWSER_DELAY_MS` | Delay before opening the browser | 500 |
| `READ_TIMEOUT_SEC` / `WRITE_TIMEOUT_SEC` | HTTP timeouts in seconds | 30 / 30 |
| `OPCUA_ENDPOINT`, `OPCUA_DATA_NODE`, `OPCUA_DATA_TYPE`, `OPCUA_TRIGGER_NODE`, `OPCUA_RESET_NODE`, `OPCUA_STATUS_NODE`, `OPCUA_POSITION_X`, `OPCUA_POSITION_Y`, `OPCUA_POSITION_Z` | Override the active OPC UA configuration loaded from the database | - |

The API has no authentication: the `API_TOKEN` line in `docker-compose.yml` is a commented placeholder that no code reads.

## Architecture

```
plotter-pen/
├── cmd/server/           # Go entry point, Gin router
├── internal/
│   ├── handler/          # HTTP API handlers
│   ├── service/
│   │   ├── import/       # DXF, SVG, STL parsers, spline sampling, arc fitting
│   │   ├── plc/          # PLC command generation, path ordering
│   │   ├── cam/          # Milling: contour chaining, profile cuts as PLC programs
│   │   └── opcua/        # OPC UA client, configuration, chunked transfer
│   ├── persistence/      # SQLite + GORM
│   ├── middleware/       # CORS, security headers, logging, rate limiting
│   └── system/           # Runtime configuration, port and browser helpers
├── pkg/
│   ├── geom/             # Geometry primitives
│   ├── gcode/            # G-code builder (not used by current endpoints)
│   ├── plc/              # PLC command builder (used by the profile cut)
│   └── clipper/          # Clipper2 offsets and pockets (offsets used by the profile cut)
├── src/                  # JavaScript frontend
│   ├── geometry/         # Primitives and geometric operations
│   ├── plc/              # 3D visualization (Three.js Line2, touch)
│   ├── tools/            # Drawing tools
│   └── app/              # State management, UI
├── tools/s7sim/          # S7-1500 OPC UA simulator (Python, not part of Compose)
├── docs/                 # Implementation notes and historical reports
└── assets/               # Static resources
```

## API Endpoints

### Core

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET/POST | Autosave state |
| `/api/drawings` | GET/POST | Named drawings |
| `/api/drawings/:id` | GET/PUT/DELETE | Single drawing |
| `/api/tools` | GET/POST | Tool library |
| `/api/tools/:id` | PUT/DELETE | Single tool |

### Import

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/parse-dxf` | POST | Parse DXF content |
| `/api/smart-import` | POST | DXF import (raw `text/plain` body or JSON with options) |
| `/api/parse-svg` | POST | Parse SVG content |
| `/api/smart-import-svg` | POST | SVG import with arc fitting |
| `/api/parse-stl` | POST | Parse STL, optional 2D slices |

### PLC & OPC UA

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plc/extract` | POST | Generate PLC commands |
| `/api/plc/settings` | GET/POST | PLC simulation settings, including step-down, plunge speed, ramp angle and the drilling retract clearance; work Z is the paper for the pen and the bed for profiles and drilling |
| `/api/cam/profile` | POST | Profile cut of the closed contours as PLC commands, through a piece of the given thickness on the bed or to a depth below its top (same response as `/api/plc/extract`, plus `warnings` for contours the tool cannot reach) |
| `/api/cam/drill` | POST | Drilling of the round holes in a diameter range (circles, or closed contours of arcs, polygons or lines that are round) as PLC commands, through the piece or to a depth, with optional pecks and drill point compensation (response of `/api/plc/extract` plus `warnings` for hole-sized contours that are not round) |
| `/api/cam/operation` | GET/POST | The operation the PLC output panel shows (pen, profile or drill), the piece and the parameters |
| `/api/opcua/config` | GET/PUT | Active OPC UA configuration |
| `/api/opcua/plcs` | GET/POST | PLC configurations |
| `/api/opcua/plcs/:id` | GET/DELETE | Single PLC configuration |
| `/api/opcua/plcs/:id/activate` | POST | Make a configuration active |
| `/api/opcua/certificates/generate` | POST | Generate the client certificate |
| `/api/opcua/certificates/status` | GET | Certificate status |
| `/api/opcua/certificates/download/:type` | GET | Download a certificate |
| `/api/opcua/connect`, `/api/opcua/disconnect` | POST | Connection control |
| `/api/opcua/status` | GET | Connection status |
| `/api/opcua/send` | POST | Send commands to the PLC |
| `/api/opcua/position` | GET | Current position |
| `/api/opcua/machine-status` | GET | Machine status |
| `/api/opcua/ws` | WS | Real-time position stream |

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET/HEAD | Liveness probe |
| `/readyz` | GET/HEAD | Readiness probe |
| `/health` | GET/HEAD | Detailed status |

## PLC Command Format

```
J X {x}, Y {y}, Z {z}, V {speed}   # Jump (rapid move)
L X {x}, Y {y}, Z {z}, V {speed}   # Line (cut move)
A X {x}, Y {y}, Z {z}, I {aux_x}, J {aux_y}, V {speed}   # Arc (I,J = through point)
WAIT {ms}                          # Wait after pen down
```

In `A`, `I`/`J` is a point on the arc, not a centre offset as in G-code. `V` is in mm/s, the unit shown in the UI and used by the simulator in `tools/s7sim`.

## Testing

```bash
# All Go tests
go test ./...

# Specific package with verbose
go test ./internal/service/plc/... -v

# With race detector
go test -race ./...

# OPC UA transfer against the S7 simulator (start tools/s7sim first;
# S7SIM_ENDPOINT overrides the endpoint)
go test -tags=s7sim -run S7Sim -v ./internal/service/opcua/
```

## Development

### Quality Gates

```bash
make tools    # golangci-lint, deadcode, govulncheck, lefthook, ... (same list as D:\Aura)
make hooks    # lefthook install
make quality  # vet, lint, deadcode, tagged-tier compile, tests, govulncheck, eslint
```

Git hooks (`lefthook.yml`):

- **pre-commit**: gofmt on staged Go files (re-staged), `go vet` and golangci-lint on the touched packages (lint blocks only issues on lines changed since `HEAD`), 600-line cap on added Go/JS files.
- **pre-push**: `go build`, compile the `integration`/`s7sim` test files without running them, deadcode, eslint when `src/` changed.

`make lint` and `make file-size` sweep the whole tree. `make test-race` needs cgo and a 64-bit C compiler.

### Key Algorithms

- **Arc Fitting** (`internal/service/import/dxf.go`, `internal/service/plc/fit.go`): greedy fitting of arcs and lines through three-point circles; behaviour and limits in [docs/ARC_FITTING_IMPLEMENTATION.md](docs/ARC_FITTING_IMPLEMENTATION.md)
- **B-Spline** (`internal/service/import/spline.go`): De Boor algorithm for curve evaluation
- **Path Optimization** (`internal/service/plc/optimizer.go`): Nearest-neighbor ordering for minimal travel

### Critical Values

| Parameter | Value | Location |
|-----------|-------|----------|
| Spline samples | 800 | `internal/service/import/dxf.go` |
| Import arc fit tolerance | 0.05 mm | `ArcFitTolerance`, `internal/service/import/dxf.go` |
| Import point simplification | 0.02 mm | `PointSimplifyTolerance`, `internal/service/import/dxf.go` |
| Default fit tolerance | 0.05 mm | `internal/service/plc/fit.go` |
| Arc search window | 350 points | `internal/service/import/dxf.go`, `internal/service/plc/fit.go` |
| Line search window | 120 points | `internal/service/import/dxf.go`, `internal/service/plc/fit.go` |

## License

MIT
