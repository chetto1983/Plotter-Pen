# CAD Features Implementation Roadmap

## Overview

This document outlines the implementation plan for four key CAD features:

1. **Move/Delete Selected** - Basic editing operations
2. **Box Selection** - Rubber band multi-select
3. **Save/Load JSON** - Drawing persistence
4. **Import DXF** - Load CAD files

---

## 1. Move/Delete Selected Primitives

### Current State

- Selection system exists (`selectedPrimitives` Set in main.js)
- Primitives have position properties but no `translate()` method
- No delete functionality implemented

### Implementation Steps

#### 1.1 Add Transform Methods to Primitives

**File:** `src/geometry/primitives.js`

```javascript
// Add to Primitive base class
translate(dx, dy) {
    throw new Error('translate() must be implemented');
}

// Line implementation
translate(dx, dy) {
    this.a = new Point(this.a.x + dx, this.a.y + dy);
    this.b = new Point(this.b.x + dx, this.b.y + dy);
}

// Arc implementation
translate(dx, dy) {
    this.a = new Point(this.a.x + dx, this.a.y + dy);
    this.b = new Point(this.b.x + dx, this.b.y + dy);
    this.c = new Point(this.c.x + dx, this.c.y + dy);
}

// Circle implementation
translate(dx, dy) {
    this.center = new Point(this.center.x + dx, this.center.y + dy);
}

// Rectangle implementation
translate(dx, dy) {
    this.x += dx;
    this.y += dy;
}

// Polygon implementation
translate(dx, dy) {
    this.points = this.points.map(p => new Point(p.x + dx, p.y + dy));
}
```

#### 1.2 Delete Selected Primitives

**File:** `src/main.js`

```javascript
deleteSelected() {
    if (this.selectedPrimitives.size === 0) return;

    // Save state for undo
    this.stateManager.pushState();

    // Remove selected primitives
    this.primitives = this.primitives.filter(p => !this.selectedPrimitives.has(p));
    this.selectedPrimitives.clear();

    this.render();
}
```

#### 1.3 Move Selected with Arrow Keys

**File:** `src/app/InputHandler.js`

```javascript
// Add to keyboard handler
handleKeyDown(e) {
    const moveAmount = e.shiftKey ? 10 : 1; // mm, shift for larger steps

    switch(e.key) {
        case 'Delete':
        case 'Backspace':
            this.app.deleteSelected();
            e.preventDefault();
            break;
        case 'ArrowUp':
            this.app.moveSelected(0, moveAmount);
            e.preventDefault();
            break;
        case 'ArrowDown':
            this.app.moveSelected(0, -moveAmount);
            e.preventDefault();
            break;
        case 'ArrowLeft':
            this.app.moveSelected(-moveAmount, 0);
            e.preventDefault();
            break;
        case 'ArrowRight':
            this.app.moveSelected(moveAmount, 0);
            e.preventDefault();
            break;
    }
}
```

#### 1.4 Move Selected Method

**File:** `src/main.js`

```javascript
moveSelected(dx, dy) {
    if (this.selectedPrimitives.size === 0) return;

    // Save state for undo
    this.stateManager.pushState();

    // Move all selected primitives
    for (const primitive of this.selectedPrimitives) {
        primitive.translate(dx, dy);
    }

    this.render();
}
```

#### 1.5 Drag Move with Mouse

**File:** `src/main.js`

```javascript
// Add state tracking
this.isDragging = false;
this.dragStart = null;
this.dragOffset = null;

// In mouse down handler (select tool)
if (this.selectedPrimitives.size > 0 && this.isPointInSelection(worldPos)) {
    this.isDragging = true;
    this.dragStart = worldPos;
    this.stateManager.pushState();
}

// In mouse move handler
if (this.isDragging) {
    const dx = worldPos.x - this.dragStart.x;
    const dy = worldPos.y - this.dragStart.y;

    for (const primitive of this.selectedPrimitives) {
        primitive.translate(dx, dy);
    }

    this.dragStart = worldPos;
    this.render();
}

// In mouse up handler
this.isDragging = false;
```

