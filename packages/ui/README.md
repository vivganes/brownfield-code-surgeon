# @brownfield-surgeon/ui — Operating Theater

Engine-agnostic web UI that reads the shared artifact contract:

- `.surgery/vitals.json` — current phase, tests, coverage, seams counters
- `.surgery/events.jsonl` — append-only timeline (`PhaseStart`, `ToolUse`, `ArtifactWritten`, …)
- `plan/seams-and-dependencies.md` — parsed into a Cytoscape graph
- `plan/.approvals/<phase>.ok` — written by the UI when you approve an incision

Any of the three engines (plugin, SDK runner, Managed Agents) that writes the
same artifacts lights up the same UI.

## Running

First, build all workspace packages from the repo root:

```bash
npm install
npm run build
```

Then start the dev server:

```bash
# From the repo root:
SURGERY_REPO_ROOT=/path/to/target-repo npm run dev -w @brownfield-surgeon/ui
```

Two processes start:

- **SSE backend** on `http://localhost:7777` — tails files from `SURGERY_REPO_ROOT` and
  pushes events over `GET /api/stream`.
- **Vite dev server** on `http://localhost:5173` — proxies `/api/*` to the backend.

Open `http://localhost:5173`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/stream` | SSE — replays state on connect, streams new events and vitals |
| `GET`  | `/api/vitals` | snapshot of `vitals.json` |
| `GET`  | `/api/events` | array of all events so far |
| `GET`  | `/api/plan`   | raw `plan/plan.md` |
| `GET`  | `/api/seams`  | raw `plan/seams-and-dependencies.md` |
| `POST` | `/api/approvals/:phase` | writes `plan/.approvals/<phase>.ok` (unblocks next phase) |
| `GET`  | `/api/health` | liveness |

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SURGERY_REPO_ROOT` | `cwd` | Repo whose `.surgery/` and `plan/` the UI follows |
| `SURGERY_UI_PORT`   | `7777` | Backend port |

## The Patient (cat)

The codebase under surgery is rendered as a cat on the operating table
(`src/theatre/Patient.tsx`). It progresses through 7 visual states tied to the
workflow phases: vines wrap it (idle), a laser scans it (plan), file-name
labels pin to seams (map), vines fall away (break), stitches appear (cover),
fur shimmers warm (implement), it glows (refactor), and it trots out of frame
(finish).

The cat is the **Toon Cat FREE** model loaded from `public/models/toon_cat_free.glb`.
A primitives-only fallback (`PrimitiveCat`) is kept in `Patient.tsx` for
emergencies. Surrounding visuals (vines / laser / labels / stitches / glow /
trot) are asset-agnostic.

## Evidence of Effectiveness of this Workflow

The evidence of effectiveness can be seen by comparing pull requests [#33 - Regular Plan + Implement Approach](https://github.com/vivganes/kanbanstr/pull/33) and [#34 - Brownfield Surgery Claude Code Plugin](https://github.com/vivganes/kanbanstr/pull/34) of the [Kanbanstr](https://github.com/vivganes/kanbanstr) repo.

Our workflow increased the coverage from 0.82% to 19.24% of lines, while implementing the same feature.

This would mean:
 - Less manual testing effort after the agent finishes
 - Provably correct implementation
 - Prevention of regression in the covered lines of code by anyone in the future
  
## Continuous Integration

CI using Github Actions is enabled in this repository so that we maintain the quality continuously.

### Model attribution

This work is based on ["Toon Cat FREE"](https://sketchfab.com/3d-models/toon-cat-free-b2bd1ee7858444bda366110a2d960386)
by [Omabuarts Studio](https://sketchfab.com/omabuarts), licensed under
[CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/).
See `public/models/license.txt` for the unmodified license file.
