# Brownfield Code Surgeon

A package of tools that productionize the **seven-agent brownfield code-surgery workflow** — Plan, Map, Break, Cover, Implement, Refactor, Finish — from:

> Ganesan, V., Sekar, K. R., & Kashyap, K. (2026). *Agentic Code Surgery for Brownfield Systems.* Zenodo. <https://zenodo.org/records/19640171>

## One backbone, four surfaces

All surfaces read and write the same artifacts and emit the same events.

| Surface | Package | Purpose | Usage Guide |
|---|---|---|---|
| Claude Code plugin | `packages/plugin` | Native subagents + slash commands + forbidden-moves hooks.  | Refer the plugin's [README.md](packages/plugin/README.md) |
| SDK runner | `packages/sdk-runner` | Local Node CLI driving the pipeline via the Claude Agent SDK |  |
| Managed Agents orchestrator | `packages/managed-runner` | Cloud execution for long-running phases |  |
| Operating-theater web UI | `packages/ui` | Vitals, seams graph, phase timeline, approval controls |  |

Shared contracts live in `packages/shared`; the source-of-truth agent prompts live in `packages/core-prompts`.


## License

MIT. See [LICENSE](./LICENSE).
