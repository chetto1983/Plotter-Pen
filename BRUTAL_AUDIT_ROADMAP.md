# Brutal Audit and Refactor Roadmap

## Scope
- Scanned: `server.js`, `plotter_pen.html`, `plc_config.html`, `style.css`, `src/**`, `test/**`, `debug_spline.mjs`, `opcua_config.json`, `package.json`.
- No runtime tests executed.

## Critical breakages (blocking)
1. ArcBuilder parse error was blocking module load. Stray string literals after a commented log block caused a syntax error.
   - Evidence: `src/geometry/arcBuilder.js:33`, `src/geometry/arcBuilder.js:34`, `src/geometry/arcBuilder.js:35`, `src/geometry/arcBuilder.js:36`.
   - Status: fixed by removing the stray literals in `src/geometry/arcBuilder.js`.
2. Renderer contract mismatch: `CADApplication` converts primitives to render-format objects, but `CanvasRenderer` expects real primitive instances.
   - The renderer dereferences circle internals (`p.center`, `p._radius`) that do not exist on render-format objects.
     - Evidence: `src/ui/renderer.js:320`, `src/main.js:982`, `src/main.js:1013`.
   - Selection/hover highlighting uses identity checks against `CanvasRenderer` sets, but the app passes freshly created render objects.
     - Evidence: `src/ui/renderer.js:231`, `src/ui/renderer.js:232`, `src/main.js:229`, `src/main.js:982`.
   - Previews for arc/circle/polygon are structurally incompatible with `_drawPrimitive`, so preview rendering is broken.
     - Evidence: `src/main.js:987`, `src/main.js:1058`, `src/ui/renderer.js:320`.
3. SnapManager method override: `findIntersections` is defined twice. The later definition overrides the earlier per-pair version, so `addIntersectionAnchors` calls the wrong method and recomputes all pairs for each pair.
   - Evidence: `src/geometry/snap.js:139`, `src/geometry/snap.js:155`, `src/geometry/snap.js:513`.

## Major defects
1. PLC simulation cannot parse the generated command format.
   - Z up/down handling expects commands starting with `U` or `D`, but output is `Z_UP`/`Z_DW`.
     - Evidence: `src/ui/renderer.js:547`, `src/ui/renderer.js:548`, `src/plc/extraction.js:586`, `src/plc/extraction.js:602`.
   - Coordinate parser regex does not accept the spaces emitted in `J X ...` / `L X ...` / `A X ...`.
     - Evidence: `src/ui/renderer.js:736`, `src/ui/renderer.js:737`, `src/plc/extraction.js:594`, `src/plc/extraction.js:648`, `src/plc/extraction.js:688`.
2. Grid and snap spacing are out of sync and cannot be updated from the UI.
   - UI writes `snapManager.gridSize` but SnapManager uses `gridSpacing`.
     - Evidence: `src/app/UIController.js:254`, `src/main.js:926`.
   - Renderer uses fixed grid spacing (10/100) and ignores `gridSpacing`.
     - Evidence: `src/ui/renderer.js:274`, `src/ui/renderer.js:275`.
3. File load/reset logic corrupts undo/redo history and duplicates logic.
   - FileManager resets nonexistent `history`/`historyIndex` instead of `undoStack`/`redoStack`.
     - Evidence: `src/app/FileManager.js:212`, `src/app/FileManager.js:213`.
   - FileManager has a separate load pipeline rather than using `CADApplication.loadDrawingData`.
     - Evidence: `src/app/FileManager.js:176`, `src/app/FileManager.js:185`, `src/main.js:902`.
4. DXF import pushes undo state after mutation, so undo cannot revert the pre-import state.
   - Evidence: `src/app/FileManager.js:164`.
5. Config UI exposes unsupported value types; server only supports string arrays plus scalar types.
   - Evidence: `plc_config.html:128`, `plc_config.html:129`, `plc_config.html:130`, `server.js:32`, `server.js:423`.

## Structural debt / dead code
1. `ToolManager` class is defined but never used; only the tool classes are instantiated directly.
   - Evidence: `src/tools/toolManager.js:598`, `src/main.js:254`.
2. `src/ui/icons.js` is never imported or referenced.
3. `src/navigation.js` expects `hamburgerButton` and `appNav`, but the HTML uses `menuBtn` and `mainNav`, so the navigation helper is effectively dead.
   - Evidence: `src/navigation.js:5`, `src/navigation.js:6`, `plotter_pen.html:14`, `plotter_pen.html:22`, `plc_config.html:13`, `plc_config.html:21`, `src/plc-config.js:1`, `src/plc-config.js:196`.
