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
| 4 | First complete profile down to J/L/A commands, tried on the simulator | Done 2026-09-14 |
| 5 | Drilling of the circles in a diameter range (`internal/service/cam/drill.go`) | Done 2026-09-14 |
| 6 | Operation selector in the PLC output panel: pen, profile or drilling (`src/app/CAMOperationManager.js`) | Done 2026-09-14 |
| 7 | Piece thickness: work Z is the bed, cuts through or to a depth (`internal/service/cam/stock.go`) | Done 2026-09-14 |
| — | LWPOLYLINE/POLYLINE bulges in the DXF import, with a new DXF reader | Done 2026-09-15 |
| — | Drilling of round holes drawn as arcs, polygons or lines (`internal/service/cam/holes.go`) | Done 2026-09-15 |
| — | OPC UA nodes addressed by the names of the PLC variables (`internal/service/opcua/nodes.go`) | Done 2026-09-16 |
| — | Variables read from the PLC, chosen from a combo box, with a connection test | Done 2026-09-16 |
| — | Tool library opened from the CAM panel, its diameter into the operation | Done 2026-09-16 |

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
- **Z:** the passes go from Altezza Lavoro down by the step-down until it reaches Altezza Lavoro − depth; safe Z stays above, as for the pen. No fixed zero in the code. Replaced by piece 7: Altezza Lavoro is now the bed and the passes start from the top of the piece.
- **Default direction** (taken from "proceed"): conventional cutting, with climb as an option. With a router spinning clockwise seen from above:
  - conventional: outlines counterclockwise, holes clockwise;
  - climb: the opposite.
