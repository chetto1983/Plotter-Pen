# CAM Engine Roadmap v2.0

## Priority: Biarc Fitting in Go

| File | Status | Change |
|------|--------|--------|
| `server/cam-engine/biarc.go` | TODO | Port `fitArcsAndLines()` from JS |
| `server/cam-engine/profile.go` | TODO | Use biarc in `writeClosedPath/writeOpenPath` |
| `server/cam-engine/geometry.go` | TODO | Add `PathSegment` struct with arc data |

**Goal**: G2/G3 output instead of G1-only. ~100 lines vs ~1000s.

## Architecture

```
Go CAM Engine (server/cam-engine/)
├── main.go      - HTTP API, settings
├── gcode.go     - G0/G1/G2/G3/M codes ✓
├── geometry.go  - Loops, segments, spatial grid
├── bspline.go   - B-Spline evaluation (De Boor) ✓
├── biarc.go     - Arc fitting (TODO)
├── profile.go   - Profile toolpaths
├── pocket.go    - Pocket strategies
└── clipper.go   - Boolean ops
```

## Backlog

| Priority | Feature | File |
|----------|---------|------|
| P0 | Biarc fitting | biarc.go |
| P1 | Drilling cycles G81/82/83 | drilling.go |
| P2 | Lead-in/lead-out | leadin.go |
| P3 | Adaptive clearing | pocket.go |
| P4 | Post-processor profiles | postprocessor.go |

---

## Current State Assessment

### Go CAM Engine (88ms for 100 pockets ✓)

| Component | Status | Issues |
|-----------|--------|--------|
| `gcode.go` | ✓ Complete | Full G0-G92, M0-M30 coverage |
| `geometry.go` | ✓ Working | Spatial grid, segment connection (configurable tolerance) |
| `clipper.go` | ✓ Robust | Magic winding flip removed. Predictable offsetting. |
| `pocket.go` | ✓ Advanced | Biarc fitting (G2/G3). Strict area check + adaptive reversal to prevent expansion loops. |
| `profile.go` | ✓ Advanced | Biarc fitting enabled (G2/G3). Configurable tolerance. |
| `bspline.go` | ✓ Complete | Native De Boor algorithm for Spline support |

### Frontend UI

| Component | Status | Issues |
|-----------|--------|--------|
| Operations panel | ⚠️ Basic | No per-operation settings |
| Settings modal | ✓ Enhanced | Global settings + Tolerance path stitching |
| Tool selection | ❌ Missing | Hardcoded tool ID |
| Strategy picker | ❌ Missing | No strategy options |

---

## Phase 1: G-Code Commands (Sprint 1)

### 1.1 Drilling Canned Cycles

**File**: `server/cam-engine/drilling.go` (NEW)

```go
// G81 - Standard drilling
func (g *GCodeGenerator) G81(x, y, z, r, f float64)

// G82 - Spot drilling (with dwell)
func (g *GCodeGenerator) G82(x, y, z, r, p, f float64)

// G83 - Peck drilling (chip breaking)
func (g *GCodeGenerator) G83(x, y, z, r, q, f float64)

// G84 - Tapping
func (g *GCodeGenerator) G84(x, y, z, r, f float64)

// G85 - Boring (feed out)
func (g *GCodeGenerator) G85(x, y, z, r, f float64)
```

### 1.2 Arc Improvements

**File**: `server/cam-engine/gcode.go`

- G2/G3 with Z (helical interpolation)
- Full circle support (I/J format for >180°)
- Arc tolerance validation

---

## Phase 2: Toolpath Strategies (Sprint 2)

### 2.1 Pocket Strategies

**File**: `server/cam-engine/pocket.go`

| Strategy | Algorithm | Use Case |
|----------|-----------|----------|
| **Constant Stepover** | Offset inward by fixed % | ✓ Current |
| **Adaptive Clearing** | Maintain constant chip load | Roughing |
| **Trochoidal** | Circular moves + linear step | HSM |
| **Spiral** | Continuous inside-out path | Finishing |

```go
type PocketStrategy string
const (
    StrategyConstant   PocketStrategy = "constant"
    StrategyAdaptive   PocketStrategy = "adaptive"
    StrategyTrochoidal PocketStrategy = "trochoidal"
    StrategySpiral     PocketStrategy = "spiral"
)
```

### 2.2 Profile Strategies

