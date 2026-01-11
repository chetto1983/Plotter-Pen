# Senior Dev Audit Report

## Scope And Method
- Static review of backend, frontend, tooling, and deployment files in repo root, `server`, `routes`, and `src`.
- No runtime profiling, external services, or production infrastructure validation.
- Findings focus on correctness, race conditions, dead code, duplication, and maintainability risks.

## Executive Summary
- A duplicated OPC UA/server block in `server.js` introduces redeclared constants and an undefined `opcua` reference, causing a startup failure.
- DXF import and parsing paths are inconsistent and can crash on missing data, leading to incorrect geometry or hard errors.
- UI grid snapping does not honor user spacing changes due to a property mismatch.
- Auto-save can overwrite newer state because writes are not serialized.
- Renderer caching is effectively disabled due to unstable layer settings objects.
- Several modules appear unused or duplicated, indicating unfinished refactors.

## Industrial Grade Score
Score: 4/10
- Correctness: 3/10
- Reliability: 4/10
- Security: 4/10
- Performance: 5/10
- Maintainability: 4/10
- Test Coverage: 2/10

## Findings By Severity

### Critical
1. Server startup failure due to duplicated code and undefined dependency.
   - Details: `server.js` contains a full duplicate OPC UA implementation with redeclared `const` values and references to `opcua` that is never imported. This prevents the module from parsing.
   - Files: `server.js:144`, `server.js:146`
   - Fix: Remove the duplicate block and keep the shared implementation in `server/services/opcua.js`.

### High
1. DXF spline import can throw on missing control points.
   - Details: `entity.controlPoints` is used before null checks; calling `.map` on undefined will crash.
   - Files: `src/import/DXFImporter.js:167`
   - Fix: Guard `entity.controlPoints` before mapping.

2. Grid snapping ignores UI changes.
   - Details: UI writes `gridSize` but the snap system uses `gridSpacing`, so snapping spacing never updates.
   - Files: `src/app/UIController.js:217`, `src/geometry/snap.js:54`
   - Fix: Write `this.app.snapManager.gridSpacing` in UI controller.

3. Auto-save can apply stale state.
   - Details: `triggerAutoSave` starts a new save without waiting for the previous request; out-of-order responses can overwrite newer data.
   - Files: `src/app/PersistenceManager.js:15`, `src/app/PersistenceManager.js:23`
   - Fix: Serialize saves (in-flight guard or queue) and discard stale completions.

4. DXF parsing paths yield inconsistent coordinate systems.
   - Details: `routes/dxf-parser.js` flips Y while other DXF import paths do not, producing different geometry depending on endpoint.
   - Files: `routes/dxf-parser.js:17`, `src/import/DXFImporter.js:32`, `server/workers/dxf-worker.js:22`
   - Fix: Choose a single coordinate convention and apply it consistently across all import paths.

### Medium
1. PLC optimization mutates live primitives.
   - Details: Path optimization swaps endpoints and reverses polylines in place, which can change geometry state for editing and display.
   - Files: `src/app/PLCOutputManager.js:55`, `src/plc/PathOptimizer.js:78`
   - Fix: Clone primitives before optimizing or compute a separate traversal order.

2. Renderer cache invalidated every render.
   - Details: `layerSettings` is a new object each render; reference comparison forces cache dirty on every frame, defeating caching.
   - Files: `src/main.js:195`, `src/ui/renderer.js:141`
   - Fix: Memoize layer settings or compare a stable hash.

3. OPC UA value conversion allows invalid data.
   - Details: `buildVariant` accepts NaN and `toBool` can return undefined without throwing, causing write failures later.
   - Files: `server/services/opcua.js:236`, `server/services/opcua.js:240`
   - Fix: Validate and throw on conversion failure.

### Low
1. Touch end lacks position data.
   - Details: `handleTouchEnd` calls `handleMouseUp` without client coordinates; selection box logic can read undefined positions.
   - Files: `src/app/InputHandler.js:389`
   - Fix: Carry last touch position or skip box logic for touch end.

2. Layer ID collisions possible.
   - Details: `Date.now()` is used as an ID and can collide under rapid creation.
   - Files: `src/app/LayerManager.js:58`
   - Fix: Add a counter or random suffix.

## Dead Code And Duplication
- Unused tool manager core; `ToolController` builds its own tool manager and never uses `ToolManager`.
  - Files: `src/tools/toolManagerCore.js:1`, `src/app/ToolController.js:10`
- Unused renderer method and duplicated assignments.
  - Files: `src/ui/renderer.js:51`, `src/ui/renderer.js:330`
- Unused frontend DXF worker. Backend worker handles DXF import in practice.
  - Files: `src/import/dxf-worker.js:1`, `routes/import-dxf.js:15`
- Multiple DXF parsing implementations and duplicated B-spline logic.
  - Files: `routes/dxf-parser.js:155`, `src/geometry/b-spline.js:1`, `src/import/DXFImporter.js:1`

## Performance And Scalability
- `PathOptimizer.optimizeOrder` is O(N^2) and mutates primitives; for large imports this can be slow and side-effect heavy.
- `SnapManager` intersection checks are O(N^2) but guarded at 500 primitives, which is good.
- Auto-save runs on every render cycle (debounced), which can still cause frequent writes during pointer movement.
- Renderer cache is neutralized by per-render object creation for layer settings.

## Security And Operations
- API endpoints are unauthenticated; if exposed beyond localhost, any client can read/write drawings and send OPC UA commands.
- OPC UA credentials can be stored in `opcua_config.json`. Ensure secrets are not committed and are mounted via volume.
- Docker and Compose do not mount the SQLite database path by default; data can be lost on container restart.
  - Files: `Dockerfile`, `docker-compose.yml`, `server/db.js`

## Testing And Quality
- Tests exist under `test/` but there is no npm script to run them.
- No CI configuration or lint/test pipeline in repo.
- Consider adding minimal unit tests for DXF import, snap updates, and PLC output generation.

## Recommended Fix Plan

### P0 (Stop The Bleeding)
1. Remove duplicate OPC UA/server block in `server.js` and rely on `server/services/opcua.js`.
2. Guard DXF spline parsing against missing `controlPoints`.
3. Fix grid snapping (`gridSpacing`) and add save serialization in `PersistenceManager`.

### P1 (Correctness And Consistency)
1. Unify DXF parsing conventions across routes/import/worker.
2. Make `PathOptimizer` operate on cloned data or return an ordering only.
3. Validate OPC UA value conversions and NodeId parsing errors with clear responses.

### P2 (Maintainability And Performance)
1. Restore renderer caching by using stable layer settings.
2. Remove unused modules or wire them properly (`ToolManagerCore`, `src/import/dxf-worker.js`).
3. Add basic test scripts and minimal CI checks.

## Closing Notes
The codebase shows strong domain knowledge and useful CAD features, but the current startup failure and several consistency issues block industrial-grade reliability. Fixing the critical startup issue, unifying DXF paths, and stabilizing state handling will yield the biggest quality gains with minimal scope.