### UI Updates

- Add Delete button to toolbar (trash icon)
- Show "Move: Arrow keys, Delete: Del" in status bar when items selected
- Cursor change to 'move' when hovering over selection

---

## 2. Box Selection (Rubber Band)

### Implementation Approach

Use a DOM overlay div for the selection rectangle - cleaner than two-canvas approach and doesn't require re-rendering primitives.

### Implementation Steps

#### 2.1 Add Selection Box Element

**File:** `public/plotter_pen.html`

```html
<div id="canvas-container">
    <canvas id="cad-canvas"></canvas>
    <div id="selection-box" class="selection-box"></div>
</div>
```

#### 2.2 Style Selection Box

**File:** `public/style.css`

```css
#canvas-container {
    position: relative;
}

.selection-box {
    position: absolute;
    border: 1px dashed #00ffff;
    background: rgba(0, 255, 255, 0.1);
    pointer-events: none;
    display: none;
    z-index: 10;
}

.selection-box.active {
    display: block;
}
```

#### 2.3 Box Selection Logic

**File:** `src/main.js`

```javascript
// State
this.isBoxSelecting = false;
this.boxStart = null;
this.selectionBoxEl = document.getElementById('selection-box');

// Start box selection (mouse down on empty space with select tool)
startBoxSelection(screenPos) {
    this.isBoxSelecting = true;
    this.boxStart = screenPos;
    this.selectionBoxEl.classList.add('active');
    this.updateSelectionBox(screenPos);
}

// Update box during drag
updateSelectionBox(screenPos) {
    const left = Math.min(this.boxStart.x, screenPos.x);
    const top = Math.min(this.boxStart.y, screenPos.y);
    const width = Math.abs(screenPos.x - this.boxStart.x);
    const height = Math.abs(screenPos.y - this.boxStart.y);

    this.selectionBoxEl.style.left = left + 'px';
    this.selectionBoxEl.style.top = top + 'px';
    this.selectionBoxEl.style.width = width + 'px';
    this.selectionBoxEl.style.height = height + 'px';
}

// Finish selection (mouse up)
finishBoxSelection(screenPos, additive) {
    this.isBoxSelecting = false;
    this.selectionBoxEl.classList.remove('active');

    // Convert screen coords to world coords
    const start = this.renderer.screenToModel(this.boxStart);
    const end = this.renderer.screenToModel(screenPos);

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    // Clear selection if not additive (shift not held)
    if (!additive) {
        this.selectedPrimitives.clear();
    }

    // Select primitives inside box
    for (const primitive of this.primitives) {
        if (this.primitiveIntersectsBox(primitive, minX, minY, maxX, maxY)) {
            this.selectedPrimitives.add(primitive);
        }
    }

    this.render();
}
```

#### 2.4 Box Intersection Tests

**File:** `src/geometry/primitives.js`

```javascript
// Add to Primitive base class
intersectsBox(minX, minY, maxX, maxY) {
    throw new Error('intersectsBox() must be implemented');
}

// Line - check if line intersects or is inside box
intersectsBox(minX, minY, maxX, maxY) {
    // Check if either endpoint is inside
    if (this.pointInBox(this.a, minX, minY, maxX, maxY) ||
        this.pointInBox(this.b, minX, minY, maxX, maxY)) {
        return true;
    }
    // Check if line intersects any box edge
    return this.lineIntersectsBox(this.a, this.b, minX, minY, maxX, maxY);
}

// Circle - check bounding box overlap + distance check
intersectsBox(minX, minY, maxX, maxY) {
    // Find closest point on box to circle center
    const closestX = Math.max(minX, Math.min(this.center.x, maxX));
    const closestY = Math.max(minY, Math.min(this.center.y, maxY));

    const dx = this.center.x - closestX;
    const dy = this.center.y - closestY;

    return (dx * dx + dy * dy) <= (this.radius * this.radius);
}

// Rectangle - simple AABB overlap
intersectsBox(minX, minY, maxX, maxY) {
    return !(this.x + this.width < minX ||
             this.x > maxX ||
             this.y + this.height < minY ||
             this.y > maxY);
}

// Arc/Polygon - sample points along curve
intersectsBox(minX, minY, maxX, maxY) {
    const samples = this.samplePoints(20);
    return samples.some(p =>
        p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
    );
}
```

