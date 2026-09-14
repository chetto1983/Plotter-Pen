# Handoff — Monday 2026-09-14

State at the end of Friday 2026-09-11. Goal of the current work: milling and drilling on the same S7-1500 machine, fitted with a small router for wood and PCB, with the CAM inside Plotter-Pen (no external CAD/CAM).

## Where things stand

- `main` is 4 commits ahead of `origin/main` (`00dff19`); nothing is pushed.
- The Compose container on port 41880 runs these commits and is healthy. A smoke run of 35 read-only checks matched the previous build, apart from `/health` and data changed from the UI.
- Pieces 0–3 of the CAM plan are done. Piece 4 is approved and not started.

| Commit | What |
|--------|------|
| `6e129a9` | `feat(cam)`: `cam.Chain` joins drawing primitives into closed contours |
| `cb0dfc2` | `feat(clipper)`: `clipper.OffsetContours` offsets the whole contour set as one material |
| `521b9ce` | `fix(ws)`: WebSocket disconnects no longer leave goroutines running |
| `f90de08` | `docs`: code metrics refreshed |

Earlier on Friday: `00dff19` (chord-midpoint check in `plc.FitArcsAndLines`, dead code removed, lefthook and golangci-lint set up like D:\Aura) and `97371a5` (docs corrected against the code).

## CAM plan

One piece at a time: a short design approved first, then TDD, then a check on the tree-of-life DXF.

| # | Piece | Status |
|---|-------|--------|
| 0 | Remove the tests of the deleted DXF export | Done |
| 1 | Chord-midpoint check in `FitArcsAndLines` (`internal/service/plc/fit.go`) | Done |
| 2 | Contour chaining (`internal/service/cam/chain.go`) | Done |
| 3 | Offset of the contour set (`pkg/clipper/adapter.go`, `OffsetContours`) | Done |
| 4 | First complete profile down to J/L/A commands, tried on the simulator | Done 2026-09-14 (API and settings; no UI to launch it yet) |
| 5 | Drilling of the circles in a diameter range (`internal/service/cam/drill.go`) | Done 2026-09-14 (API and settings; no UI to launch it yet) |
| — | LWPOLYLINE/POLYLINE bulges in the DXF import | In parallel, not started |

Measured on `dxf/L28YO-tree-of-life-wall-spiritual-art.dxf`:

- **Chaining:** 2167 primitives → 45 closed contours, 0 open, in about 3 ms.
- **Offsets:** zero gouge for Ø2/Ø3/Ø6 inside and outside, 56–137 ms per offset.
- **Fitted tool paths:** maximum deviation 0.011 mm at tolerance 0.01.

## Piece 4: agreed design

- **Service:** `cam.Profile(primitives, settings)` in `internal/service/cam/profile.go`.
  - Chain the contours. Stop with an error if any chain is open: an open outline has no inside or outside.
  - Offset by ±tool radius with `clipper.OffsetContours`.
  - Order the cuts: holes before outlines, so the part stays attached until the end.
  - For every ring and every depth pass: `J` to the start at safe Z, `L` plunge at plunge speed, then the contour as `L`/`A` through `plc.FitArcsAndLines`.
  - Take the `A` through point (`I`/`J`) from the source points in the middle of the fitted span. `FitSegment` has no direction, and the start/end cross product is wrong for arcs over 180°.
- **Settings: reuse what already exists** (confirmed by the user on 2026-09-11):
  - The "Parametri Simulazione PLC" dialog (`PLCSimulationSettings`, `GET/POST /api/plc/settings`, `src/app/plcSettingsUtils.js`, modal in `src/ui/modals/Modals.js`) already holds:
    - Velocità Lavoro: cutting speed;
    - Velocità Rapido: `J` moves;
    - Altezza Sicurezza: safe Z;
    - Altezza Lavoro: Z of the stock surface, where the cut starts;
    - Attesa Pen Down: pause after the plunge.

    Speeds are in mm/s, like `V`.
