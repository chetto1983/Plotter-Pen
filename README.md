# Plotter-Pen

CAD editor for pen plotters with PLC integration via OPC UA. Features a Go backend with Gin/GORM and a browser-based JavaScript frontend with Three.js 3D visualization.

## Features

- **CAD Editor**: Draw lines, arcs, circles, polygons with snap and constraints
- **File Import**: DXF, SVG support with B-spline interpolation and arc fitting
- **PLC Output**: Generate optimized toolpaths with J/L/A commands
- **OPC UA**: Send commands directly to industrial PLCs (Siemens S7-1500 tested)
- **3D Simulation**: Real-time tool visualization with Three.js thick line rendering, zoom controls, rotation
- **Touch Support**: Tablet/HMI optimized with pinch-zoom, two-finger pan, single-finger orbit
- **Persistence**: SQLite database for drawings, tools, and settings

## Prerequisites

- Go 1.27.1+ (for production backend)
- Node.js 18+ (required for webpack build and Three.js Line2 modules)
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

# Run
./plotter-pen.exe

# Open browser at http://localhost:8000
```

### Docker

```bash
# Build (includes frontend bundle)
docker build -t plotter-pen .

# Run with Docker Compose
docker compose up --build
```

## Configuration

### OPC UA Settings

Configure via the web UI or edit `opcua_config.json`:

- `endpoint`: OPC UA endpoint URL (e.g., `opc.tcp://192.168.0.1:4840`)
- `nodeId`: Target node for commands
- `username` / `password`: Credentials for authenticated servers
- `triggerNodeId`: Optional trigger node after payload write

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8000 |
| `DB_PATH` | SQLite database path | database.sqlite |
| `OPCUA_ENDPOINT` | OPC UA server URL | - |
| `OPCUA_NODE_ID` | Target OPC UA node | - |
| `GIN_MODE` | Gin mode (debug/release) | debug |
| `API_TOKEN` | API authentication token | - |

## Architecture

```
plotter-pen/
├── cmd/server/           # Go entry point
├── internal/
│   ├── handler/          # HTTP API handlers
│   ├── service/
│   │   ├── import/       # DXF, SVG parsers
│   │   ├── plc/          # PLC command generation
│   │   └── opcua/        # OPC UA client
│   ├── persistence/      # SQLite + GORM
│   └── middleware/       # CORS, security, logging
├── pkg/
│   └── geom/             # Geometry primitives
├── src/                  # JavaScript frontend
│   ├── geometry/         # Primitives, B-spline, arc fitting
│   ├── plc/              # 3D visualization (Three.js Line2, touch)
│   ├── tools/            # Drawing tools
│   └── app/              # State management, UI
├── node_modules/         # Three.js Line2 dependencies (npm)
└── assets/               # Static resources
```

## API Endpoints

### Core

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET/POST | Autosave state |
| `/api/drawings` | GET/POST | Named drawings CRUD |
| `/api/drawings/:id` | GET/PUT/DELETE | Single drawing |
| `/api/tools` | GET/POST | Tool library |

### Import

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/parse-dxf` | POST | Parse DXF content |
| `/api/smart-import` | POST | Import with arc fitting |
| `/api/parse-svg` | POST | Parse SVG content |

### PLC & OPC UA

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plc/extract` | POST | Generate PLC commands |
| `/api/plc/settings` | GET/POST | PLC simulation settings |
| `/api/opcua/config` | GET/PUT | OPC UA configuration |
| `/api/opcua/send` | POST | Send commands to PLC |
| `/api/opcua/ws` | WS | Real-time position stream |

### Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET | Liveness probe |
| `/readyz` | GET | Readiness probe |
| `/health` | GET | Detailed status |

## PLC Command Format

```
J X {x}, Y {y}, Z {z}, V {speed}   # Jump (rapid move)
L X {x}, Y {y}, Z {z}, V {speed}   # Line (cut move)
A X {x}, Y {y}, Z {z}, I {aux_x}, J {aux_y}, V {speed}   # Arc (I,J = through point)
WAIT {ms}                          # Wait after pen down
```

## Testing

```bash
# All Go tests
go test ./...

# Specific package with verbose
go test ./internal/service/plc/... -v

# With race detector
go test -race ./...

# Benchmarks
go test ./internal/service/plc/... -bench=.
```

## Development

### Key Algorithms

- **Arc Fitting** (`fit.go`, `biarc.js`): Fits arcs/lines to point sequences using circle-from-three-points
- **B-Spline** (`spline.go`, `b-spline.js`): De Boor algorithm for curve evaluation
- **Path Optimization** (`optimizer.go`): Nearest-neighbor TSP for minimal travel

### Critical Values

| Parameter | Value | Location |
|-----------|-------|----------|

| Spline samples | 800 | dxf.go |
| Arc tolerance | 0.05 | fit.go |
| Arc search range | 350 | fit.go |
| Line search range | 120 | fit.go |

## License

MIT