#### 2.5 Selection Modes (Optional Enhancement)

Two common CAD behaviors:

- **Window Selection** (left-to-right): Select only fully contained primitives
- **Crossing Selection** (right-to-left): Select any intersecting primitives

```javascript
finishBoxSelection(screenPos, additive) {
    const isWindowSelect = screenPos.x > this.boxStart.x;

    // Window: fully contained, Crossing: any intersection
    const testMethod = isWindowSelect ? 'isFullyInside' : 'intersectsBox';
    // ...
}
```

---

## 3. Save/Load JSON

### Current State

- StateManager already has `serializePrimitives()` and `deserializePrimitives()`
- Used for undo/redo, can be reused for file save/load

### Implementation Steps

#### 3.1 File Structure

```json
{
    "version": "1.0",
    "created": "2024-01-15T10:30:00Z",
    "workspace": {
        "width": 600,
        "height": 600,
        "gridSpacing": 10
    },
    "primitives": [
        {
            "type": "line",
            "id": "line_1705312200000_1",
            "style": {
                "strokeColor": "#ffffff",
                "lineWidth": 1
            },
            "x1": 0, "y1": 0,
            "x2": 100, "y2": 100
        }
    ]
}
```

#### 3.2 Save to File

**File:** `src/app/FileManager.js` (new file)

```javascript
export class FileManager {
    constructor(app) {
        this.app = app;
    }

    saveToFile() {
        const data = {
            version: '1.0',
            created: new Date().toISOString(),
            workspace: {
                width: this.app.workspaceWidth,
                height: this.app.workspaceHeight,
                gridSpacing: this.app.gridSpacing
            },
            primitives: this.app.primitives.map(p => p.toJSON())
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing_${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    async loadFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return reject('No file selected');

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    this.applyLoadedData(data);
                    resolve(data);
                } catch (err) {
                    reject(`Failed to load file: ${err.message}`);
                }
            };

            input.click();
        });
    }

    applyLoadedData(data) {
        // Validate version
        if (!data.version || !data.primitives) {
            throw new Error('Invalid file format');
        }

        // Clear current state
        this.app.primitives = [];
        this.app.selectedPrimitives.clear();

        // Apply workspace settings
        if (data.workspace) {
            this.app.setWorkspace(
                data.workspace.width,
                data.workspace.height,
                data.workspace.gridSpacing
            );
        }

        // Load primitives
        this.app.primitives = this.app.stateManager.deserializePrimitives(
            JSON.stringify(data.primitives)
        );

        // Reset undo stack
        this.app.stateManager.clearHistory();
        this.app.stateManager.pushState();

        this.app.render();
    }
}
```

#### 3.3 LocalStorage Auto-Save (Optional)

```javascript
// Auto-save every 30 seconds
startAutoSave() {
    setInterval(() => {
        const data = this.getDrawingData();
        localStorage.setItem('plotter_pen_autosave', JSON.stringify(data));
    }, 30000);
}

// Load on startup
loadAutoSave() {
    const saved = localStorage.getItem('plotter_pen_autosave');
    if (saved) {
        const data = JSON.parse(saved);
        if (confirm('Restore previous session?')) {
            this.applyLoadedData(data);
        }
    }
}
```

#### 3.4 UI Integration

**File:** `public/plotter_pen.html`

```html
<!-- Add to toolbar -->
<div class="tool-group">
    <button id="save-btn" class="tool-btn" title="Save Drawing (Ctrl+S)">
        <svg><!-- save icon --></svg>
    </button>
    <button id="load-btn" class="tool-btn" title="Open Drawing (Ctrl+O)">
        <svg><!-- folder-open icon --></svg>
    </button>
</div>
```

#### 3.5 Keyboard Shortcuts

