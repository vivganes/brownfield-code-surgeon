---
description: Step 5 of 7 — Implement: add the new behavior with TDD.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: [optional context]
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/require-approval.js" cover
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" implement
```

Delegate to the **surgery-implement** subagent using the Task tool:

> Read `plan/plan.md`. Implement the requested change using TDD: write a failing test for the new behavior, make it pass with minimal code, repeat. Keep existing tests green. Report each red→green cycle and the final test results.

When the subagent returns, summarize the implementation and test status, then point the user at `/refactor` (after approval).
