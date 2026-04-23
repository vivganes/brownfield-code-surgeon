import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  appendEvent,
  makeBaseEvent,
  waitForApproval,
  isApproved,
  isTestCommand,
  parseTestOutput,
  readCoverageSnapshot,
  readVitals,
  writeVitals,
  type CoverageSnapshot,
  type Phase,
  type SurgeryEvent,
  type Vitals,
} from "@brownfield-surgeon/shared";
import { loadPrompt } from "@brownfield-surgeon/core-prompts";
import { loadOrInitVitals, setPhaseStatus } from "./vitals-updater.js";
import { THINKING_TOKENS, type ThinkingLevel } from "./args.js";

const ENGINE = "sdk" as const;

export interface RunOptions {
  repoRoot: string;
  request: string;
  phases: Phase[];
  runId: string;
  autoApprove: boolean;
  model?: string;
  thinking?: ThinkingLevel;
}

interface PhaseContext {
  // tool_use_id -> command executed, so we can correlate tool_result messages.
  bashCommands: Map<string, string>;
  // fingerprint of last seen coverage snapshot, so we don't re-emit identical deltas.
  lastCoverageKey: string | null;
}

export async function runPipeline(opts: RunOptions): Promise<void> {
  await loadOrInitVitals(opts.repoRoot, opts.runId);

  for (const phase of opts.phases) {
    await runPhase(phase, opts);
  }
}