```javascript
// Ctrl+S to save
if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    this.fileManager.saveToFile();
}

// Ctrl+O to open
if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    this.fileManager.loadFromFile();
}
```

---

## 4. Import DXF

### Library Choice

**dxf-parser** (npm) - Lightweight, well-maintained, parses DXF to JSON structure.

### Installation

```bash
npm install dxf-parser
```

### Implementation Steps

#### 4.1 DXF Importer Class

**File:** `src/import/DXFImporter.js` (new file)

```javascript
import DxfParser from 'dxf-parser';
import { Line, Arc, Circle, Polygon, Point } from '../geometry/primitives.js';

export class DXFImporter {
    constructor() {
        this.parser = new DxfParser();
    }

    async importFile(file) {
        const text = await file.text();
        return this.parse(text);
    }

    parse(dxfContent) {
        const dxf = this.parser.parseSync(dxfContent);
        const primitives = [];

        if (!dxf || !dxf.entities) {
            throw new Error('Invalid DXF file');
        }

        for (const entity of dxf.entities) {
            const primitive = this.convertEntity(entity);
            if (primitive) {
                primitives.push(primitive);
            }
        }

        return {
            primitives,
            bounds: this.calculateBounds(primitives)
        };
    }

    convertEntity(entity) {
        switch (entity.type) {
            case 'LINE':
                return this.convertLine(entity);
            case 'CIRCLE':
                return this.convertCircle(entity);
            case 'ARC':
                return this.convertArc(entity);
            case 'LWPOLYLINE':
            case 'POLYLINE':
                return this.convertPolyline(entity);
            case 'POINT':
                // Skip points or convert to small circle
                return null;
            case 'SPLINE':
                return this.convertSpline(entity);
            default:
                console.warn(`Unsupported DXF entity: ${entity.type}`);
                return null;
        }
    }

    convertLine(entity) {
        return new Line(
            new Point(entity.vertices[0].x, entity.vertices[0].y),
            new Point(entity.vertices[1].x, entity.vertices[1].y)
        );
    }

    convertCircle(entity) {
        return new Circle(
            new Point(entity.center.x, entity.center.y),
            entity.radius
        );
    }

    convertArc(entity) {
        // DXF arcs use center, radius, start/end angles
        const center = new Point(entity.center.x, entity.center.y);
        const startAngle = entity.startAngle * (Math.PI / 180);
        const endAngle = entity.endAngle * (Math.PI / 180);

        // Convert to three-point arc (our format)
        const startPoint = new Point(
            center.x + entity.radius * Math.cos(startAngle),
            center.y + entity.radius * Math.sin(startAngle)
        );
        const endPoint = new Point(
            center.x + entity.radius * Math.cos(endAngle),
            center.y + entity.radius * Math.sin(endAngle)
        );

        return new Arc(startPoint, endPoint, center);
    }

    convertPolyline(entity) {
        const points = entity.vertices.map(v => new Point(v.x, v.y));
        const closed = entity.shape || false;
        return new Polygon(points, closed);
    }

    convertSpline(entity) {
        // Approximate spline with polyline using control points
        // For more accuracy, implement proper spline interpolation
        if (entity.controlPoints && entity.controlPoints.length > 0) {
            const points = entity.controlPoints.map(cp => new Point(cp.x, cp.y));
            return new Polygon(points, false);
        }
        return null;
    }

    calculateBounds(primitives) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const p of primitives) {
            const bbox = p.getBoundingBox();
            minX = Math.min(minX, bbox.minX);
            minY = Math.min(minY, bbox.minY);
            maxX = Math.max(maxX, bbox.maxX);
            maxY = Math.max(maxY, bbox.maxY);
        }

        return { minX, minY, maxX, maxY };
    }
}
```

#### 4.2 Add Bounding Box to Primitives

**File:** `src/geometry/primitives.js`