**File**: `server/cam-engine/profile.go`

| Feature | Description |
|---------|-------------|
| **Side selection** | Inside / Outside / On-line |
| **Climb vs Conventional** | Cut direction control |
| **Lead-in/Lead-out** | Arc, ramp, or direct entry |
| **Multiple passes** | Roughing + finishing offset |

### 2.3 Drilling Strategy

**File**: `server/cam-engine/drilling.go`

```go
type DrillStrategy struct {
    Type       string  // "standard", "peck", "deep", "tap"
    PeckDepth  float64 // Q value for G83
    Dwell      float64 // P value for G82
    Retract    string  // "rapid" or "feed"
}
```

---

## Phase 3: Entry/Exit Motions (Sprint 2)

### 3.1 Lead-In Types

**File**: `server/cam-engine/leadin.go` (NEW)

| Type | G-code | Parameters |
|------|--------|------------|
| Direct | G0 → G1 | None |
| Ramp | G1 with Z | Angle, distance |
| Helix | G2/G3 + Z | Radius, pitch |
| Arc | G2/G3 | Radius |

```go
type LeadIn struct {
    Type     string  // "direct", "ramp", "helix", "arc"
    Angle    float64 // For ramp (degrees)
    Radius   float64 // For helix/arc (mm)
    Distance float64 // Approach distance (mm)
}
```

### 3.2 Lead-Out Types

| Type | Description |
|------|-------------|
| Direct | Retract vertically |
| Arc | Tangent departure |
| Overcut | Pass start point |

---

## Phase 4: Tool Management (Sprint 3)

### 4.1 Tool Library Schema

**File**: `server/cam-engine/tools.go` (NEW)

```go
type Tool struct {
    ID           int     `json:"id"`
    Name         string  `json:"name"`
    Type         string  `json:"type"` // endmill, drill, ball, chamfer
    Diameter     float64 `json:"diameter"`
    FluteLength  float64 `json:"fluteLength"`
    TotalLength  float64 `json:"totalLength"`
    NumberFlutes int     `json:"numberOfFlutes"`
    Material     string  `json:"material"` // hss, carbide, diamond
    MaxRPM       float64 `json:"maxRPM"`
    MaxFeedXY    float64 `json:"maxFeedXY"`
    MaxFeedZ     float64 `json:"maxFeedZ"`
}
```

### 4.2 Tool Selection Logic

```go
func SelectTool(feature Feature, tools []Tool) *Tool {
    // 1. Filter by type (pocket → endmill, hole → drill)
    // 2. Filter by diameter (tool < feature width)
    // 3. Filter by reach (flute length > depth)
    // 4. Sort by diameter (largest first for roughing)
    // 5. Return best match
}
```

---

## Phase 5: UI/UX Improvements (Sprint 3)

### 5.1 Operation Panel Redesign

**File**: `plotter_pen.html` (lines 662-727)

```html
<div class="cam-operation">
  <div class="op-header">
    <span class="op-icon">🔄</span>
    <span class="op-name">Profile #1</span>
    <span class="op-tool">T1 - 3mm End Mill</span>
  </div>
  <div class="op-details">
    <span>Depth: -5mm</span>
    <span>Feed: 800mm/min</span>
  </div>
  <div class="op-actions">
    <button class="btn-edit">Edit</button>
    <button class="btn-delete">Delete</button>
    <button class="btn-up">↑</button>
    <button class="btn-down">↓</button>
  </div>
</div>
```

### 5.2 Per-Operation Settings Modal

**File**: `plotter_pen.html` (NEW modal)

| Section | Controls |
|---------|----------|
| **Tool** | Dropdown with tool library |
| **Strategy** | Radio: Constant/Adaptive/Trochoidal |
| **Side** | Radio: Outside/Inside/On-line |
| **Depths** | Start Z, Target Z, Step Down |
| **Feeds** | Feed XY, Feed Z, Spindle RPM |
| **Entry** | Dropdown: Direct/Ramp/Helix/Arc |

### 5.3 Strategy Visualization

- Show toolpath preview before generation
- Color-code by operation type
- Animation of tool movement

### 5.4 Progress Feedback

```javascript
// Show progress during generation
CAMManager.onProgress = (percent, message) => {
    progressBar.style.width = percent + '%';
    statusText.textContent = message;
};
```

---

