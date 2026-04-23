---
description: Step 1 of 7 — Plan: understand the requested change and write plan/plan.md.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: <feature request>
---

Initialize this run's current phase to **plan** by running:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" plan "$ARGUMENTS"
```

Then delegate to the **surgery-plan** subagent using the Task tool with this prompt:

> User's change request: $ARGUMENTS
>
> Follow the Plan phase contract exactly. Produce `plan/plan.md` with: feature description, change points, impact analysis, risk assessment, and success criteria. Do not modify any production source files or tests.

When the subagent returns, show the user:
1. A 3-sentence summary of the plan.
2. The path `plan/plan.md`.
3. The next step: `/map` once they have approved the plan by running `node "${CLAUDE_PLUGIN_ROOT}/scripts/approve.js" plan`.
