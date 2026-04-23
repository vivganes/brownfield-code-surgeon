# @brownfield-surgeon/sdk-runner

Local Node CLI that drives the seven-phase brownfield surgery pipeline via the
[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk). Writes the same
`.surgery/` and `plan/` artifacts as the Claude Code plugin, so the UI and
approval flow are engine-agnostic.

## Install

From the monorepo root:

```bash
npm install
npm run build -w @brownfield-surgeon/sdk-runner
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
surgery-run --repo /path/to/target-repo --request "add a comments feature"
```

Options:

| Flag | Default | Purpose |
|---|---|---|
| `--repo` | cwd | Target repo to operate on |
| `--request` | _(required)_ | What the surgery should accomplish |
| `--phases` | all seven | Comma-separated subset (`plan,map,break`…) |
| `--auto-approve` | off | Skip human approval between phases (demo mode) |
| `--run-id` | `run-<t>` | Stable identifier for the run |

Approval gates: after each phase the runner writes `ApprovalRequested` and waits
for `plan/.approvals/<phase>.ok` to appear. Approve from:

- the UI's **Approve incision** button, or
- the CLI: `touch plan/.approvals/cover.ok`

## Events & artifacts

Identical to the plugin's contract — see `packages/shared` for schemas.
Every SDK tool_use is mirrored into `.surgery/events.jsonl`, so the timeline
and surgical log panels in the UI work without any runner-specific code.