- **Endpoint:** `POST /api/cam/profile`, with the same response shape as `/api/plc/extract` (`commands`, `output`, `count`), so the existing output list, 3D simulation and send can show it. The UI is a later piece: reuse the shell of the CAM removed in `7ad8c8f` (handler, UI, tests), not its geometry.
- **Simulator test:** an `s7sim`-tagged Go test.
  - It generates the profile of a test shape and sends it only to `S7SIM_ENDPOINT` (default `opc.tcp://127.0.0.1:4840`), never to the active PLC in the database.
  - It checks EndOfFile and that the final Pos X/Y/Z equals the last command.

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
- **Holes:** circle primitives only (round contours too since 2026-09-15, see "Round holes" below), with the diameter in the range, both ends included, widened by 1 µm so values converted from inches match. Circles whose centres are within 0.01 mm are one hole. No circle in the range is a 400.
- **Order:** nearest hole first from X 0 Y 0 (`plc.OptimizeOrder` on the centres), then 2-opt on the route back to X 0 Y 0: holes between two legs are reversed while that shortens the route. Only drilling uses it; the pen extract keeps nearest-first.
- **Cycle, G83 with G98 written as `J`/`L`/`WAIT`** (the PLC has no canned cycles, like pcb2gcode `nog81`). Since piece 7, R and the pecks count from the top of the piece instead of work Z:
  1. `J` over the hole at safe Z, `J` down to the retract plane R = work Z + `retractClearance`.
  2. Pecks counted from work Z, fed at the plunge speed. After each peck but the last: `J` out to R and `J` back down to 0.254 mm above the bottom reached (LinuxCNC's value).
  3. `WAIT` of the wait time at the bottom when above 0 (G82), then `J` to safe Z.

  The program ends at X 0 Y 0 at safe Z. Every command of a hole carries the circle id.
- **Drill point:** with `tipThrough` the bottom goes down by (D/2)/tan(angle/2), 0.300·D at 118°, so the full diameter reaches the depth. The pecks cover that length too.
- **Validation:** drill diameter > 0, 0 < min ≤ max, depth > 0, peck 0 or at least 0.001 mm, tip angle 0–180, rapid and plunge speeds > 0, safe Z above work Z, R above work Z and not above safe Z, wait ≥ 0.
- **Setting:** `retract_clearance` in `PLCSimulationSettings` (default 1 mm, so existing databases get it), "Distanza Ritorno" in the dialog. The depth and plunge speed rows now say they serve the router and the drill.
- **Not in this piece:** chip breaking (G73), a slower break-through feed, spindle speed and tool change (the PLC has neither: one program per drill), holes that are not circles (done on 2026-09-15, see "Round holes" below). The profile still plunges from safe Z; the retract plane could serve it too.
- **Measured on the Arduino UNO shield** (local server, settings depth 2.4, plunge 3.5, R 1; independent check of every program):
  - Pins, Ø1.0 drill for 0.4–1.2 mm: 32 holes, 129 commands; with pecks of 0.8 and the tip through, 417 commands down to −2.700.
  - Mounting holes, Ø3.2 drill for 3–3.3 mm with the tip through: 4 holes down to −3.361.
  - 5–6 mm: 400, nothing to drill.
  - Simulator: the pecked pin program with a 200 ms dwell (449 commands) went through the app WebSocket transfer in 23 chunks and ran in 69.7 s down to −2.700, stopping at X 0 Y 0 Z 7.
  - Rapids with nearest-first alone: 221 mm for the pins against 207 mm in the drawing order, and 192 against 196 mm for the mounting holes. On these header rows nearest-first was 7% longer than the order the DXF already has.
  - With 2-opt added the same day: 205.1 mm for the pins (drawing order 206.7) and 192.3 mm for the mounting holes (195.6). On two rows of 4 pins with X 0 Y 0 between them, nearest-first makes 92.559 mm and 2-opt 82.806 mm, the best of all 40320 orders (`TestDrill_TakesTheShortestRouteBetweenTwoRows`).
  - Whole drilling program, route included (`BenchmarkDrill_Holes`, i7-11850H): 0.9 ms for 100 scattered holes, 100 ms for 1000, 0.91 s for 3000.

### Piece 6: operation selector (2026-09-14)

The user asked for the interface and chose: one active operation, on the whole drawing, saved in the database.

- **Panel:** at the top of "Output PLC", the tabs Penna | Profilo | Foratura and the parameters of the active one.
  - Profilo: Fresa Ø, Lato (Esterno/Interno), Verso (Discorde = conventional, Concorde = climb).
  - Foratura: Punta Ø, Scarico, Angolo, Fori da Ø … a Ø, Passante.
  - Penna has no parameters: its settings stay in the "Parametri Simulazione PLC" dialog.
- **Program:** `extractPLC` (`src/app/PLCOutputManager.js`) generates the active operation through `/api/plc/extract`, `/api/cam/profile` or `/api/cam/drill`, with the settings table and the operation parameters. It runs whenever it ran before (drawing, settings, undo, session load) and when a parameter changes; the latest generation started wins.
  - An error (400) shows above the list, and the output is emptied so that Simula, Copia, Scarica and Invia cannot use a program that no longer matches the parameters.
  - Profile warnings show as a closed summary ("32 contorni non raggiungibili con Ø2 mm") that opens on the list.
  - The list, the highlight on the drawing (drilling commands carry the circle), the 3D view and the transfer are unchanged.
- **Saved:** `CAMOperation` singleton (`GET/POST /api/cam/operation`, `internal/handler/cam_operation.go`), defaults pen, Ø2 outside conventional, drill Ø1 for 0.4–1.2 mm, no pecks, 118°, not through. The POST refuses unknown operation, side or direction; the numbers are checked when the program is generated.
- **Checked in headless Chrome** on the Arduino UNO shield (local server, simulator as the active PLC):
  - The pen program is the same as `/api/plc/extract`.
  - Foratura drills the 32 pin circles; 5–6 mm shows the error and empties the output; pecks with the tip through reach −1.300.
  - Profilo shows the 32 warnings; the operation and all parameters come back after a reload.
  - Deleting a pin circle regenerates 31 holes, undo brings back 32.
  - "PLC" in the ribbon sent the 257-command drilling program, which ran to its end on the simulator in 34.8 s.
  - No page errors. At 1280×720 the parameters take 154–173 px and the command list keeps about 190 px.
- **Limits:**
  - The error texts come from the API in English, after an Italian prefix.
  - The operation works on the whole drawing only.
  - Firefox 78 is left to the Babel build and was not measured.
  - A fresh database has the real PLC (192.168.0.1) as the active configuration. For a browser check, point it at the simulator before opening a page; since 2026-09-16 the nodes are addressed by name and the same names fit both.

### Piece 7: piece thickness (2026-09-14)

The user noticed the piece thickness was missing. They chose work Z on the bed and, per operation, a cut through the piece or to a depth.

- **Z:** Altezza Lavoro is the bed, as the paper is for the pen; the pen does not change.
  - The top of the piece is work Z + thickness.
  - Through: the bottom is work Z − overcut, whatever the actual thickness. Otherwise it is the depth below the top, at most the thickness.
  - Profile passes and ramps start from the top of the piece. The drilling retract plane is top + `retractClearance`, the pecks count from the top, and the drill point adds below the bottom.
- **API:** `cam.Stock` (`internal/service/cam/stock.go`) is embedded in `ProfileRequest` and `DrillRequest`, and replaces their `depth`. The requests carry `thickness`, `overcut`, `through` and `depth` (from the top, used only without `through`).
  - Validation: thickness > 0, overcut ≥ 0, depth in (0, thickness] unless through, safe Z above the top of the piece, and R not above safe Z.
- **Saved:** in `CAMOperation`:
  - `thickness` 1.6 and `overcut` 0.2, shared by profile and drilling;
  - `profileThrough`/`profileDepth` and `drillThrough`/`drillDepth`, true and 1 mm.

  The column defaults fill existing rows. `depth` left `PLCSimulationSettings`, the API and the dialog; old databases keep an unread column.
- **Panel:** Profilo and Foratura show one piece row: Spessore | Sfondamento | Passante. Without Passante, Profondità of that operation takes the place of Sfondamento. The drilling "Passante" became "Compensa punta".
  - Dialog descriptions: Altezza Lavoro "Penna: carta; fresa e punta: piano", Distanza Ritorno "Foratura: sopra il pezzo".
- **Checked:**
  - Go tests. The simulator ran the profile through a 0.8 mm piece (95 commands) down to −0.200, and the pecked drilling through 1.6 mm with the point (23 commands) down to −0.500.
  - The browser database of piece 6 migrated with its operation kept and the new defaults.
  - **Headless Chrome, Arduino UNO shield, bed at Z 0** (14 checks, all passed):
    - drilling through: R 2.600, bottom −0.200; with the point, −0.500; 1 mm deep, 0.600;
    - a depth of 2 and an 18 mm piece under a 5 mm safe Z show the error and empty the output;
    - each operation keeps its own Passante and depth, after a reload too;
    - "PLC" in the ribbon sent the 353-command drilling, which ran to its end on the simulator in 46.0 s;
    - no page errors.
  - **Layout:** at 1280×720 the parameters take 228–231 px and the command list keeps about 133 px (190 px before). At 1600×1000 the list keeps 423–442 px. No field is cut off; "Compensa punta" wraps on two lines. The parameters can be collapsed since the follow-ups below.
- **Limits:**
  - A work Z calibrated on the top of a piece now means the bed: the cut goes shallower, not deeper, but work Z must be set on the bed before cutting on the machine.
  - The 3D view does not draw the piece.
  - Firefox 78 was not measured.

### Follow-ups of piece 7

- **3D view above pixel ratio 1** (`b4f0d2c`): `renderFrame` gave `setViewport` the drawing buffer size, which three.js scales by the pixel ratio again. At ratio 1.5 the scene was enlarged and off-centre and the ViewCube was drawn past the canvas. It now uses `renderer.getSize()`, in CSS pixels. Checked in headless Chrome at device scale factors 1 and 1.5: viewport, cube pixels, click on the cube, simulation.
- **Ramp laps** (2026-09-15, bound chosen by the user): a ramp, out and back, may go round its ring at most 1000 times (`maxRampLaps`). Beyond that the profile is a 400 naming the ring, the angle and the laps. A 1e-9° ramp on a 20 mm square is refused in 83 ms; 900 laps are still cut. Real ramps stay far below: a smallest ring (the tool diameter) with a step of twice the diameter at 0.5° takes about 230 laps.
- **Collapsible parameters** (2026-09-15, chosen by the user): a toggle next to the tabs of Profilo and Foratura hides the parameters and leaves one summary line, touched to open them again. The state is remembered in the browser (`camParamsCollapsed`); Penna has no toggle.
  - Summaries: "Ø2 · Esterno · Discorde · 1,6 mm passante", "Ø1 · fori 0,4–1,2 · 1,6 mm prof. 1".
  - At 1280×720 the command list goes from 136 to 212 px for the profile (two rows) and from 133 to 265 px for the drilling (three rows).
  - Checked in headless Chrome: toggle, summaries, heights, reload, reopening, no page errors.
- **Scale buttons of the edit toolbar** (2026-09-15): "Riduci" showed the plus magnifier of "Ingrandisci"; it now has the minus one, and both have a title.
- **Output PLC header below 1400 px** (2026-09-15): the right panel is 25vw wide, so between 1280 and 1399 px it is narrower than the header. At 1280 px the title (95 px at least) and the five 36 px buttons needed 299 px in 269, and "Scarica" went 5 px past the screen with the panel scrolling sideways. In that range the title icon is hidden and the buttons are 34 px with 2 px gaps (`src/styles/layout.css`). Checked in headless Chrome from 1280 to 1920 px: no sideways scroll, all buttons inside, at least 34 px, title shown.

### DXF bulges and a new DXF reader (2026-09-15)

First sub-piece of the missing CAM functions. The user chose lines and arcs for the bulge segments and one circle for a closed polyline that goes round one circle.

- **Why the reader changed:** the tests showed that `yofu/dxf`, already at its latest version (2025-08-06), cannot be fixed from outside:
  - it stores each LWPOLYLINE bulge one vertex late;
  - it refuses the whole file when the last vertex has a bulge, the usual closing corner of a rounded outline;
  - it does not parse POLYLINE at all;
  - it refuses the whole file at any entity it does not know (MTEXT, INSERT, HATCH, ELLIPSE, DIMENSION, SOLID), and panics on a binary DXF.

  Its forks (edanko, scantrust, duswie, flywave) carry the same code.
- **Candidates tried** on ezdxf 1.4.4 samples (R12, R2000, R2018, CRLF, binary, malformed) and the two DXFs of `dxf/`:
  - `ixmilia/dxf-go` does not compile as a module: its generated code is not committed.
  - `daidai-ok/dxfconv` fails on every real file, reading hex handles as numbers.
  - `rpaloschi/dxf-go` (2017) panics on the R2018 sample.
  - The user chose `whutwxn/dxf-go` (fork, 2023-12, Apache-2.0). It reads bulges on the right vertex, POLYLINE/VERTEX, extrusion, `$INSUNITS`, layers, blocks, ELLIPSE and MTEXT, and skips what it does not know. Its 45 tree-of-life splines are identical to yofu's.
- **`internal/service/import/reader.go`** (not `dxfread.go`: `*DXF*` in `.gitignore` ignores any file with "dxf" in its name on this case-insensitive checkout) wraps the reader where it is too lenient for an import:
  - a binary DXF is refused;
  - the reader's own tags must reach the ENDSEC of ENTITIES: it stops silently at a line that is not a group code, which would drop the rest of the drawing;
  - every LWPOLYLINE must write the vertices it declares: it fills missing ones with (0, 0), and panics on extra ones;
  - a panic becomes an error;
  - its stderr log is silenced.
- **`internal/service/import/bulge.go`:** a polyline without bulges stays one polyline or polygon, as before.
  - With bulges, each segment becomes a line or an arc through the point the bulge gives, including the closing segment of a closed polyline.
  - A bulge that lifts the arc less than 1e-6 mm gives a line, and coincident vertices are skipped.
  - A closed polyline whose arcs share one centre and radius within 0.001 mm, turn the same way and go once round is one circle, so Foratura finds holes drawn that way.
  - POLYLINE meshes are skipped, and spline-fit frame vertices are left out.
- **Stats:** `stats.skipped` counts by type the entities that gave no primitive, e.g. `{"INSERT": 1, "TEXT": 1}`. The page does not show it yet.
- **Layers:** an entity without group code 8 is on layer `0`, as before. A layer name missing from the TABLES section is now kept; yofu turned it into `0`.
- **Checked:**
  - Go tests: rounded rectangle, bulge sign and size, arcs over 180°, polylines of one circle, POLYLINE, degenerate segments, skipped entities, refused files. `go test ./...`, vet, lint on the changed lines, deadcode.
  - Before and after on the two DXFs of `dxf/` and two ezdxf samples of lines, arcs, circles, polylines and splines in mm and inches: identical primitives. The only difference is `stats.skipped` (TEXT and POINT).
  - Headless Chrome, local server, simulator as the active PLC, on a 60×40 mm board with 3 mm rounded corners, a slot and 9 holes of three kinds:
    - smart-import gives 6 lines, 6 arcs and 9 circles, and skips TEXT and INSERT;
    - Profilo with Ø2 writes 28 `A` commands and warns only the 9 holes narrower than the tool, with no open contour;
    - Foratura drills all 9 holes;
    - the zoomed drawing shows the rounded corners and the slot ends;
    - no page errors.
- **Limits:**
  - An extrusion of (0, 0, −1) (mirrored OCS) is still ignored, as for the other entities.
  - INSERT blocks are not expanded.
  - The reader turns a malformed number into 0 without an error.
  - The reader is no longer maintained.

### Round holes drawn as arcs, polygons or lines (2026-09-15)

Second sub-piece: drilling found circles only. The user chose to drill everything round, and to warn about closed shapes of hole size that are not round.

- **Holes** (`internal/service/cam/holes.go`):
  - circles as before;
  - then the closed contours that `cam.Chain` makes of the other primitives, when they are round: a least-squares circle (Kåsa) fitted to the vertices, with every vertex and the middle of every side within 0.02 mm of it;
  - the middles keep regular polygons out: a 24-gon of 3 mm sags 0.013 mm and passes, a 16-gon 0.029 mm and a hexagon do not;
  - the diameter range and the one-hole-per-centre rule are those of the circles, circles first. A round contour commands name its first primitive, from the new `Contours.ClosedIDs`.
- **Not round:** a closed contour whose bounding box has its shorter side in the range, such as a 3×1 slot or a 1 mm square, is not drilled and comes back in `warnings` ("the closed contour from … to … is not round: it is not drilled, cut it with a profile"). The panel sums them up as "N contorni non tondi non forati: usare Profilo". With no round hole at all the 400 also says how many were left out.
- **API:** `cam.Drill` returns `DrillResponse` (`/api/plc/extract` shape plus `warnings`). A non-circle primitive with missing data is now a 400, as in the profile; before, drilling ignored it.
- **Checked:**
  - Go tests: two and four ARCs, a 24-gon, a closed 32-sided polyline, 24 separate lines, a 16-gon of 3 mm, a hexagon, a square, a slot, the board outline, a circle over a polygon, the error, the contour ids.
  - Headless Chrome, local server, simulator as the active PLC, on a DXF with a 1 mm hole drawn as two ARCs, a 32-gon, 24 LINEs and a CIRCLE, a 3×1 slot and a 1 mm square:
    - Foratura drills the 4 holes, and all 20 of their commands name a drawing primitive (arc, polygon, line, circle);
    - the slot and the square are warned under "2 contorni non tondi non forati: usare Profilo";
    - Profilo keeps its own summary;
    - no page errors.
- **Limits:** a shape made of pieces that `cam.Chain` cannot close (a gap over 0.01 mm, three ends at one point) is neither drilled nor warned. The warning list, when opened, pushes the command list down as the profile one does.

### The PLC variables by name (2026-09-16)

The user asked to simplify the node configuration with the names of the variables. The nodes
were twelve hand-written node IDs (`ns=4;i=93`…), and the numbers behind them change with the
PLC program: what the app really needs is the names.

- **Addresses** (`internal/service/opcua/nodes.go`): a node field takes either a node ID, as
  before, or a path of browse names such as `ServerInterfaces/Com/Point`. The prefix decides
  (`ns=`, `nsu=`, `i=`, `s=`, `g=`, `b=`): `ua.ParseNodeID` accepts anything else as a string
  node ID of namespace 0 and would swallow a path.
- **Resolution:** the path is followed from the Objects folder with `Node.References` of
  gopcua, one browse per name, matching the browse name and ignoring its namespace index,
  which is what changes from server to server. The result is cached per connection
  (`nodeCache`, cleared on connect and disconnect) and resolved before taking the client
  lock, because browsing takes the read lock itself. Errors name the step: `node address
  "ServerInterfaces/Com/PointArr": Com has no "PointArr", only Point, TriggerWrite, …`.
- **Existing databases:** at load, a node still carrying the node ID the app shipped with is
  replaced by the name of the variable it was meant to reach (`namedNodes`). A node ID
  somebody chose is left alone.
- **What the PLC really exposes**, read from 192.168.0.1 on 2026-09-16 (browse and read only):

  ```
  Objects/ServerInterfaces (ns=3)/Com (ns=4;i=1)
      Point        ns=4;i=12   String[20]
      TriggerWrite ns=4;i=43   Bool
      ReadDone     ns=4;i=54   Bool
      EndOfFile    ns=4;i=65   Bool
      Pos/X,Y,Z    ns=4;i=79,80,81   Float
  ```

  The export the app was built on (`docs/OPC Ua Interface.xml`, since replaced by
  `docs/interface.xml`) said `Comm`, `PointArr`, `Trigger_read_done`, `End_Of_File` with
  `i=93/12/23/34`, names and numbers that are not on the machine any more. **The defaults the app shipped with pointed at nodes the PLC does not
  have** (`ns=4;i=93`), so the names also repair them. `tools/s7sim` already used the true
  numbers and now carries the true names too, under `ServerInterfaces/Com`.
- **Connecting to the PLC:** it offers only `Basic256Sha256` with `Sign` or `SignAndEncrypt`,
  no `None` endpoint, and it accepted a self-signed client certificate carrying the
  application URI `urn:plotter-pen-client` — the one `internal/service/opcua/cert.go`
  generates. Anonymous user token.
- **Checked:**
  - Go tests on the resolver with a stub server: a node ID passes untouched and browses
    nothing, the PLC tree and a server with the same names on other numbers both resolve, a
    nested object, spaces around the names, an unknown name, an empty address, a malformed
    node ID, and the cache (one browse per name, again after `clear`).
  - `go test -tags=s7sim -run S7Sim`: five tests including `TestNamedNodes_S7Sim`, a whole
    chunked transfer configured with names only.
  - Race detector in the golang container on `internal/handler` and `internal/service/opcua`.
  - Read-only session against the PLC: all seven names resolved and read (`Point` empty,
    the three booleans false, Pos 0/0/0). No write, no trigger.
  - Headless Chrome on a local server with the simulator as the active PLC: the settings
    window opens with every node written as a name, the labels read Point/ReadDone/EndOfFile,
    the hint explains both ways, the app connects and reads the position, no page errors.
  - Migration: a database saved with the old node IDs comes back up with the names; a node ID
    of somebody's own (`ns=7;i=1000`) is kept.
- **Limits:** the names are resolved on the server the app is connected to, so a wrong name is
  found only at connection time, not while typing it. The app never writes the migrated names
  back to the database on its own: they are saved the first time the window is saved.

### Choosing the variables from the PLC (2026-09-16)

The node fields were text boxes. The user asked for the variables to be polled at connection
and chosen from a combo box, and for a connection test before saving.

- **What is listed** (`interfaceVariables` in `internal/service/opcua/nodes.go`): the walk
  starts at `ServerInterfaces`, goes into everything that has children and lists every
  variable it meets. It goes into variables too, because a structure of the PLC such as `Pos`
  is a variable carrying its members, and it leaves out the elements of an array, so the
  twenty strings of `Point` are not offered one by one. On the machine the list is seven
  entries: Point, TriggerWrite, ReadDone, EndOfFile and Pos/X, Pos/Y, Pos/Z.
- **Endpoints** (`internal/handler/opcua.go`):
  - `GET /api/opcua/variables` answers from the connection the app already has, browsing once
    per connection (`Client.Variables`, cache cleared on connect and disconnect). It never
    opens a connection by itself: opening the settings window must not reach for the machine.
  - `POST /api/opcua/test` tries the settings in the request, the ones on screen that have not
    been saved, with a throwaway client, lists what it finds and disconnects. The live
    connection of the app is not touched. A refused connection is the answer to the question
    asked, so it comes back with 200, `connected: false` and the message. The handler builds
    that client through `newClient`, a seam the tests replace.
- **The window** (`src/ui/modals/Modals.js`, `src/app/PLCConfigManager.js`): every node field
  is a combo box, an input with a button that drops the variables under it. The button shows
  them all; typing narrows them. A row shows only the part that tells the variables apart
  (`Pos/X`, not `ServerInterfaces/Com/Pos/X`) with the node ID beside it, and the full path in
  the tooltip; clicking one writes the whole path in the field. `Prova connessione` sits
  before `Salva Configurazione` and says `Collegato a … — 7 variabili trovate` or the error.
  A `datalist` was tried first and dropped: the browser filters it by what the field already
  holds, so a field carrying a variable offered only itself.
- **Fixed on the way:** the status line of the window set `data-tone` while the styles matched
  `.success`/`.error` classes, so it never had a colour.
- **Checked:**
  - Go tests on the walk (the seven variables, a structure whose members must come out, the
    array elements left out, no ServerInterfaces) and on the two endpoints with the mock
    client, including the disconnected case and a refused test.
  - `go test -tags=s7sim`: `TestVariables_S7Sim` finds the seven on the simulator.
  - Headless Chrome on a local server with the simulator: the window opens already carrying
    the variables of the live connection, the button lists all seven, a row reads `Point
    ns=4;i=12`, clicking writes the path, typing narrows, the test reports success, the
    connection of the app is untouched, the choice is saved, an endpoint that does not answer
    is reported, no page errors.
  - Against the PLC at 192.168.0.1, with the user's authorisation (writes allowed, the PLC has
    no mechanics attached): the seven variables listed from the live connection, the position
    read, and a program of 25 lines transferred in chunks addressed only by name, in 0.24 s.