## Phase 6: Post-Processor System (Sprint 4)

### 6.1 Machine Profiles

**File**: `server/cam-engine/postprocessor.go` (NEW)

```go
type MachineProfile struct {
    Name          string
    LineNumbers   bool
    LineIncrement int
    ArcFormat     string // "R" or "IJ"
    CommentStyle  string // ";" or "()"
    Precision     int    // Decimal places
    SafeStart     []string // G-codes at program start
    SafeEnd       []string // G-codes at program end
}

var Profiles = map[string]MachineProfile{
    "generic": {Name: "Generic 3-Axis", ArcFormat: "R"},
    "fanuc":   {Name: "Fanuc", LineNumbers: true, ArcFormat: "IJ"},
    "haas":    {Name: "Haas", LineNumbers: true, ArcFormat: "R"},
    "grbl":    {Name: "GRBL/LinuxCNC", ArcFormat: "R"},
}
```

### 6.2 Post-Processor Options

| Option | Values |
|--------|--------|
| Line numbers | On/Off, increment |
| Arc format | R (radius) / IJ (center) |
| Comments | ; semicolon / () parentheses |
| Precision | 2-6 decimal places |
| Units | mm (G21) / inch (G20) |

---

## Phase 7: Safety & Validation (Sprint 4)

### 7.1 Collision Detection

```go
func CheckCollisions(toolpath []Point, stock BoundingBox, tool Tool) []Warning {
    // 1. Rapid moves stay above stock top
    // 2. Tool fits within stock boundaries
    // 3. Z depth within stock height
    // 4. Tool reach covers required depth
}
```

### 7.2 Geometry Validation

```go
func ValidateGeometry(primitive Primitive) error {
    // 1. Check for self-intersecting polygons
    // 2. Minimum feature size > tool diameter
    // 3. Internal corners accessible by tool radius
    // 4. Closed paths for pocketing operations
}
```

---

## Implementation Priority

### Sprint 1 (Foundation)

1. ☐ Add drilling canned cycles (G81/82/83)
2. ☐ Implement helical interpolation (G2/G3+Z)
3. ☐ Per-operation settings in UI
4. ☐ Tool selection dropdown

### Sprint 2 (Strategies)

1. ☐ Adaptive clearing algorithm
2. ☐ Trochoidal milling
3. ☐ Lead-in/lead-out implementation
4. ☐ Strategy selector in UI

### Sprint 3 (Polish)

1. ☐ Tool library management UI
2. ☐ Operation reordering
3. ☐ Progress indicators
4. ☐ Toolpath preview enhancement

### Sprint 4 (Production)

1. ☐ Post-processor selection
2. ☐ Collision detection basics
3. ☐ Geometry validation
4. ☐ Machine profile system

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/cam-engine/drilling.go` | Drilling strategies & canned cycles |
| `server/cam-engine/leadin.go` | Entry/exit motion generation |
| `server/cam-engine/tools.go` | Tool library management |
| `server/cam-engine/postprocessor.go` | Machine-specific output |
| `server/cam-engine/validate.go` | Geometry & collision checks |

## Files to Modify

| File | Changes |
|------|---------|
| `server/cam-engine/gcode.go` | Helical arcs, line numbers |
| `server/cam-engine/pocket.go` | Strategy selection |
| `server/cam-engine/profile.go` | Lead-in/lead-out |
| `server/cam-engine/main.go` | Tool library, post-processor |
| `plotter_pen.html` | Per-operation UI, strategy picker |
| `src/cam/CAMManager.js` | Operation editing, tool selection |
| `src/cam/ToolLibrary.js` | UI integration |

---

## Verification Plan

1. **Unit Tests**: Each G-code command validates output format
2. **Integration Test**: 100 circle pocket < 500ms
3. **Visual Test**: Preview matches generated toolpath
4. **Simulation**: Run through G-code simulator (CAMotics)
5. **Machine Test**: Cut test part on actual CNC

---

## Sources

- [Autodesk PowerMill Features](https://www.autodesk.com/products/powermill/features)
- [CNC Cookbook - CAM Toolpaths](https://www.cnccookbook.com/complete-guide-to-cam-toolpaths-and-operations-for-milling/)
- [Hurco - Toolpath Strategies](https://blog.hurco.com/mastering-toolpath-strategies-a-cnc-machinists-guide-to-efficiency)
