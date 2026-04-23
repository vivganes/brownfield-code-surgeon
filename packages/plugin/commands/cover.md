---
description: Step 4 of 7 — Cover: write characterization tests for existing behavior.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: [optional context]
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/require-approval.js" break
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" cover
```

Delegate to the **surgery-cover** subagent using the Task tool:

> Read `plan/plan.md` and `plan/seams-and-dependencies.md`. Write characterization / pinning / regression tests for the change area so that regressions will be caught in later phases. Only write test files; production source edits are forbidden in this phase (the hook will block them). Run the tests and report pass/fail counts.

When the subagent returns, summarize new tests and coverage, then point the user at `/implement` (after approval).