4. Static server exposes the entire project root (including `node_modules`) to the browser because the UI loads `dxf-parser` directly from `node_modules`.
   - Evidence: `server.js:933`, `plotter_pen.html:8`.

## Refactor roadmap

### Phase 0 - Main.js recovery (start here)
1. Lock the render contract and delete the conversion layer.
   - Target: `CADApplication.render()` passes real primitives to `CanvasRenderer`.
   - Remove `toRenderFormat()` and `previewToRenderFormat()` from `src/main.js`.
   - Make `CanvasRenderer._drawPrimitive()` accept the preview shape format from tools.
2. Align selection/hover identity.
   - Target: `CanvasRenderer` references the same primitive instances stored in `CADApplication.primitives`.
   - Remove `renderer.setHovered(found ? this.toRenderFormat(found) : null)` and use raw primitives.
3. Establish a single render entry point.
   - Target: only `CADApplication.render()` triggers `CanvasRenderer.render()` and is the only place that mutates `renderer.primitives`, `renderer.preview`, and `renderer.highlightedPrimitive`.
4. Browser validation (manual, no guesswork):
   - Draw line, arc, circle, rectangle, polygon.
   - Confirm preview appears during draw.
   - Select, hover, delete; check visual feedback and status text.
   - Run on fresh reload to confirm no console errors.

### Phase 0A - Main.js split plan (reusable modules)
1. Extract `CADApplication` orchestration into `src/app/CADApplication.js`.
2. Extract selection logic:
   - File: `src/app/SelectionManager.js`.
   - Owns: `selectedPrimitives`, `hoveredPrimitive`, `handleSelection`, `updateHover`, `boxSelect`.
3. Extract workspace/grid/snap logic:
   - File: `src/app/WorkspaceManager.js`.
   - Owns: workspace size, grid spacing, snap toggles, `getSnappedPosition`.
4. Extract rendering bridge:
   - File: `src/app/RenderCoordinator.js`.
   - Owns: `render()`, `preview` binding, highlight binding, snap indicator rendering.
5. Extract PLC output:
   - File: `src/app/PLCOutputManager.js`.
   - Owns: `extractPLC`, `refreshPLCOutput`, `copyOutput`, `downloadOutput`, `sendToPLC`.
6. Extract clipboard actions:
   - File: `src/app/ClipboardManager.js`.
   - Owns: `copySelected`, `cutSelected`, `pasteClipboard`.
7. Validation after each extraction:
   - Reload browser and re-run the manual checks from Phase 0.

### Phase 1 - Snap and grid correctness
1. Remove the duplicate `findIntersections` and consolidate intersection helpers.
2. Restore rectangle/polygon intersection logic inside the active code path.
3. Wire UI grid spacing to `SnapManager.gridSpacing` and renderer grid spacing.
4. Add a small test harness for snap points and intersections.

### Phase 2 - PLC simulation and command model
1. Define a single internal command model (structured object with `type`, `x`, `y`, `auxX`, `auxY`, `z`).
2. Update the simulator to consume the structured model, not string parsing.
3. Keep string formatting in one place (PLC output) and parsing in one place (if still needed).
4. Add tests around PLCOutputGenerator + simulation path stepping.

### Phase 3 - File IO and state consistency
1. Use `CADApplication.loadDrawingData` as the only path for JSON load.
2. Add `StateManager.clearHistory()` and call it after a full load.
3. Push undo state before DXF import mutation.
4. Add load/save tests that verify undo/redo stacks are sane.

### Phase 4 - UI and navigation cleanup
1. Remove `navigation.js` or update HTML to match its IDs and remove duplicate menu toggle code.
2. Either use `icons.js` for all buttons or remove it.
3. Remove or integrate `ToolManager` class; keep only one tool orchestration pattern.

### Phase 5 - Backend/config alignment
1. Align `valueType` options between UI and server:
   - Either remove unsupported options from the UI, or implement array support in the server.
2. Align default values in `server.js` and `opcua_config.json`.
3. Serve only required static assets (or bundle `dxf-parser`) instead of exposing `node_modules`.

## Test gaps
- No test script is wired in `package.json`.
- Existing tests are standalone scripts under `test/` and are not runnable via `npm test`.
- Add a minimal runner (Node built-in test runner or a simple script) and gate the core geometry + PLC output behavior.
