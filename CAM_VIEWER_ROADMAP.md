# CAM Viewer Roadmap (Cynic Edition)

## Context
You want a drop-in 3D G-code viewer, Three.js is acceptable, and visible branding is acceptable.
Reality check: there is no true drop-in viewer for your stack or for pen-plotter semantics. You will still do integration work.

## Decision (for now)
Use `@polar3d/gcode-viewer` because it is the only actively maintained, feature-complete viewer that is close to "component-like".
Hard constraint: it requires visible "Powered by Polar3D" branding and a custom license. You already said this is OK.

## Non-goals
- Rebuilding a 3D viewer from scratch.
- Porting a full app like cncjs or gcoder into this codebase.
- Pretending a 3D printer viewer perfectly fits a CNC/plotter toolpath model.

## Cynic risk register (read this twice)
- Licensing is not a checkbox. The library enforces branding. If legal changes their mind later, this becomes debt.
- Your G-code is not 3D printing G-code. Expect mismatches (metadata, extrusion semantics, layer logic).
- "Drop-in" is marketing, not engineering. You still need wrapper code, resize logic, and UX decisions.
- Three.js increases payload size and complexity. This is fine only if you accept the cost.
- The viewer is fast until you throw a large file at it. Then you pay in memory and UI jank.

## Roadmap

### Phase 0: Legal and UX gate
Deliverables:
- Confirm license acceptance in writing (visible branding stays).
- Decide branding location (CAM preview corner, footer, or ribbon).
Exit criteria:
- Brand placement approved by product/legal.

### Phase 1: POC integration (vertical slice)
Deliverables:
- Add Three.js and `@polar3d/gcode-viewer` to `package.json`.
- Add a thin adapter module, e.g. `src/cam/Polar3DViewerAdapter.js`.
- Initialize the viewer inside the CAM Preview panel using the existing `camPreviewCanvas` container or a new container element.
- Load and render a small G-code sample from CAMManager.
Exit criteria:
- Viewer renders and re-renders on G-code updates without console errors.
- Branding is visible and not hidden by CSS.

### Phase 2: Replace current preview path
Deliverables:
- Replace `SimpleGCodeViewer` usage in `src/cam/CAMManager.js`.
- Use a ResizeObserver to reflow the viewer when the preview sub-tab becomes visible.
- Ensure `G90` (absolute) and `G21` (mm) are present in generated G-code, or explicitly configure the viewer if it assumes defaults.
Exit criteria:
- Preview works for profile and pocket operations.
- Preview updates correctly after switching tabs.

### Phase 3: UI and UX hardening
Deliverables:
- Add "Performance" toggle for heavy files (reduce quality, hide travel moves).
- Progress indicator while parsing.
- Guard against rendering when the CAM tab is hidden (avoid wasted work).
Exit criteria:
- No visible UI stutter on typical files.
- User can understand when the viewer is loading vs. broken.

### Phase 4: Validation and docs
Deliverables:
- Add G-code fixtures for regression testing (simple line, arc, pocket, mixed).
- Document known limitations (e.g., extrusion metadata ignored, layer logic adapted).
- Update README to note branding and licensing.
Exit criteria:
- Reproducible preview output for fixed samples.
- Docs include the licensing constraint and branding requirement.

## Integration notes (boring but real)
- Prefer lazy-loading the viewer module only when CAM tab is opened.
- The viewer expects a container, not a canvas. Plan to replace the canvas or wrap it.
- Keep the adapter API stable: `init(container)`, `setGCode(text)`, `resize()`, `dispose()`.
- Do not block the UI thread on large parsing jobs; consider a worker later.

## Alternatives (why not)
- cncjs: full app, heavy UI, not a component. Extracting a viewer is a project.
- aligator/gcode-viewer: MIT but embeds three.js and is pre-1.0 with no guarantees.
- react-gcode-viewer: React-only and stale. Not worth bending your stack.
- gcoder: good UX ideas, but not a reusable library.

## Open questions
- Do we need layer slicing controls or just a static preview?
- Do we need travel moves visible for debugging?
- Is the branding acceptable in all distributions, including customer deployments?
