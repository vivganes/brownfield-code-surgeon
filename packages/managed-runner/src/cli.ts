#!/usr/bin/env node
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local from the monorepo root (../../../.env.local relative to this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../.env.local");
config({ path: envPath });
import Anthropic from "@anthropic-ai/sdk";
import { parseArgs, HELP, defaultScratchBranch } from "./args.js";
import { resolveRepoUrl, resolveBaseBranch } from "./git-context.js";
import { resolveGithubToken, resolveAgentEnvId, resolveAnthropicApiKey } from "./secrets.js";
import { bootstrapFinishSession, type AttachedFile } from "./session.js";
import { drainSessionStream } from "./runner.js";
import type { ManagedEvent } from "./sse-translator.js";

const ATTACH_PATHS = [
  "plan/plan.md",
  "plan/seams-and-dependencies.md",
];

function readAttachedFiles(repoRoot: string): AttachedFile[] {
  const out: AttachedFile[] = [];
  for (const rel of ATTACH_PATHS) {
    try {
      const content = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      out.push({ path: rel, content });
    } catch {
      // file isn't there — that's fine for fresh runs
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }

  const repoUrl = args.repoUrl ?? resolveRepoUrl(args.repoRoot);
  const baseBranch = args.baseBranch ?? resolveBaseBranch(args.repoRoot);
  const scratchBranch = args.scratchBranch ?? defaultScratchBranch(args.runId);
  const checkoutBranch = args.checkoutBranch ?? baseBranch;
  const githubToken = resolveGithubToken();
  const environmentId = resolveAgentEnvId(args.agentEnvId);
  const anthropicApiKey = resolveAnthropicApiKey();
  const model = args.model ?? "claude-opus-4-7";
  const attachedFiles = readAttachedFiles(args.repoRoot);

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
  console.log(`[managed-runner] checkoutBranch=${checkoutBranch}`);
  console.log(
    `[managed-runner] attachedFiles=${attachedFiles.length > 0 ? attachedFiles.map((f) => f.path).join(",") : "(none)"}`,
  );
  console.log(`[managed-runner] model=${model}`);
  console.log(
    `[managed-runner] envId=${environmentId ? environmentId : "(missing)"}`,
  );
  console.log(
    `[managed-runner] githubToken=${githubToken ? "(set)" : "(missing)"}`,
  );
  console.log(
    `[managed-runner] anthropicApiKey=${anthropicApiKey ? "(set)" : "(missing)"}`,
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
  if (!anthropicApiKey) {
    console.error(
      "surgery-managed: missing Anthropic API key. Set SURGERY_ANTHROPIC_API_KEY environment variable.",
    );
    process.exit(2);
  }

  const client = new Anthropic({ apiKey: anthropicApiKey });
  const result = await bootstrapFinishSession({
    client,
    model,
    agentName: "Brownfield Surgeon — Finish",
    environmentId,
    repoUrl,
    baseBranch,
    scratchBranch,
    checkoutBranch,
    githubToken,
    runId: args.runId,
    request: args.request,
    attachedFiles,
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
