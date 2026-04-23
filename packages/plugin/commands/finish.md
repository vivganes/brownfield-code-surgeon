---
description: Step 7 of 7 — Finish: update docs, changelog, and produce a PR-ready summary.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: [optional context]
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/require-approval.js" refactor
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" finish
```

Delegate to the **surgery-finish** subagent using the Task tool:

> Read `plan/plan.md`. Update README/CHANGELOG/docs to reflect the new behavior. Write a concise PR summary describing: what changed, why, tests added, and risk. Do not modify source code — this phase is docs and cleanup only.

When the subagent returns, print the PR-ready summary and point the user at `node "${CLAUDE_PLUGIN_ROOT}/scripts/approve.js" finish` to close the run.
