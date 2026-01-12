# CAM Viewer Roadmap (Cynic Edition)

## Context
We already integrated Polar3D with a backend worker that generates and parses G-code.
Reality check: the CAM path still polygonizes arcs, the UI is sloppy, and PLC logic is not reused where it should be.

## Decision (current)
- Keep `@polar3d/gcode-viewer` with branding.
- G-code is the single source of truth for CAM output.
- Heavy parsing and generation stays in the backend worker.
- Reuse PLC movement logic as a post-processor for G-code.

## Non-goals
- Rebuilding a 3D viewer from scratch.
- Shipping a full cncjs clone inside this app.
- Trusting the frontend to chew on huge toolpaths.

## Cynic risk register (read twice)
- Licensing is not a checkbox. Branding is required and can become debt.
- "3D printer" G-code assumptions will leak into CNC semantics.
- Multiple sources of truth = silent bugs. Only G-code survives.
- Editable G-code means users can break things. We must validate and fail loudly.
- Performance falls apart on large files unless we keep work in the worker.

## Roadmap

### Phase 0: Baseline sanity (done)
Deliverables:
- Polar3D viewer adapter wired into CAM preview.
- Backend worker for G-code generate + parse.
- CAMManager wired to backend for generate + preview.
Exit criteria:
- Preview renders without console errors.
- No blocking parsing on the UI thread.

### Phase 1: G-code becomes first-class
Deliverables:
- G-code editor in the CAM panel (edit, apply, revert).
- Dirty state with validation feedback (errors are visible, not hidden).
- Preview uses the edited G-code, not the stale original.
Exit criteria:
- User can safely modify output and see the updated preview.
- Invalid edits are rejected with actionable errors.

### Phase 2: PLC post-processor
Deliverables:
- G0/G1/G2/G3 mapped to PLC primitives using existing PLC movement logic.
- Backend endpoint for "post-process" output (G-code -> PLC sequence).
- Single parsing pipeline that feeds both preview and PLC.
Exit criteria:
- CAM output and PLC output derive from the same G-code.
- No duplicate geometric logic across CAM/PLC paths.

### Phase 3: UI and 3D polish
Deliverables:
- Fix missing CAM CSS variables and clean the panel layout.
- Resize-friendly preview panel (no fixed 280px jail).
- Orbit/pan controls and predictable fit-to-view behavior.
- Arc preview fidelity matches the G2/G3 intent.
Exit criteria:
- CAM UI looks intentional, not accidental.
- 3D preview is usable on both laptop and ultrawide layouts.

### Phase 4: Quality and regression hardening
Deliverables:
- G-code fixtures (line, arc, mixed) for regression tests.
- Performance guardrails (limits, throttling, and worker timeouts).
- README updates for branding, licensing, and editability.
Exit criteria:
- Repeatable results across fixtures.
- Known limitations documented, not guessed.

## Integration notes (boring but real)
- The viewer expects a container element, not a canvas.
- Keep the adapter API stable: `init(container)`, `setGCode(text)`, `resize()`, `dispose()`.
- Treat the worker as the only heavy computation path.
- Any G-code edit must re-parse in the worker and refresh the preview.

## Open questions
- Do we allow user macros or just raw G-code edits?
- How strict should validation be before allowing "Apply"?
- Is PLC post-processing optional per job, or a global default?
