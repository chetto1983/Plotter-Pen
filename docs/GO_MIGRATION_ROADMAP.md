# Go Backend Migration Roadmap

## SCOPE

- **Migration Scope:** Backend Only (Node.js → Go)
- **API Compatibility:** Clean Slate (redesign for Go patterns)
- **Frontend:** Keep JavaScript as-is (no 3D UI changes this phase)

## DEPLOYMENT REQUIREMENTS

- **Docker:** Must run in containerized environment
- **Industrial Screens:** Various resolutions, outdoor/indoor
- **Touch Screen:** Full touch support, no mouse required
- **Responsive:** Adapt to screen size automatically
- **User Friendly:** Large buttons, clear icons, minimal text

### Touch Screen UI Guidelines

| Element | Minimum Size | Notes |
|---------|--------------|-------|
| Buttons | 44x44px | Apple HIG recommendation |
| Touch Targets | 48x48px | Google Material Design |
| Spacing | 8px minimum | Prevent accidental taps |
| Font Size | 16px minimum | Readable at arm's length |
| Icons | 24x24px min | With text labels |

### Responsive Breakpoints

```css
/* Industrial screens */
@media (max-width: 800px)  { /* 7" touch panel */ }
@media (max-width: 1024px) { /* 10" touch panel */ }
@media (max-width: 1280px) { /* 12" touch panel */ }
@media (min-width: 1920px) { /* Large HMI display */ }
```

