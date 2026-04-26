# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**brownfield-code-surgeon** is a monorepo (npm workspaces) that implements a seven-phase agentic code surgery workflow for refactoring large, undertested systems. All interfaces (Claude Code plugin, CLI SDK runner, Claude Managed Agents) emit the same artifact contracts, allowing an engine-agnostic web UI to track progress.

The workflow phases: **Plan → Map → Break → Cover → Implement → Refactor → Finish**

## Workspace Structure

- **`packages/shared`** — Zod schemas for artifacts, events, approvals, git status, vitals. Source of truth for contract between all engines.
- **`packages/core-prompts`** — System prompts and instruction sets for each of the seven phases.
- **`packages/plugin`** — Claude Code plugin: slash commands (`/brownfield-code-surgeon:surgery`), subagents for each phase, forbidden-moves hooks, event emitters.
- **`packages/sdk-runner`** — Node.js CLI (`surgery-run`) that drives the pipeline via Claude Agent SDK. Writes `.surgery/` and `plan/` artifacts same as plugin.
- **`packages/managed-runner`** — Optional hands-off of final phase to Claude Managed Agents (requires `ANTHROPIC_AGENT_ENV_ID`).
- **`packages/ui`** — Vite+React web app ("Operating Theater"): tails artifacts, streams events via SSE backend, renders timeline, seams graph, cat patient animating through phases.

## Development

### Build, Lint, Test

```bash
# Install dependencies and build all workspaces
npm install
npm run build

# Type check all workspaces
npm run typecheck

# Run tests once
npm test

# Watch mode for development
npm test:watch

# Generate coverage report (enforces 90% line threshold in CI)
npm run test:coverage

# Clean build artifacts
npm run clean
```

### Running Individual Packages

All commands from `packages/<name>` require building first, since workspaces depend on each other (e.g., plugin and sdk-runner both depend on shared).

**Plugin**:
```bash
npm run build  # From repo root first
# Then in Claude Code: /plugin marketplace add vivganes/brownfield-code-surgeon
#                     /plugin install brownfield-code-surgeon
#                     /reload-plugins
#                     /brownfield-code-surgeon:surgery "describe surgery goal"
```

**SDK Runner**:
```bash
npm run build
export ANTHROPIC_API_KEY=sk-ant-...
npx surgery-run --repo /path/to/target-repo --request "add feature"
```

**UI** (Operating Theater):
```bash
npm run build
SURGERY_REPO_ROOT=/path/to/target-repo npm run dev -w @brownfield-surgeon/ui
# Opens http://localhost:5173 (Vite); SSE backend on :7777
```

## Architecture & Design Principles

### Artifact Contracts (Engine-Agnostic)

All three engines write identical artifacts, allowing the UI to consume either. See `packages/shared` schemas:

- **`.surgery/vitals.json`** — Phase, test results, coverage %, seam counts (vitals.ts)
- **`.surgery/events.jsonl`** — Append-only timeline: `PhaseStart`, `ToolUse`, `ArtifactWritten`, approval gates (events.ts)
- **`plan/plan.md`** — Phase deliverables and seams analysis
- **`plan/seams-and-dependencies.md`** — Parsed by UI into Cytoscape DAG
- **`plan/.approvals/<phase>.ok`** — Approval gate file; written by UI approval button or `touch plan/.approvals/cover.ok`

### Shared Contracts

`packages/shared` exports Zod schemas that define the workflow:

- **Phases** (phases.ts) — The seven phases as enum + phase-specific approval logic
- **Artifacts** (artifacts.ts) — File paths, naming, structure
- **Events** (events.ts) — Event types (ToolUse, Artifact, PhaseStart, etc.)
- **Approvals** (approvals.ts) — Approval tracking and gates
- **Git Status** (git-status.ts) — Repo state snapshots
- **Vitals** (vitals.ts) — Metrics (coverage, tests, seams)

### Plugin Architecture

**`packages/plugin`** provides:

- **Slash commands** (`/brownfield-code-surgeon:surgery <goal>`) — Entry point, kicks off phase orchestration
- **Subagents** (in `agents/`) — One per phase, each with specialized prompts from `@brownfield-surgeon/core-prompts`
- **Forbidden-moves hooks** (in `hooks/`) — Gates dangerous operations at workflow boundaries
- **Event emission** — Every Claude decision (tool_use, artifact) is mirrored to `.surgery/events.jsonl` for UI timeline

### Event Flow

1. User kicks off surgery via plugin or SDK runner
2. Runner orchestrates phases sequentially; each phase:
   - Spins up a subagent with phase-specific prompt
   - Subagent uses Claude tools (code read, analysis, generation)
   - Each tool use and artifact write → `.surgery/events.jsonl`
   - Runner waits for `plan/.approvals/<phase>.ok` before next phase
3. UI polls `.surgery/events.jsonl` and `.surgery/vitals.json` via SSE, streaming updates
4. User reviews and approves in UI or CLI (touch approval file)

## Testing

- **Test framework**: Vitest (runs on all packages)
- **Coverage threshold**: 90% lines enforced by CI; reported in PR comments
- **Run a single test**: `npx vitest run packages/shared/src/phases.test.ts`
- **Watch a package's tests**: `npx vitest packages/shared/src` (auto-rerun on change)
- **Coverage report**: `npm run test:coverage` → generates `coverage/coverage-summary.json`

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`):

1. Install deps (`npm ci`)
2. **Build all packages** (must happen before typecheck; see recent CI fix)
3. **Type check** (`npm run typecheck`)
4. **Test + coverage** (`npm run test:coverage`)
5. **Coverage validation** — fail if <90% lines
6. **PR comment** — posts coverage metrics (lines, statements, functions, branches)

## Key Dependencies

- **Zod** — Schema validation (shared package)
- **Vite** — UI bundler (web) and dev server
- **Vitest** — Unit testing + coverage
- **TypeScript 5.6** — Strict mode enforced
- **Claude Agent SDK** — SDK runner uses agents API
- **React** — UI (Operating Theater)

## Key Files to Know

- `packages/shared/src/phases.ts` — Enum and logic for the seven phases
- `packages/core-prompts/prompts/` — Raw prompt files for each phase (not compiled, loaded as assets)
- `packages/plugin/.claude-plugin/manifest.yaml` — Plugin metadata (commands, agents)
- `packages/ui/src/theatre/Patient.tsx` — 3D cat animating through phases (Toon Cat FREE model)
- `.github/workflows/ci.yml` — Build/test/coverage enforcement

## Development Notes

- **Workspace dependencies**: All packages except the root are private (`"private": true`). Shared contracts (types, events) flow through `@brownfield-surgeon/shared`.
- **Node 20+** required (engines.node in root package.json).
- **Build before test**: `npm run build` must precede `npm test` because packages depend on each other's dist.
- **Type safety**: All packages use `"strict": true` in tsconfig.
- **No comments in prompts**: Core prompts are plain text files in `packages/core-prompts/prompts/`; they are the source of truth and versioned.
