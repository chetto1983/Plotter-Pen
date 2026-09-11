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
| 4 | First complete profile down to J/L/A commands, tried on the simulator | **Next** |
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

## Working rules to keep

- Never send to the real PLC, and never run real-PLC/integration tests, without explicit authorisation. Use the simulator.
- Do not overwrite `plotter_pen.db`, `state.json`, `last_run_input.json`, machine configurations or certificates.
- Git: commit directly on `main`, no feature branches and no worktrees; commit or push only when asked.
- Reuse first; write custom code only when justified. No external CAD in the workflow.