- **To add, and only this:**
  - Total depth, step-down and plunge speed, as new fields in the same dialog and in `PLCSimulationSettings`: they end up in the commands as Z values and `V`. `AutoMigrate` adds the columns, and a default for each keeps existing databases valid.
  - Tool diameter, side (inside/outside) and cutting direction, as inputs of the calculation chosen when the profile is launched and sent in the `/api/cam/profile` request. The PLC never receives the diameter: it only sets the offset (radius = diameter / 2), so it does not belong in the PLC settings.
  - Profiles "on the line" come later.
- **Tool library, later:** the tool library window (`toolLibraryModal` in `src/ui/modals/Modals.js`: type endmill/ballnose/V-bit, diameter, "Usa Utensile Selezionato") is HTML and CSS only. Its JavaScript (`src/cam/ToolLibraryManager.js`) went with the CAM removed in `7ad8c8f`, so nothing opens it or reads `/api/tools`. The backend `Tool` CRUD still works. Reviving it so that picking a tool fills the profile's diameter is a separate piece.
- **Z:** the passes go from Altezza Lavoro down by the step-down until it reaches Altezza Lavoro − depth; safe Z stays above, as for the pen. No fixed zero in the code.
- **Default direction** (taken from "proceed"): conventional cutting, with climb as an option. With a router spinning clockwise seen from above:
  - conventional: outlines counterclockwise, holes clockwise;
  - climb: the opposite.
- **Endpoint:** `POST /api/cam/profile`, with the same response shape as `/api/plc/extract` (`commands`, `output`, `count`), so the existing output list, 3D simulation and send can show it. The UI is a later piece: reuse the shell of the CAM removed in `7ad8c8f` (handler, UI, tests), not its geometry.
- **Simulator test:** an `s7sim`-tagged Go test.
  - It generates the profile of a test shape and sends it only to `S7SIM_ENDPOINT` (default `opc.tcp://127.0.0.1:4840`), never to the active PLC in the database.
  - It checks End_Of_File and that the final Pos X/Y/Z equals the last command.

### Piece 4 as built (2026-09-14)

- `cam.Profile` (`internal/service/cam/profile.go`), `POST /api/cam/profile` (`internal/handler/cam.go`), `TestProfileProgram_S7Sim` (`internal/service/opcua/s7sim_test.go`).
- The request is the `/api/plc/extract` request (primitives, `defaultSpeed`, `rapidSpeed`, `safeZ`, `workZ`, `waitTime`) plus `toolDiameter`, `side` (`outside`/`inside`), `direction` (`conventional` when empty, or `climb`), `depth`, `stepDown`, `plungeSpeed`. Invalid settings, open contours or a tool that fits no contour are a 400.
- Refinements of the design above:
  - **Order:** a ring is cut only after every ring inside it (containment from `clipper.Inside`), not just holes before outlines, so a part inside another part's hole is cut before that hole. Among the rings allowed next, the tool goes to the nearest one and enters it at its nearest vertex, starting from X 0 Y 0.
  - **Passes:** a ring is entered at its start for each level without going back to safe Z in between; it retracts once at the end. The program ends at X 0 Y 0 at safe Z, like the plotter programs.
  - **Inside profiles:** the direction rule is reversed, since the finished wall is then outside the ring.
  - `FitSegment` gained `MidX`/`MidY` for the `A` through point; `pkg/plc.Generator` gained `ArcThrough` and `Lines`.
- **Settings:** `depth` 1 mm, `stepDown` 0.5 mm, `plungeSpeed` 5 mm/s and `rampAngle` 3° are the column defaults, so existing databases get them. The dialog scrolls its rows when the screen is shorter than about 900 px.
- **Bounds (2026-09-14):** the step-down must be at least 0.001 mm, the PLC resolution, and depth / step-down at most 1000 passes. Drilling has the same bounds on its pecks, counting the drill point. Before, a step-down of 1e-9 made `levels()` allocate gigabytes; the same case in drilling reached 9.6 GB in a test.
- **Settings source (the user chose "tutto su DB", 2026-09-14):** the table (`/api/plc/settings`) is the only source of the PLC settings in the frontend.
  - **Before:** the saved app state (`/api/state`) also carried a `plcSettings` copy. At startup the table and the state loaded concurrently and the one that arrived last filled the inputs, so a stale copy could beat a value just saved from the dialog. Undo/redo never restored it; loading a session did.
  - **Now:** the state no longer stores the settings, and a copy in an older state is ignored. When the table arrives after the drawing has been restored, the commands are extracted again. Only the latest extraction started may show its commands, so an older one answering late cannot put stale values back.
  - **Checked in headless Chrome,** holding back the startup answers on purpose:
    - the table arriving before or after the state, and the autosaved state: failed on the previous build;
    - a stale extraction answering last: failed with the re-extraction alone, before the guard.

    All passed three times in a row on this build. Saving from the dialog and reloading, and a 199 KB state loaded through the worker, also keep the table values.
