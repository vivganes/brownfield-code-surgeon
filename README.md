# Brownfield Code Surgeon

A package of tools that productionize the **seven-agent brownfield code-surgery workflow** — Plan, Map, Break, Cover, Implement, Refactor, Finish — from:

> Ganesan, V., Sekar, K. R., & Kashyap, K. (2026). *Agentic Code Surgery for Brownfield Systems.* Zenodo. <https://zenodo.org/records/19640171>

## One backbone, four surfaces

All surfaces read and write the same artifacts and emit the same events.

| Surface | Package | Purpose | Usage Guide |
|---|---|---|---|
| Claude Code plugin | `packages/plugin` | Native subagents + slash commands + forbidden-moves hooks.  | Refer the plugin's [README.md](packages/plugin/README.md) |
| SDK runner | `packages/sdk-runner` | Local Node CLI driving the pipeline via the Claude Agent SDK | Refer the runner's [README.md](packages/sdk-runner/README.md) |
| Managed Agents orchestrator | `packages/managed-runner` | Cloud execution for long-running phases |  |
| Operating-theater web UI | `packages/ui` | Vitals, seams graph, phase timeline, approval controls | Refer the UI's [README.md](packages/ui/README.md) |

Shared contracts live in `packages/shared`; the source-of-truth agent prompts live in `packages/core-prompts`.

## Setup

### Environment Variables

Copy `.env.example` to `.env.local` and configure your credentials:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your API keys:

```env
# Required: Anthropic API key
SURGERY_ANTHROPIC_API_KEY=sk-your-key-here

# Optional: GitHub token (can also be configured via UI)
SURGERY_GIT_TOKEN=ghp_...

# Optional: Managed-Agents environment ID (can also be configured via UI)
ANTHROPIC_AGENT_ENV_ID=env_...
```

The `.env.local` file is git-ignored and will not be committed.

## License

MIT. See [LICENSE](./LICENSE).