- **On the machine, through the rebuilt container:** `GET /variables` answers eight entries,
  and `POST /test` connects and lists the same eight. The PLC keeps `Pos` as a **variable**
  carrying its members, so the list has both the structure (`ServerInterfaces/Com/Pos`,
  `ns=4;i=78`) and `Pos/X`, `Pos/Y`, `Pos/Z`: this is what the walk into variables is for.
- **Sessions of the S7 server are few.** While testing, the PLC began refusing every new
  session with `EOF`, including to an independent client and with a freshly generated
  certificate, while the session the container already held kept working. Closing the extra
  clients cleared it. It is a limit of concurrent sessions or secure channels, not the app:
  each connection attempt costs one, so leave the machine a channel free.

### The tool library, from the CAM panel (2026-09-16)

The window `Libreria Utensili` and the `/api/tools` endpoints already existed, but nothing
opened the window and nothing read the list: the diameters of the profile and of the drilling
were typed by hand every time. This wires what was there.

- **Where it is opened** (`src/ui/components/SidebarRight.js`): a small gear beside the
  diameter it fills, inside the field itself — one in `Fresa Ø` of the profile, one in
  `Punta Ø` of the drilling. The button carries the parameter it belongs to
  (`data-diameter="toolDiameter"` or `"drillDiameter"`), and that is the only thing the
  library needs to know about the panel.
