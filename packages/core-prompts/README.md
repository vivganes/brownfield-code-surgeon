# @brownfield-surgeon/core-prompts

Source-of-truth agent prompts for the seven-phase brownfield surgery workflow.

The markdown files under `prompts/` are ported from [`ampyard/brownfield-agentic-code-surgery`](https://github.com/ampyard/brownfield-agentic-code-surgery) (source: local clone at `D:\source-codes\ampyard\brownfield-agentic-code-surgery` at port time). The original Copilot-specific `tools:` frontmatter has been stripped; body text is unchanged. Each surface (Claude Code plugin, SDK runner, Managed Agents orchestrator) wraps the body with its own envelope (Claude Code subagents, for example, need a different frontmatter schema — `name`, `description`, `tools`, `model`).

Do **not** edit the body of these prompts without a corresponding upstream change — they are the contract every surface loads from.

## Usage

```ts
import { loadPrompt, loadAllPrompts } from "@brownfield-surgeon/core-prompts";

const plan = loadPrompt("plan");
console.log(plan.phase); // "plan"
console.log(plan.file);  // absolute path to the source markdown
console.log(plan.body);  // full prompt body, ready to wrap
```
