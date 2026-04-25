#!/usr/bin/env node
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs, HELP, defaultScratchBranch } from "./args.js";
import { resolveRepoUrl, resolveBaseBranch } from "./git-context.js";
import { resolveGithubToken, resolveAgentEnvId } from "./secrets.js";
import { bootstrapFinishSession } from "./session.js";
import { drainSessionStream } from "./runner.js";
import type { ManagedEvent } from "./sse-translator.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const repoUrl = args.repoUrl ?? resolveRepoUrl(args.repoRoot);
  const baseBranch = args.baseBranch ?? resolveBaseBranch(args.repoRoot);
  const scratchBranch = args.scratchBranch ?? defaultScratchBranch(args.runId);
  const githubToken = resolveGithubToken();
  const environmentId = resolveAgentEnvId(args.agentEnvId);
  const model = args.model ?? "claude-opus-4-7";

  if (!repoUrl) {
    console.error(
      "surgery-managed: could not determine --repo-url. Pass it explicitly or run inside a repo with a configured 'origin' remote.",
    );
    process.exit(2);
  }

  console.log(`[managed-runner] run=${args.runId}`);
  console.log(`[managed-runner] repoRoot=${args.repoRoot}`);
  console.log(`[managed-runner] repoUrl=${repoUrl}`);
  console.log(`[managed-runner] baseBranch=${baseBranch}`);
  console.log(`[managed-runner] scratchBranch=${scratchBranch}`);
  console.log(`[managed-runner] model=${model}`);
  console.log(
    `[managed-runner] envId=${environmentId ? environmentId : "(missing)"}`,
  );
  console.log(
    `[managed-runner] githubToken=${githubToken ? "(set)" : "(missing)"}`,
  );

  if (args.dryRun) {
    console.log("[managed-runner] --dry-run set; exiting before API call.");
    return;
  }

  if (!environmentId) {
    console.error(
      "surgery-managed: missing managed-agents environment ID. Pass --agent-env-id, set ANTHROPIC_AGENT_ENV_ID, or configure it in the Settings dialog.",
    );
    process.exit(2);
  }
  if (!githubToken) {
    console.error(
      "surgery-managed: missing GitHub token. Set SURGERY_GIT_TOKEN, GITHUB_TOKEN, or configure it in the Settings dialog. The cloud container needs it to clone and push.",
    );
    process.exit(2);
  }

  const client = new Anthropic();
  const result = await bootstrapFinishSession({
    client,
    model,
    agentName: "Brownfield Surgeon — Finish",
    environmentId,
    repoUrl,
    baseBranch,
    scratchBranch,
    githubToken,
    runId: args.runId,
    request: args.request,
  });

  console.log(`[managed-runner] sessionId=${result.sessionId}`);
  console.log(
    `[managed-runner] agentId=${result.agentId}${result.agentCached ? " (cached)" : " (new)"}`,
  );
  console.log("[managed-runner] streaming session events…");

  const stream = await client.beta.sessions.events.stream(result.sessionId);
  // The Anthropic SDK's `Stream<T>` yields a `BetaManagedAgentsStreamSessionEvents`
  // which carries the actual session event in a discriminated `event` field.
  // Our translator works on the inner ManagedEvent shape; coerce here so the
  // pure code stays decoupled from the SDK's wrapper type.
  async function* unwrap(): AsyncIterable<ManagedEvent> {
    for await (const wrapper of stream) {
      const inner = (wrapper as unknown as { event?: ManagedEvent }).event;
      if (inner) yield inner;
      else yield wrapper as unknown as ManagedEvent;
    }
  }

  const drainResult = await drainSessionStream({
    stream: unwrap(),
    repoRoot: args.repoRoot,
    runId: args.runId,
    scratchBranch,
    heartbeatMs: 10_000,
    onLog: (line) => console.log(line),
  });

  console.log(
    `[managed-runner] done control=${drainResult.control.kind} events=${drainResult.eventsAppended} artifacts=${drainResult.artifactsWritten} dups=${drainResult.duplicatesSkipped}`,
  );
  if (drainResult.control.kind === "failed") {
    console.error(
      `[managed-runner] failed: ${"reason" in drainResult.control ? drainResult.control.reason : ""}`,
    );
    process.exit(1);
  }
  if (drainResult.control.kind === "aborted") {
    console.error(
      `[managed-runner] aborted: ${"reason" in drainResult.control ? drainResult.control.reason : ""}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[managed-runner] fatal:", err);
  process.exit(1);
});