- **What it does** (`src/app/ToolLibraryManager.js`, 189 lines): lists the saved tools with
  their kind and diameter, fills the form when one is chosen, saves a change, starts a new one
  (`Nuovo`, which the window was missing), deletes, and hands the diameter to the operation
  that asked for it through `CAMOperationManager.change`, so the value is shown, the output is
  regenerated and the operation is saved like any other change of the panel.
- **What was left alone:** the shape of the tools in the database. The library shows what the
  `Tool` model already holds — name, kind, diameter — and adds no field. `ListTools` answers
  with a bare array, unlike the rest of the API, and the manager accepts both shapes.
- **The `Tipo` menu** was missing `pen` and `drill`, two of the five kinds the seeded tools
  already use, so a seeded pen could not be saved back without changing its kind.
- **Checked:** `npm run lint`, `npm run build`, and headless Chrome on a local server with a
  temporary database and the simulator as the active PLC: the window opens from the profile
  with the four seeded tools, choosing one fills the form, `Usa` writes 6 mm into `Fresa Ø`
  and `GET /api/cam/operation` comes back with it; from the drilling, `Nuovo` saves a 2 mm
  drill that `GET /api/tools` then holds, `Usa` writes it into `Punta Ø` only (the profile
  keeps its 6), a rename is saved, `Elimina` takes it away, and there are no page errors.

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

Hooks: pre-commit runs gofmt, vet, golangci-lint on the whole packages the commit touches (`scripts/lint-staged.sh`, no `--new-from-rev`) and the 600-line cap on new files. Pre-push runs build, compilation of the `integration`/`s7sim` tests, deadcode and eslint.

## Known issues, not fixed

- **Dependency advisory:** `govulncheck` reports GO-2026-5932 on `golang.org/x/crypto`, whose `openpgp` package is unmaintained. Nothing here imports it (0 vulnerabilities reachable or imported); the module arrives as an indirect requirement of Gin through `validator/v10` and `x/crypto/sha3`, and the advisory has no fixed version. It stays until Gin stops requiring it.
- **Interface export:** `docs/interface.xml` is the export of the current PLC program, kept as a reference only: the app reads the names from the machine at every connection, because the program can change.
## Working rules to keep

- Never send to the real PLC, and never run real-PLC/integration tests, without explicit authorisation. Use the simulator.
- Do not overwrite `plotter_pen.db`, `state.json`, `last_run_input.json`, machine configurations or certificates.
- Git: commit directly on `main`, no feature branches and no worktrees; commit or push only when asked.
- Reuse first; write custom code only when justified. No external CAD in the workflow.
