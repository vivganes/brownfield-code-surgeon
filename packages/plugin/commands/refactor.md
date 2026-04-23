---
description: Step 6 of 7 — Refactor: improve structure without changing behavior.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: [optional context]
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/require-approval.js" implement
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" refactor
```

Delegate to the **surgery-refactor** subagent using the Task tool:

> Read `plan/plan.md`. Improve the design of the change area (naming, duplication, cohesion) WITHOUT changing behavior. All existing tests must remain green. Do not modify existing tests (the hook will block it). Report each refactoring applied and test status after each.

When the subagent returns, summarize refactorings and point the user at `/finish` (after approval).
