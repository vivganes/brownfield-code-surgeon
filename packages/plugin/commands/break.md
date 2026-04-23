---
description: Step 3 of 7 — Break: break dependencies to enable testing.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Task
argument-hint: [optional context]
---

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/require-approval.js" map
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-phase.js" break
```

Delegate to the **surgery-break** subagent using the Task tool:

> Read `plan/plan.md` and `plan/seams-and-dependencies.md`. Apply dependency-breaking techniques (Parameterize Constructor, Extract Interface, Extract-and-Override, etc.) to make the change area testable. Do NOT add new feature behavior. Do NOT write new tests — that is the Cover phase. Preserve behavior. Verify the project still compiles. Report each dependency broken and the technique used.

When the subagent returns, summarize the dependencies broken and point the user at `/cover` (after approval).
