# @brownfield-surgeon/ui — Operating Theater

Engine-agnostic web UI that reads the shared artifact contract:

- `.surgery/vitals.json` — current phase, tests, coverage, seams counters
- `.surgery/events.jsonl` — append-only timeline (`PhaseStart`, `ToolUse`, `ArtifactWritten`, …)
- `plan/seams-and-dependencies.md` — parsed into a Cytoscape graph
- `plan/.approvals/<phase>.ok` — written by the UI when you approve an incision

Any of the three engines (plugin, SDK runner, Managed Agents) that writes the
same artifacts lights up the same UI.

## Running

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