```javascript
// Add to Primitive base class
getBoundingBox() {
    throw new Error('getBoundingBox() must be implemented');
}

// Line
getBoundingBox() {
    return {
        minX: Math.min(this.a.x, this.b.x),
        minY: Math.min(this.a.y, this.b.y),
        maxX: Math.max(this.a.x, this.b.x),
        maxY: Math.max(this.a.y, this.b.y)
    };
}

// Circle
getBoundingBox() {
    return {
        minX: this.center.x - this.radius,
        minY: this.center.y - this.radius,
        maxX: this.center.x + this.radius,
        maxY: this.center.y + this.radius
    };
}

// Rectangle
getBoundingBox() {
    return {
        minX: this.x,
        minY: this.y,
        maxX: this.x + this.width,
        maxY: this.y + this.height
    };
}

// Polygon
getBoundingBox() {
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys)
    };
}
```

#### 4.3 Integration with FileManager

**File:** `src/app/FileManager.js`

```javascript
import { DXFImporter } from '../import/DXFImporter.js';

async loadDXF() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.dxf';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return reject('No file selected');

            try {
                const importer = new DXFImporter();
                const result = await importer.importFile(file);

                // Option to merge or replace
                const merge = confirm('Add to existing drawing? (Cancel to replace)');

                if (!merge) {
                    this.app.primitives = [];
                    this.app.selectedPrimitives.clear();
                }

                // Add imported primitives
                this.app.primitives.push(...result.primitives);

                // Fit view to imported content
                if (!merge) {
                    this.app.fitToContent(result.bounds);
                }

                this.app.stateManager.pushState();
                this.app.render();

                resolve(result);
            } catch (err) {
                reject(`Failed to import DXF: ${err.message}`);
            }
        };

        input.click();
    });
}
```

#### 4.4 Fit View to Content

**File:** `src/main.js`

```javascript
fitToContent(bounds) {
    if (!bounds) return;

    const padding = 50; // mm
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;

    // Update workspace to fit content
    this.workspaceWidth = Math.max(contentWidth, 100);
    this.workspaceHeight = Math.max(contentHeight, 100);

    // Center view on content
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    this.renderer.setWorkspace(this.workspaceWidth, this.workspaceHeight);
    this.renderer.centerOn(centerX, centerY);
    this.renderer.fitZoom(contentWidth, contentHeight);
}
```

#### 4.5 UI Button for DXF Import

```html
<button id="import-dxf-btn" class="tool-btn" title="Import DXF">
    <svg><!-- file-import icon --></svg>
</button>
```

---

## Implementation Priority

### Phase 1: Core Editing (Move/Delete)

1. Add `translate()` to all primitives
2. Implement `deleteSelected()`
3. Add keyboard handlers (Delete, Arrow keys)
4. Add mouse drag move
5. Update toolbar/status

### Phase 2: Box Selection

1. Add selection box DOM element
2. Implement selection box sizing/positioning
3. Add `intersectsBox()` to all primitives
4. Integrate with mouse handlers
5. Add window/crossing modes

### Phase 3: Save/Load JSON

1. Create FileManager class
2. Implement save to file
3. Implement load from file
4. Add keyboard shortcuts (Ctrl+S, Ctrl+O)
5. Add auto-save (optional)

### Phase 4: DXF Import

1. Install dxf-parser
2. Create DXFImporter class
3. Implement entity conversion for LINE, CIRCLE, ARC, POLYLINE
4. Add `getBoundingBox()` to primitives
5. Implement fit-to-content view adjustment
6. Test with sample DXF files

---

## Testing Checklist

### Move/Delete ✅ IMPLEMENTED

- [x] Delete single selected primitive
- [x] Delete multiple selected primitives
- [x] Arrow keys move selection (1mm steps)
- [x] Shift+Arrow keys move selection (10mm steps)
- [ ] Mouse drag moves selection (not implemented)
- [x] Undo/redo works after move/delete

### Box Selection ✅ IMPLEMENTED

- [x] Click+drag creates selection box
- [x] Selection box highlights correctly
- [x] Primitives inside box get selected
- [x] Shift+drag adds to selection
- [x] Window vs crossing mode works

### Save/Load ✅ IMPLEMENTED

