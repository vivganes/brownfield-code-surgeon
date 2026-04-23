# @brownfield-surgeon/plugin — Developer Guide

Claude Code plugin that delivers the seven-phase brownfield surgery workflow as slash commands, subagents, and phase-aware hooks.

## Prerequisites

- Node.js ≥ 20
- Claude Code CLI installed and authenticated
- Built from the monorepo root (see below)

## Package layout

```
.claude-plugin/plugin.json   # marketplace manifest
agents/1-plan.md … 7-finish.md  # ⚠ generated — do not edit directly
commands/plan.md … surgery.md   # slash commands — edit freely
hooks/
  hooks.json                 # hook wiring — edit freely
  *.js                       # ⚠ generated — do not edit directly
scripts/
  set-phase.js               # ⚠ generated
  approve.js                 # ⚠ generated
  require-approval.js        # ⚠ generated
src/
  hooks/*.ts                 # source for hooks/*.js
  runtime/*.ts               # source for scripts/*.js
  build/postbuild.ts         # generates agents/ + copies JS
```

> **Rule of thumb:** edit `.ts` files in `src/`, then rebuild. Never edit generated files — they are overwritten on every build.
>
> Agent prompt bodies live in `packages/core-prompts/prompts/`. Edit them there; the build embeds them into `agents/*.md` automatically.

## Building

From the **monorepo root**:

```bash
# Full build (shared → core-prompts → plugin)
npm run build

# Plugin only (after shared and core-prompts are already built)
npm run build -w @brownfield-surgeon/plugin
```

The build runs `tsc` then `node dist/build/postbuild.js`, which:
1. Regenerates `agents/*.md` from `core-prompts` prompts.
2. Copies compiled hook scripts into `hooks/`.
3. Copies compiled runtime helpers into `scripts/`.

## Testing the plugin locally

### Option A — via the marketplace (recommended)

From any target repo you want to operate on:

```bash
# Inside the target repo, with Claude Code:
/plugin marketplace add /absolute/path/to/brownfield-code-surgeon
/plugin install brownfield-code-surgeon
```

Then verify the plugin is active:

```bash
/plan "add a hello-world endpoint"
```

### Option B — manual symlink (fastest for iteration)

```bash
# In the target repo's .claude/ directory:
ln -s /absolute/path/to/brownfield-code-surgeon/packages/plugin \
      .claude/plugins/brownfield-code-surgeon
```

Restart Claude Code in the target repo. The agents, commands, and hooks should be live immediately after each rebuild (no reinstall needed).

## What to verify after installing

| Check | How |
|-------|-----|
| Agents registered | Type `@surgery-` in Claude Code — you should see tab-complete for `surgery-plan` … `surgery-finish` |
| Commands registered | Type `/` — look for `plan (Step 1 of 7)` … `surgery` |
| Hooks firing | After any write/bash, check that `.surgery/events.jsonl` appears in the target repo |
| Phase guard works | Run `/cover` on a repo, then ask Claude to edit a non-test source file — the hook should block it |
| Approval flow | Run `node .claude/surgery/approve.js plan` and confirm `plan/.approvals/plan.ok` is written |

## Smoke test on a toy repo

```bash
mkdir /tmp/toy-repo && cd /tmp/toy-repo && git init
# Open Claude Code here, install the plugin, then:
/surgery "add a hello-world function to src/index.ts"
```

Expected artifacts after `/surgery` completes all phases:

```
plan/
  plan.md
  seams-and-dependencies.md
  .approvals/{plan,map,break,cover,implement,refactor,finish}.ok
.surgery/
  vitals.json
  events.jsonl
```

Pipe `events.jsonl` through `jq` to inspect the event stream:

```bash
cat .surgery/events.jsonl | jq '.type'
```

You should see `PhaseStart`, `ToolUse`, `ArtifactWritten`, `PhaseEnd`, and `ApprovalRequested` events interleaved.

## Development workflow

```bash
# 1. Edit source
code packages/plugin/src/hooks/pre-tool-use.ts

# 2. Rebuild plugin
npm run build -w @brownfield-surgeon/plugin

# 3. If using Option B (symlink), changes are live immediately.
#    If using Option A (marketplace), reinstall:
/plugin install brownfield-code-surgeon --force
```

## Environment variable

The plugin uses `${CLAUDE_PLUGIN_ROOT}` (set by Claude Code) to locate its own `hooks/` and `scripts/` directories at runtime. If a hook script fails with "cannot find module", check that `CLAUDE_PLUGIN_ROOT` is resolving to this package directory.

You can override it for local debugging:

```bash
CLAUDE_PLUGIN_ROOT=/absolute/path/to/packages/plugin \
  node packages/plugin/hooks/pre-tool-use.js < test-input.json
```

where `test-input.json` is a sample hook payload, e.g.:

```json
{
  "tool_name": "Write",
  "tool_input": { "file_path": "src/foo.ts", "content": "x" },
  "cwd": "/tmp/toy-repo"
}
```