- **Measured:** on the tree-of-life DXF, 6 profiles (Ø2/Ø3/Ø6, outside and inside, 2 passes) took 85–164 ms per request, with 1014–2118 segments per pass. `/api/plc/extract` output is byte-identical to the previous build.
- **Unreachable contours:** a contour that gets no ring (a hole narrower than the tool when cutting outside, an outline narrower than the tool when cutting inside, or a hole closed by a part standing too close inside it) is still left uncut. The response lists it under `warnings` with its bounds; only a job with no ring at all is refused. Details narrower than the tool on a contour that does get a ring are not reported.
- **Measured after the ordering and warnings (2026-09-14, tree-of-life DXF):**
  - Rapid XY length went from 3768–6466 mm to 1271–1643 mm.
  - Warnings: 4, 7 and 13 holes for Ø2, Ø3 and Ø6 outside, none inside. On all 44 holes they match an independent check of whether the tool fits in each hole on its own.
  - Containment and warnings add 3–7 ms each; the Clipper offset still takes most of the 150–270 ms of a request.
- **Ramps (option 1 chosen by the user on 2026-09-14: `L` moves only).** Whether the real PLC takes an `A` with changing Z as a helix is unknown, so every `A` stays at a constant Z.
  - **Entry:** down to Altezza Lavoro the tool goes straight at the plunge speed. For each level it then ramps along the ring at the ramp angle, out for half the drop and back to the ring start, and cuts the lap from there.
  - **Speed:** the ramp runs at the cutting speed, limited so the tool never sinks faster than the plunge speed: V = min(cutting, plunge / sin angle).
  - **Tolerance:** the ramp follows the ring simplified at 0.01 mm (`clipper.SimplifyPath`, go-clipper2's `SimplifyPath64`).
  - **Straight plunges:** at 90°, and in rings shorter than the tool diameter, the tool plunges straight down.
  - **Setting:** `rampAngle` in the request, and "Angolo Rampa" (default 3°) in the dialog and in `PLCSimulationSettings`.
- **Program size with ramps, measured on the tree-of-life DXF (2 passes of 1.5 mm):**

  | Profile | 90° (no ramp) | 3°, every ring vertex | 3°, simplified at 0.01 mm |
  |---|---|---|---|
  | outside Ø2 | 4545 | 28145 | 15038 |
  | outside Ø3 | 3825 | 27740 | 12977 |
  | outside Ø6 | 2241 | 17847 | 8023 |
  | inside Ø2 | 4541 | 16275 | 11445 |
  | inside Ø3 | 3783 | 23854 | 11483 |
  | inside Ø6 | 1597 | 11933 | 5113 |

  At 3° a ramp over a 1.5 mm step is 28.6 mm long, and on these curved contours it needs about 45 segments to stay within 0.01 mm. Steeper angles or smaller step-downs shorten it. The simulator ran a ramped program (95 commands) to full depth.
- **Arduino UNO R3 shield** (`dxf/Arduino UNO R3 shield - full.dxf`, in inches: 36 circles and 9 lines, a 68.55 × 53.38 mm board), profiled with the default settings (depth 1, step 0.5, ramp 3°):
  - Outside Ø1/Ø2/Ø3 cut the outline and the 4 Ø3.175 mounting holes, and warn about the 32 Ø0.508 pin circles. With Ø3.175 the mounting holes are warned about too.
  - An independent check of all 8 programs: no gouge (closest edge r − 0.012 mm), outline and holes covered at full depth, conventional direction, rapids at safe Z, warnings exactly the circles narrower than the tool.
  - Outside Ø2 (648 commands) ran on the simulator through the app WebSocket transfer in 45.5 s.
  - Inside Ø1 cuts through the 0.9 mm bridge between the mounting holes and the board edge without a warning: the known limit on details narrower than the tool.
  - A real PCB needs a depth above its thickness: the default 1 mm does not cut through 1.6 mm FR4.

### Piece 5: drilling (2026-09-14)

Asked by the user after the Arduino pin circles came out as warnings ("guarda come fanno i CNC seri"). Based on the LinuxCNC canned cycles (G81/G82/G83/G73, G98/G99), the Fusion 360 drilling cycles (drill tip through bottom, same-diameter selection) and the PCB tools pcb2gcode (`nog81`, `min-milldrill-hole-diameter`, `drills-available`) and FlatCAM (one job per drill, drill Z past the board). The user chose the selection by diameter range and a retract plane setting.

- `cam.Drill` (`internal/service/cam/drill.go`), `POST /api/cam/drill` (`internal/handler/cam.go`), `TestDrillProgram_S7Sim`.
- **Request:** the `/api/plc/extract` settings plus `depth`, `plungeSpeed` and `retractClearance` from the table, and the drill chosen at launch: `drillDiameter`, `minHoleDiameter`/`maxHoleDiameter`, `peckDepth` (0 = one feed to the bottom), `tipAngle` (118° when 0), `tipThrough`.
- **Holes:** circle primitives only, with the diameter in the range, both ends included, widened by 1 µm so values converted from inches match. Circles whose centres are within 0.01 mm are one hole. No circle in the range is a 400.
- **Order:** nearest hole first from X 0 Y 0 (`plc.OptimizeOrder` on the centres), then 2-opt on the route back to X 0 Y 0: holes between two legs are reversed while that shortens the route. Only drilling uses it; the pen extract keeps nearest-first.
- **Cycle, G83 with G98 written as `J`/`L`/`WAIT`** (the PLC has no canned cycles, like pcb2gcode `nog81`):
  1. `J` over the hole at safe Z, `J` down to the retract plane R = work Z + `retractClearance`.
  2. Pecks counted from work Z, fed at the plunge speed. After each peck but the last: `J` out to R and `J` back down to 0.254 mm above the bottom reached (LinuxCNC's value).
  3. `WAIT` of the wait time at the bottom when above 0 (G82), then `J` to safe Z.

  The program ends at X 0 Y 0 at safe Z. Every command of a hole carries the circle id.
- **Drill point:** with `tipThrough` the bottom goes down by (D/2)/tan(angle/2), 0.300·D at 118°, so the full diameter reaches the depth. The pecks cover that length too.
- **Validation:** drill diameter > 0, 0 < min ≤ max, depth > 0, peck 0 or at least 0.001 mm, tip angle 0–180, rapid and plunge speeds > 0, safe Z above work Z, R above work Z and not above safe Z, wait ≥ 0.
- **Setting:** `retract_clearance` in `PLCSimulationSettings` (default 1 mm, so existing databases get it), "Distanza Ritorno" in the dialog. The depth and plunge speed rows now say they serve the router and the drill.
- **Not in this piece:** chip breaking (G73), a slower break-through feed, spindle speed and tool change (the PLC has neither: one program per drill), a UI to launch drilling or profiles, holes drawn as polylines or arcs. The profile still plunges from safe Z; the retract plane could serve it too.
- **Measured on the Arduino UNO shield** (local server, settings depth 2.4, plunge 3.5, R 1; independent check of every program):
  - Pins, Ø1.0 drill for 0.4–1.2 mm: 32 holes, 129 commands; with pecks of 0.8 and the tip through, 417 commands down to −2.700.
  - Mounting holes, Ø3.2 drill for 3–3.3 mm with the tip through: 4 holes down to −3.361.
  - 5–6 mm: 400, nothing to drill.
  - Simulator: the pecked pin program with a 200 ms dwell (449 commands) went through the app WebSocket transfer in 23 chunks and ran in 69.7 s down to −2.700, stopping at X 0 Y 0 Z 7.
  - Rapids with nearest-first alone: 221 mm for the pins against 207 mm in the drawing order, and 192 against 196 mm for the mounting holes. On these header rows nearest-first was 7% longer than the order the DXF already has.
  - With 2-opt added the same day: 205.1 mm for the pins (drawing order 206.7) and 192.3 mm for the mounting holes (195.6). On two rows of 4 pins with X 0 Y 0 between them, nearest-first makes 92.559 mm and 2-opt 82.806 mm, the best of all 40320 orders (`TestDrill_TakesTheShortestRouteBetweenTwoRows`).
  - Whole drilling program, route included (`BenchmarkDrill_Holes`, i7-11850H): 0.9 ms for 100 scattered holes, 100 ms for 1000, 0.91 s for 3000.

## Environment

- **Containers:** `plotter-pen` (Compose, host port 41880) and `plotter-pen-s7sim` (standalone simulator, host port 4840).
- **Active OPC UA configuration** in the Compose database: `opc.tcp://host.docker.internal:4840`, which is the simulator. Check it before any transfer.
- **Automatic PLC connect:** the frontend sends `connect` to the active PLC every time its WebSocket connects (`src/app/UIController.js:600`). Restarting the container makes open tabs reconnect and connect to whatever PLC is active.
- **Reference DXF:** `dxf/` is gitignored and exists only on this machine. To get the import JSON:
  ```bash
  curl -X POST http://localhost:41880/api/smart-import -H "Content-Type: text/plain" \
    --data-binary "@dxf/L28YO-tree-of-life-wall-spiritual-art.dxf" > tree_import.json
  ```

## Checks

```bash
env -u OPCUA_INTEGRATION go test ./...      # all tests; never set OPCUA_INTEGRATION
make quality                                 # red today because of legacy lint (see below)
golangci-lint run --new-from-rev=HEAD ./...  # what the pre-commit hook enforces

# Race detector: no 64-bit cgo toolchain on this Windows host, so run it in Docker
MSYS_NO_PATHCONV=1 docker run --rm -v "D:/Plotter-Pen:/src:ro" -w /src -e GOFLAGS=-buildvcs=false \
  -e CGO_ENABLED=1 golang:1.27 go test -race ./internal/handler/ ./internal/service/opcua/

# Transfer against the simulator (container above, or: python tools/s7sim/s7sim.py)
go test -tags=s7sim -run S7Sim -v ./internal/service/opcua/
```

Hooks: pre-commit runs gofmt, vet, golangci-lint on changed lines and the 600-line cap on new files. Pre-push runs build, compilation of the `integration`/`s7sim` tests, deadcode and eslint.

## Known issues, not fixed

- **Legacy lint:** `make lint` on the whole tree reports about 138 issues plus 17 files that gofmt would change. About 40 more files differ only in line endings (CRLF working copies, the index is LF). As a result `make quality` fails at lint.
- **Import fitter:** `fitArcsToPoints` in `internal/service/import/dxf.go` still checks only the vertices. It was left alone on purpose, so the plotter flow does not change.
- **Bulges:** they are ignored in `LWPOLYLINE`/`POLYLINE`, so arc segments arrive as straight chords. This is the parallel item of the plan.
- **Arc through point:** `arcAuxPoint` in `internal/service/plc/extractor.go` returns the arc centre when an arc has neither `throughPoint` nor `sweep`.
- **Import cache:** `SmartImportCached` keys the cache on the content only and returns the cached object without copying it.
- **Unused configuration:** `ServerConfig.OPCUAConfig` (`OPCUA_CONFIG`) is not used by anything.
- **Tiny ramp angle:** `cam.Profile` accepts any ramp angle above 0°. The ramp is (drop / tan angle) / 2 long, so an angle of 1e-9° would walk round the ring for kilometres and fill the memory. The dialog allows 0.5° at least, the API has no minimum. Found while bounding the step-down (below); not fixed.

## Working rules to keep

- Never send to the real PLC, and never run real-PLC/integration tests, without explicit authorisation. Use the simulator.
- Do not overwrite `plotter_pen.db`, `state.json`, `last_run_input.json`, machine configurations or certificates.
- Git: commit directly on `main`, no feature branches and no worktrees; commit or push only when asked.
- Reuse first; write custom code only when justified. No external CAD in the workflow.