### Docker Deployment

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o server cmd/server/main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/plotter_pen.html .
COPY --from=builder /app/src ./src
COPY --from=builder /app/styles ./styles
EXPOSE 8000
CMD ["./server"]
```

### Touch-Friendly Frontend Changes

| Component | Current | Touch-Friendly |
|-----------|---------|----------------|
| Ribbon buttons | 32px | 48px minimum |
| Tool icons | 24px | 40px with padding |
| Canvas gestures | Mouse only | Pinch/pan/tap |
| Scrollbars | Thin | Hidden, swipe instead |
| Dialogs | Small inputs | Large input fields |
| Selection | Click | Tap + long-press |

## Executive Summary

Migration of Sacchi Plotter Pen backend from Node.js to Go.

- Current Node.js backend: ~2,080 LOC
- Existing Go CAM engine: ~876 LOC
- Target: Single unified Go binary

## Go Package Inventory

### Core Infrastructure

| Purpose | Package | Notes |
|---------|---------|-------|
| HTTP Router | `github.com/gin-gonic/gin` | 48% Go devs use it |
| SQLite | `gorm.io/driver/sqlite` | GORM ORM |
| OPC UA | `github.com/gopcua/opcua` | Production-ready |

### File Formats

| Purpose | Package | Notes |
|---------|---------|-------|
| DXF | `github.com/yofu/dxf` | AC2000 support |
| SVG | `github.com/rustyoz/svg` | 2025 update |
| STL | `github.com/hschendel/stl` | Transform support |

### Geometry & CAM

| Purpose | Package | Notes |
|---------|---------|-------|
| Clipper2 | `github.com/bolom009/go-clipper2` | ALREADY USED |
| SDF | `github.com/deadsy/sdfx` | STL generation |

## Target Architecture

```text
plotter-pen-server (Go)
├── cmd/server/main.go        - Entry point
├── internal/handler/         - HTTP handlers
│   ├── cam.go               - /api/cam/*
│   ├── dxf.go               - /api/parse-dxf, export
│   ├── svg.go               - /api/parse-svg (NEW)
│   ├── stl.go               - /api/parse-stl (NEW)
│   ├── opcua.go             - /api/opcua/*
│   └── persistence.go       - /api/state, drawings
├── internal/service/         - Business logic
│   ├── cam/                 - CAM processing
│   ├── opcua/               - OPC UA client
│   └── import/              - File importers
├── pkg/geom/                - Geometry primitives
├── pkg/clipper/             - Clipper2 adapter
├── pkg/curve/               - Arc/line fitting
├── pkg/gcode/               - G-code generation
└── pkg/plc/                 - PLC commands
```

## Migration Phases

### Phase 1: Core Infrastructure ✅ COMPLETE

- `cmd/server/main.go` - Gin HTTP server
- `internal/persistence/db.go` - SQLite + GORM
- `internal/handler/persistence.go` - CRUD endpoints

**Status:** Fully implemented with 96.7% test coverage

### Phase 2: OPC UA Integration ⏳ TESTING

- `internal/service/opcua/client.go` - Connection, R/W
- `internal/service/opcua/config.go` - Config hierarchy
- `internal/handler/opcua.go` - REST endpoints

**Status:** Code complete, pending real PLC hardware testing

### Phase 3: DXF Import/Export ✅ COMPLETE

- `internal/service/import/dxf.go` - DXF parsing
- `internal/handler/dxf.go` - Endpoints
- `pkg/geom/primitives.go` - Extended types

**Status:** Fully implemented with test coverage

### Phase 4: SVG & STL Support ✅ COMPLETE

- `internal/service/import/svg.go` - SVG parsing
- `internal/service/import/stl.go` - STL parsing
- Endpoints for both formats

**Status:** Fully implemented with 91.6% test coverage

### Phase 5: CAM Integration ✅ COMPLETE

- Merge `server/cam-engine/` into main binary
- Replace subprocess with direct function call
- Add concurrency with goroutines

**Status:** Fully implemented with 99.1% test coverage

### Phase 6: System Utils & Polish ✅ COMPLETE

- Port detection
- Browser launch
- Environment parsing

**Status:** Fully implemented with 85.8% test coverage

### Phase 7: Production Hardening ✅ COMPLETE

- `Dockerfile` - Fixed to build Go binary (was running Node.js)
- `internal/middleware/cors.go` - CORS headers
- `internal/middleware/security.go` - Security headers (XSS, clickjacking)
- `internal/middleware/logging.go` - Structured JSON logging
- `internal/middleware/ratelimit.go` - Token bucket rate limiting
- `internal/middleware/recovery.go` - Panic recovery
- `internal/handler/health.go` - Health check endpoints (/healthz, /readyz)
- `internal/persistence/db.go` - Connection pooling

**Status:** Fully implemented with 88.6% test coverage

### Phase 8: OPC UA Hardware Testing ✅ COMPLETE

- Real PLC hardware validation with Siemens S7-1500
- Integration tests passing
- Certificate-based authentication (Basic256Sha256)
- Self-signed certificate generation with OPC UA compliant key usage

**Status:** Fully tested with real PLC hardware

**Test Results:**
- ✓ Endpoint discovery (Sign + SignAndEncrypt)
- ✓ Secure connection with Basic256Sha256
- ✓ Read position nodes (X, Y, Z)
- ✓ Read data node (string array)

**Certificate Files:**

- `certs/client.der` - DER format for PLC import
- `certs/client.pem` - PEM format certificate
- `certs/client.key` - Private key (keep secure)

### Phase 9: Frontend OPC UA Integration ⏳ PENDING

- OPC UA configuration UI panel
- Real-time position display (X, Y, Z)
- Connection status indicator
- Send to PLC workflow
- Live position subscription

**Files to Create/Modify:**

| File | Purpose |
|------|---------|
| `src/ui/components/OpcuaPanel.js` | OPC UA configuration UI |
| `src/ui/components/PositionDisplay.js` | Real-time X/Y/Z display |
| `src/ui/components/ConnectionStatus.js` | Connection indicator |
| `src/services/OpcuaService.js` | API client for OPC UA endpoints |
| `src/plc/PLCOutputGenerator.js` | Update for Go backend |

**UI Components:**

```
┌─────────────────────────────────────────┐
│ OPC UA Configuration                    │
├─────────────────────────────────────────┤
│ Endpoint: [opc.tcp://192.168.0.1:4840] │
│ Status:   ● Connected                   │
├─────────────────────────────────────────┤
│ Position:  X: 123.45  Y: 67.89  Z: 0.00│
├─────────────────────────────────────────┤
│ [Connect] [Send to PLC] [Configure]     │
└─────────────────────────────────────────┘
```

**Features:**

1. **Configuration Panel** - Edit OPC UA settings (endpoint, nodes, security)
2. **Connection Status** - Visual indicator (green/red/yellow)
3. **Position Display** - Real-time X/Y/Z from PLC subscription
4. **Send Workflow** - Send G-code/PLC commands to machine
5. **Error Handling** - User-friendly error messages

**API Integration:**

| Frontend Action | Backend Endpoint |
|-----------------|------------------|
| Load config | `GET /api/opcua/config` |
| Save config | `PUT /api/opcua/config` |
| Send to PLC | `POST /api/opcua/send` |
| Get position | WebSocket subscription (future) |

## API Endpoints

| Endpoint | Method | Handler |
|----------|--------|---------|
| `/healthz` | GET | Healthz (liveness probe) |
| `/readyz` | GET | Readyz (readiness probe) |
| `/health` | GET | Health (detailed status) |
| `/api/opcua/config` | GET/PUT | OpcuaConfig |
| `/api/opcua/send` | POST | OpcuaSend |
| `/api/parse-dxf` | POST | ParseDXF |
| `/api/smart-import` | POST | SmartImport |
| `/api/export-dxf` | POST | ExportDXF |
| `/api/parse-svg` | POST | ParseSVG |
| `/api/parse-stl` | POST | ParseSTL |
| `/api/cam/process` | POST | CamProcess |
| `/api/cam/parse` | POST | CamParse |
| `/api/cam/postprocess` | POST | CamPostprocess |
| `/api/state` | GET/POST | State |
| `/api/drawings/*` | CRUD | Drawings |
| `/api/tools` | CRUD | Tools |
| `/api/cam/settings` | GET/POST | CamSettings |
| `/api/machines` | GET | ListMachines |
| `/api/machines/:id` | GET/PUT | MachineConfig |
| `/api/machines/active` | GET/PUT | ActiveMachine |

## Database Schema

```sql
CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE drawings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  data TEXT NOT NULL,
  preview_img TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'endmill',
  diameter REAL NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cam_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Test Coverage (as of 2026-01-16)

| Package | Coverage | Status |
|---------|----------|--------|
| `pkg/clipper` | 100% | ✅ |
| `pkg/curve` | 100% | ✅ |
| `pkg/gcode` | 100% | ✅ |
| `pkg/geom` | 100% | ✅ |
| `pkg/plc` | 100% | ✅ |
| `internal/service/cam` | 99.1% | ✅ |
| `internal/persistence` | 94.9% | ✅ |
| `internal/service/import` | 91.6% | ✅ |
| `internal/middleware` | 88.6% | ✅ |
| `internal/system` | 85.8% | ✅ |
| `internal/handler` | 84.1% | ✅ |
| `internal/service/opcua` | 23.7% | ✅ Hardware tested (S7-1500) |

### Run All Tests

```bash
go test ./... -cover
```

## Verification

### Unit Tests

```bash
go test ./internal/service/...
go test ./pkg/...
```

### End-to-End

1. Start Go server: `go run cmd/server/main.go`
2. Open browser: `http://localhost:8000/plotter_pen.html`
3. Import DXF → Generate pocket → Preview G-code
4. Send to OPC UA (with simulator)

## go.mod

```go
module plotter-pen

go 1.22

require (
    github.com/gin-gonic/gin v1.10.0
    gorm.io/gorm v1.25.0
    gorm.io/driver/sqlite v1.5.0
    github.com/gopcua/opcua v0.5.0
    github.com/yofu/dxf latest
    github.com/rustyoz/svg latest
    github.com/hschendel/stl v1.1.0
    github.com/bolom009/go-clipper2 v1.3.0
)
```

## Machine Configuration (NEW)

### Supported Machine Types

| Machine | Motion | Output | Features |
|---------|--------|--------|----------|
| **Pen Plotter** | XY | PLC/OPC UA | Z up/down, pen selection |
| **Laser Cutter** | XY | G-code | Power control, pulse mode |
| **CNC Router** | XYZ | G-code | Depth, stepdown, spindle |
| **3D Printer** | XYZ | G-code | Extrusion, layer height |

### Machine Configuration Schema

```go
type MachineConfig struct {
    Type        string       `json:"type"`        // plotter, laser, router, printer
    Name        string       `json:"name"`
    Dimensions  Dimensions   `json:"dimensions"`  // work area
    Speeds      SpeedConfig  `json:"speeds"`
    Tool        ToolConfig   `json:"tool"`
    Output      OutputConfig `json:"output"`      // G-code or PLC
}

type Dimensions struct {
    X, Y, Z float64 `json:"x,y,z"`
}

type SpeedConfig struct {
    RapidXY   float64 `json:"rapidXY"`
    FeedXY    float64 `json:"feedXY"`
    FeedZ     float64 `json:"feedZ"`
    MaxRPM    float64 `json:"maxRPM,omitempty"`
}

type ToolConfig struct {
    Diameter  float64 `json:"diameter"`
    Type      string  `json:"type"`      // pen, laser, endmill, nozzle
    Power     float64 `json:"power,omitempty"`     // laser W
    LayerH    float64 `json:"layerHeight,omitempty"` // printer mm
}

type OutputConfig struct {
    Format    string `json:"format"`    // gcode, plc
    PostProc  string `json:"postproc"`  // grbl, marlin, custom
}
```

### Default Machine Presets

```go
var MachinePresets = map[string]MachineConfig{
    "pen_plotter": {
        Type: "plotter",
        Dimensions: Dimensions{X: 420, Y: 297, Z: 10},
        Speeds: SpeedConfig{RapidXY: 5000, FeedXY: 1000},
        Tool: ToolConfig{Type: "pen", Diameter: 0.5},
        Output: OutputConfig{Format: "plc"},
    },
    "laser_40w": {
        Type: "laser",
        Dimensions: Dimensions{X: 600, Y: 400, Z: 0},
        Speeds: SpeedConfig{RapidXY: 10000, FeedXY: 3000},
        Tool: ToolConfig{Type: "laser", Power: 40},
        Output: OutputConfig{Format: "gcode", PostProc: "grbl"},
    },
    "cnc_router": {
        Type: "router",
        Dimensions: Dimensions{X: 500, Y: 300, Z: 80},
        Speeds: SpeedConfig{RapidXY: 3000, FeedXY: 800, FeedZ: 200, MaxRPM: 24000},
        Tool: ToolConfig{Type: "endmill", Diameter: 6},
        Output: OutputConfig{Format: "gcode", PostProc: "grbl"},
    },
    "3d_printer": {
        Type: "printer",
        Dimensions: Dimensions{X: 220, Y: 220, Z: 250},
        Speeds: SpeedConfig{RapidXY: 6000, FeedXY: 1500, FeedZ: 300},
        Tool: ToolConfig{Type: "nozzle", Diameter: 0.4, LayerH: 0.2},
        Output: OutputConfig{Format: "gcode", PostProc: "marlin"},
    },
}
```

### Post-Processor Support

| Post-Processor | Machines | Features |
|----------------|----------|----------|
| **GRBL** | Laser, Router | G0/G1/G2/G3, M3/M5 spindle |
| **Marlin** | 3D Printer | G0/G1, E extrusion, M104/M109 temp |
| **Custom PLC** | Pen Plotter | Z_UP/Z_DW, L/A/J commands |

### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/machines` | GET | List all machine presets |
| `/api/machines/:id` | GET/PUT | Get/update machine config |
| `/api/machines/active` | GET/PUT | Current active machine |

### Files to Create

| File | Purpose |
|------|---------|
| `internal/machine/config.go` | MachineConfig struct |
| `internal/machine/presets.go` | Default machine presets |
| `internal/machine/postproc.go` | Post-processor interface |
| `internal/handler/machine.go` | REST endpoints |

---

## Sources

- [gopcua/opcua](https://github.com/gopcua/opcua) - Go OPC UA client
- [yofu/dxf](https://github.com/yofu/dxf) - Go DXF parser
- [Gin Web Framework](https://go.dev/doc/tutorial/web-service-gin) - Official Go tutorial
- [hschendel/stl](https://github.com/hschendel/stl) - Go STL library
- [rustyoz/svg](https://github.com/rustyoz/svg) - Go SVG parser
- [deadsy/sdfx](https://github.com/deadsy/sdfx) - SDF-based CAD