async function runPhase(phase: Phase, opts: RunOptions): Promise<void> {
  const startedAt = Date.now();
  const ctx: PhaseContext = { bashCommands: new Map(), lastCoverageKey: null };

  await emit(opts, {
    ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
    type: "PhaseStart",
    request: opts.request,
  });
  await setPhaseStatus(opts.repoRoot, phase, "running");

  // Baseline coverage snapshot at phase start so the first real CoverageDelta
  // has a meaningful "before". Silently ignored if the repo doesn't produce any.
  await samplePhaseCoverage(opts, phase, ctx, { source: "phase-start" });

  try {
    const prompt = buildPhasePrompt(phase, opts);
    await streamQuery(prompt, opts, phase, ctx);

    // Post-phase coverage sample — tests often write the summary after streaming ends.
    await samplePhaseCoverage(opts, phase, ctx, { source: "phase-end" });

    await setPhaseStatus(opts.repoRoot, phase, "awaiting-approval");
    await emit(opts, {
      ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
      type: "ApprovalRequested",
      summary: `phase "${phase}" complete — awaiting human approval`,
      artifacts: [],
    });

    if (opts.autoApprove) {
      const { writeApproval } = await import("@brownfield-surgeon/shared");
      await writeApproval(opts.repoRoot, phase, {
        approvedBy: "sdk-runner --auto-approve",
      });
    } else if (!isApproved(opts.repoRoot, phase)) {
      console.log(`[sdk-runner] waiting for approval of "${phase}"…`);
      console.log(`  touch plan/.approvals/${phase}.ok  (or approve from the UI)`);
      await waitForApproval(opts.repoRoot, phase, { pollMs: 1000 });
    }

    await emit(opts, {
      ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
      type: "ApprovalGranted",
      approvedBy: opts.autoApprove ? "auto" : "human",
    });

    await setPhaseStatus(opts.repoRoot, phase, "completed");
    await emit(opts, {
      ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
      type: "PhaseEnd",
      outcome: "completed",
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    await setPhaseStatus(opts.repoRoot, phase, "failed");
    await emit(opts, {
      ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
      type: "PhaseEnd",
      outcome: "failed",
      durationMs: Date.now() - startedAt,
      errorMessage: String(err),
    });
    throw err;
  }
}

function buildPhasePrompt(phase: Phase, opts: RunOptions): string {
  const { body } = loadPrompt(phase);
  return [
    body,
    "",
    "---",
    "# Run context",
    "",
    `- Repo root: ${opts.repoRoot}`,
    `- Run id: ${opts.runId}`,
    `- Engine: sdk-runner`,
    `- User request: ${opts.request}`,
    "",
    "Produce the phase's prescribed artifacts at the contract paths",
    "(`plan/plan.md`, `plan/seams-and-dependencies.md`, etc.) and exit when done.",
  ].join("\n");
}

async function streamQuery(
  prompt: string,
  opts: RunOptions,
  phase: Phase,
  ctx: PhaseContext,
): Promise<void> {
  const thinkingTokens = opts.thinking ? THINKING_TOKENS[opts.thinking] : undefined;
  const iter = query({
    prompt,
    options: {
      cwd: opts.repoRoot,
      permissionMode: "acceptEdits",
      ...(opts.model ? { model: opts.model } : {}),
      ...(typeof thinkingTokens === "number" && thinkingTokens > 0
        ? { maxThinkingTokens: thinkingTokens }
        : {}),
    },
  });
  for await (const message of iter as AsyncIterable<SDKMessage>) {
    await onMessage(message, opts, phase, ctx);
  }
}

async function onMessage(
  message: SDKMessage,
  opts: RunOptions,
  phase: Phase,
  ctx: PhaseContext,
): Promise<void> {
  const anyMsg = message as any;

  // Assistant turn — capture tool_use blocks for the ToolUse timeline and
  // remember Bash commands so we can match them to their eventual tool_result.
  if (anyMsg.type === "assistant" && anyMsg.message?.content) {
    for (const block of anyMsg.message.content) {
      if (block.type === "tool_use") {
        await emit(opts, {
          ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
          type: "ToolUse",
          tool: block.name,
          summary: summarizeToolInput(block.name, block.input),
          blocked: false,
        });
        if (block.name === "Bash") {
          const cmd = (block.input as { command?: string } | undefined)
            ?.command;
          if (typeof cmd === "string" && block.id) {
            ctx.bashCommands.set(block.id, cmd);
          }
        }
      }
    }
  }

  // User turn with tool_result blocks — the SDK replays tool outputs here.
  if (anyMsg.type === "user" && anyMsg.message?.content) {
    for (const block of anyMsg.message.content) {
      if (block.type !== "tool_result") continue;
      const toolUseId: string | undefined = block.tool_use_id;
      const cmd = toolUseId ? ctx.bashCommands.get(toolUseId) : undefined;
      if (!cmd || !isTestCommand(cmd)) continue;

      const text = extractToolResultText(block.content);
      if (!text) continue;
      const parsed = parseTestOutput(text);
      if (parsed) {
        await emitTestRun(opts, phase, parsed);
      }
      // Coverage is usually written to disk during the test run.
      await samplePhaseCoverage(opts, phase, ctx, { source: "tool-result" });
    }
  }
}

function extractToolResultText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const c of content) {
    if (c && typeof c === "object" && (c as { type?: string }).type === "text") {
      const t = (c as { text?: unknown }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

async function emitTestRun(
  opts: RunOptions,
  phase: Phase,
  parsed: { passed: number; failed: number; skipped: number; total: number },
): Promise<void> {
  await emit(opts, {
    ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
    type: "TestRun",
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    total: parsed.total,
  });
  const vitals = await readVitals(opts.repoRoot);
  if (!vitals) return;
  const updated: Vitals = {
    ...vitals,
    tests: {
      total: parsed.total,
      passing: parsed.passed,
      failing: parsed.failed,
      skipped: parsed.skipped,
    },
  };
  await writeVitals(opts.repoRoot, updated);
}

async function samplePhaseCoverage(
  opts: RunOptions,
  phase: Phase,
  ctx: PhaseContext,
  { source }: { source: string },
): Promise<void> {
  const snap = readCoverageSnapshot(opts.repoRoot);
  if (!snap) return;
  const key = coverageKey(snap);
  if (key === ctx.lastCoverageKey) return;
  ctx.lastCoverageKey = key;

  const vitals = await readVitals(opts.repoRoot);
  if (!vitals) return;

  const before = vitals.coverage.current ?? vitals.coverage.baseline ?? snap;
  await emit(opts, {
    ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
    type: "CoverageDelta",
    before,
    after: snap,
  });

  const nextBaseline = vitals.coverage.baseline ?? snap;
  const updated: Vitals = {
    ...vitals,
    coverage: {
      baseline: nextBaseline,
      current: snap,
    },
  };
  await writeVitals(opts.repoRoot, updated);
  void source; // reserved for future debug logs
}

function coverageKey(s: CoverageSnapshot): string {
  return [s.statements, s.branches, s.functions, s.lines]
    .map((v) => (typeof v === "number" ? v.toFixed(2) : "-"))
    .join("|");
}

function summarizeToolInput(tool: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const i = input as Record<string, unknown>;
  if (tool === "Write" || tool === "Edit") {
    return typeof i.file_path === "string" ? i.file_path : undefined;
  }
  if (tool === "Bash") {
    return typeof i.command === "string" ? i.command.slice(0, 120) : undefined;
  }
  if (tool === "Read") {
    return typeof i.file_path === "string" ? i.file_path : undefined;
  }
  return undefined;
}

async function emit(opts: RunOptions, event: SurgeryEvent): Promise<void> {
  await appendEvent(opts.repoRoot, event);
}