- [x] Ctrl+S triggers save
- [x] JSON file contains all primitives
- [x] Ctrl+O opens load dialog
- [x] Loading restores primitives correctly
- [x] Workspace settings restored

### DXF Import ✅ IMPLEMENTED

- [x] Can open DXF file dialog
- [x] Lines imported correctly
- [x] Circles imported correctly
- [x] Arcs imported correctly
- [x] Polylines imported correctly
- [x] View fits to imported content
- [x] Merge mode adds to existing

---

## Phase 5: Professional CAD Features (Planned)

### 5.1 Layer System

- [ ] Layer panel in sidebar (add/remove/rename layers)
- [ ] Layer visibility toggle (eye icon)
- [ ] Layer lock (prevent editing)
- [ ] Assign primitives to layers
- [ ] Layer colors/styles
- [ ] "Send to layer" context menu

### 5.2 DXF Export

- [ ] Export current drawing to DXF use (<https://www.npmjs.com/package/dxf-writer>)
- [ ] Support LINE, ARC, CIRCLE, POLYLINE entities
- [ ] Preserve layer information
- [ ] Unit conversion (mm/inches)

### 5.3 Dimension Annotations

- [ ] Linear dimension tool
- [ ] Angular dimension tool
- [ ] Radius/diameter dimension
- [ ] Dimension display formatting

### 5.4 Advanced Drawing Tools

- [ ] Fillet tool (round corners)
- [ ] Chamfer tool (cut corners)
- [ ] Offset tool (parallel copy)
- [ ] Trim/Extend tool
- [ ] Array tool (rectangular/polar)

---

## Phase 6: Enterprise Features (Planned)

### 6.1 Multi-Machine Support

- [ ] Machine profiles (name, IP, connection type)
- [ ] Switch between machines
- [ ] Machine-specific settings

### 6.2 Job Queue System

- [ ] Queue multiple drawings for sequential execution
- [ ] Job priority ordering
- [ ] Job status tracking (pending, running, complete)
- [ ] Cancel/pause job

### 6.3 User Authentication

- [ ] Login/logout
- [ ] User roles (admin, operator, viewer)
- [ ] Access control per user

### 6.4 Audit Logging

- [ ] Track drawing edits (who, when, what)
- [ ] Track PLC transmissions
- [ ] Export audit log

---

## Phase 7: Quality & Packaging (Planned)

### 7.1 Testing

- [ ] Unit tests for geometry functions
- [ ] Integration tests for tools
- [ ] Browser-based E2E tests
- [ ] Automated CI pipeline

### 7.2 Offline/PWA Support

- [ ] Service worker for offline access
- [ ] PWA manifest
- [ ] Install prompt

### 7.3 Desktop Packaging (Electron)

- [ ] Electron wrapper
- [ ] Windows installer (NSIS/MSI)
- [ ] macOS app bundle
- [ ] Auto-update mechanism

### 7.4 Documentation

- [ ] User manual (PDF/online)
- [ ] Video tutorials
- [ ] API documentation
- [ ] Keyboard shortcuts PDF

---

## Phase 8: Commercial Distribution (Planned)

### 8.1 Licensing System

- [ ] License key validation
- [ ] Trial period management
- [ ] Feature tiers (Basic/Pro/Enterprise)

### 8.2 Pricing Model

- [ ] One-time purchase option
- [ ] Subscription option
- [ ] Volume licensing

### 8.3 Support System

- [ ] Bug reporting form
- [ ] Feature request submission
- [ ] Email support integration

---

## Phase 9: Milling / CAM Support (Planned)

### 9.1 G-code Output Generator

- [ ] Standard G-code output format
- [ ] G00 - Rapid positioning
- [ ] G01 - Linear interpolation with feed rate
- [ ] G02/G03 - Circular interpolation CW/CCW
- [ ] M03/M04/M05 - Spindle control (on CW, on CCW, stop)
- [ ] M08/M09 - Coolant on/off
- [ ] G90/G91 - Absolute/Incremental mode selection
- [ ] Post-processor selection (Fanuc, Haas, LinuxCNC, Mach3)

### 9.2 Toolpath Operations

| Operation | Description | Status |
|-----------|-------------|--------|
| **Contour** | Machine outer/inner perimeter | 🔲 Planned |
| **Pocket** | Clear enclosed area (zigzag/spiral) | 🔲 Planned |
| **Drill** | Point-to-point hole drilling (G81) | 🔲 Planned |
| **Peck Drill** | Deep hole with chip breaking (G83) | 🔲 Planned |
| **Bore** | Precision hole enlargement (G85/G86) | 🔲 Planned |
| **Face** | Surface flattening | 🔲 Planned |
| **Engrave** | V-carve text/patterns | 🔲 Planned |

### 9.3 Machine Parameters

- [ ] Spindle speed (RPM) input
- [ ] Feed rate (mm/min) input
- [ ] Plunge rate (Z descent speed)
- [ ] Step-down (depth per pass)
- [ ] Step-over (pocket overlap %)
- [ ] Safe Z height (retract position)
- [ ] Stock surface (Z0 reference)
- [ ] Final depth input

### 9.4 Tool Library

- [ ] Tool database (add/edit/delete tools)
- [ ] Tool types: End mill, Ball nose, Drill, V-bit
- [ ] Tool diameter
- [ ] Flute count
- [ ] Tool length
- [ ] Cutting length
- [ ] Material presets (speeds/feeds for aluminum, wood, plastic, steel)
- [ ] Tool change commands (M06 Txx)

### 9.5 Multi-pass Depth Cutting

- [ ] Automatic multi-pass generation based on step-down
- [ ] Roughing pass with finishing allowance
- [ ] Finishing pass at final depth
- [ ] Lead-in/Lead-out moves for smooth entry/exit
- [ ] Ramp entry (helical descent into material)

### 9.6 Toolpath Visualization

- [ ] 3D toolpath preview
- [ ] Color-coded by operation type
- [ ] Rapid moves vs cutting moves distinction
- [ ] Tool simulation animation
- [ ] Collision detection warning

### 9.7 CAM-Specific Commands

```gcode
; Example G-code output
G21          ; Units: mm
G90          ; Absolute positioning
G17          ; XY plane selection
M03 S12000   ; Spindle on CW at 12000 RPM
G00 Z5.000   ; Rapid to safe height
G00 X10.000 Y10.000  ; Rapid to start position
G01 Z-2.000 F100     ; Plunge to depth at plunge feed
G01 X50.000 F500     ; Cut to X50 at cutting feed
G02 X70.000 Y30.000 I10.000 J0.000 F500  ; Arc CW
G00 Z5.000   ; Rapid retract
M05          ; Spindle stop
M30          ; Program end
```

---

## Current Status Summary

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Move/Delete | ✅ Complete |
| 2 | Box Selection | ✅ Complete |
| 3 | Save/Load JSON | ✅ Complete |
| 4 | DXF Import | ✅ Complete |
| 5 | Professional CAD | 🔲 Planned |
| 6 | Enterprise Features | 🔲 Planned |
| 7 | Quality & Packaging | 🔲 Planned |
| 8 | Commercial Distribution | 🔲 Planned |
| 9 | Milling / CAM | 🔲 Planned |

---

## Quick Wins (Low effort, High impact)

1. **DXF Export** - Users can export their work
2. **Keyboard shortcuts PDF** - Print-friendly reference
3. **Dark/Light theme toggle** - User preference
4. **Touch support** - Tablet users
5. **PWA manifest** - Installable web app

---

## Dependencies

```json
{
    "dependencies": {
        "dxf-parser": "^1.1.2"
    },
    "devDependencies": {
        "electron": "^28.0.0",
        "electron-builder": "^24.0.0"
    }
}
```

---

## Resources

- [dxf-parser npm](https://www.npmjs.com/package/dxf-parser)
- [DXF Reference](https://images.autodesk.com/adsk/files/autocad_2012_pdf_dxf-reference_enu.pdf)
- [Canvas Hit Testing](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Hit_regions_and_accessibility)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [PWA Documentation](https://web.dev/progressive-web-apps/)
