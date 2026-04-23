---
description: Step 2 of 7 — Map: find seams, test points, and dependencies.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: [optional context]
---

Require approval for the prior phase, then set the current phase to **map**:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/require-approval.js" plan
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" map
```

Delegate to the **surgery-map** subagent using the Task tool:

> Extra context from user: $ARGUMENTS
>
> Read `plan/plan.md`. Follow the Map phase contract. Produce `plan/seams-and-dependencies.md` listing seams, test points, and dependencies that must be broken. Do not modify production source or tests.

When the subagent returns, summarize the seams found and point the user at `/break` (after they approve with `node "${CLAUDE_PLUGIN_ROOT}/scripts/approve.js" map`).
