import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
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

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const WATCHDOG_INTERVAL_MS = 30_000;

export class SdkSessionError extends Error {
  constructor(
    public readonly subtype: string,
    public readonly raw: unknown,
  ) {
    super(`SDK session ended with ${subtype}`);
    this.name = "SdkSessionError";
  }
}

export class InactivityTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`SDK iterator idle for ${timeoutMs}ms`);
    this.name = "InactivityTimeoutError";
  }
}

export interface RunOptions {
  repoRoot: string;
  request: string;
  phases: Phase[];
  runId: string;
  autoApprove: boolean;
  model?: string;
  thinking?: ThinkingLevel;
  /** Run `git add -A && git commit --allow-empty` after each phase completes. */
  commitPerPhase?: boolean;
  /** SDK permission mode. Defaults to "acceptEdits". */
  permissionMode?: "acceptEdits" | "bypassPermissions";
  /** Tool names to auto-allow without prompting. */
  allowedTools?: string[];
  /** Injected for tests; defaults to a thin wrapper around execSync. */
  git?: GitExec;
}

export type GitExec = (cmd: string, cwd: string) => void;

const defaultGit: GitExec = (cmd, cwd) => {
  execSync(cmd, { cwd, stdio: "ignore" });
};

/**
 * Run `git add -A && git commit --allow-empty` for the given phase. We
 * deliberately do NOT push here: pushing is the orchestrator's concern, run
 * once at the end of the local stage rather than after every phase. Empty
 * commits stay allowed so the per-phase audit trail is linear even when a
 * phase only touched gitignored scaffolding.
 */
export function commitPhase(
  repoRoot: string,
  phase: Phase,
  runId: string,
  git: GitExec = defaultGit,
): void {
  try {
    git("git add -A", repoRoot);
    const msg = `surgery(${phase}): phase complete [${runId}]`;
    git(`git commit --allow-empty -m ${JSON.stringify(msg)}`, repoRoot);
  } catch (err) {
    // Non-fatal: the run continues. The error surfaces in stderr via execSync.
    console.warn(`[sdk-runner] commit for "${phase}" failed: ${String(err)}`);
  }
}

interface PhaseContext {
  // tool_use_id -> command executed, so we can correlate tool_result messages.
  bashCommands: Map<string, string>;
  // fingerprint of last seen coverage snapshot, so we don't re-emit identical deltas.
  lastCoverageKey: string | null;
  // tool_use_id -> tool_name for calls that haven't received a tool_result yet.
  // Used by the watchdog to emit heartbeat events during long-running tools (e.g. Agent).
  pendingToolCalls: Map<string, string>;
}

export async function runPipeline(opts: RunOptions): Promise<void> {
  await loadOrInitVitals(opts.repoRoot, opts.runId);
  await recoverStalePhases(opts);

  for (const phase of opts.phases) {
    await runPhase(phase, opts);
  }
}

async function recoverStalePhases(opts: RunOptions): Promise<void> {
  const vitals = await readVitals(opts.repoRoot);
  if (!vitals) return;
  const stale = (Object.keys(vitals.phaseStatus) as Phase[]).filter(
    (p) => vitals.phaseStatus[p] === "running",
  );
  for (const p of stale) {
    console.warn(`[sdk-runner] resetting stale phase "${p}" (was running) → failed`);
    await setPhaseStatus(opts.repoRoot, p, "failed");
    await emit(opts, {
      ...makeBaseEvent({ phase: p, engine: ENGINE, runId: opts.runId }),
      type: "PhaseEnd",
      outcome: "failed",
      durationMs: 0,
      errorMessage: "phase recovered from previous crash",
    });
  }
}

type ActivePhase = { phase: Phase; opts: RunOptions };
let activePhase: ActivePhase | null = null;

export function markPhaseFailedSync(
  repoRoot: string,
  phase: Phase,
  reason: string,
): void {
  try {
    const vitalsPath = path.join(repoRoot, "plan", "vitals.json");
    const raw = readFileSync(vitalsPath, "utf8");
    const v = JSON.parse(raw);
    v.phaseStatus[phase] = "failed";
    if (v.currentPhase === phase) v.currentPhase = null;
    v.lastUpdated = new Date().toISOString();
    writeFileSync(vitalsPath, JSON.stringify(v, null, 2), "utf8");
    console.error(`[sdk-runner] marked phase "${phase}" failed: ${reason}`);
  } catch (err) {
    console.error("[sdk-runner] failed to write fatal vitals:", err);
  }
}

export function markActivePhaseFailedSync(reason: string): void {
  if (!activePhase) return;
  markPhaseFailedSync(activePhase.opts.repoRoot, activePhase.phase, reason);
}

async function runPhase(phase: Phase, opts: RunOptions): Promise<void> {
  const startedAt = Date.now();
  const ctx: PhaseContext = { bashCommands: new Map(), lastCoverageKey: null, pendingToolCalls: new Map() };
  activePhase = { phase, opts };

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

    if (opts.commitPerPhase) {
      commitPhase(opts.repoRoot, phase, opts.runId, opts.git);
    }
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
  } finally {
    activePhase = null;
  }
}

export function buildPhasePrompt(phase: Phase, opts: RunOptions): string {
  const { body } = loadPrompt(phase);
  const lines = [
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
  ];

  if (phase === "plan") {
    lines.push("Produce `plan/plan.md` with the feature description, change points, impact analysis, risk assessment, and success criteria.");
  } else if (phase === "map") {
    lines.push("Produce `plan/seams-and-dependencies.md` with classes to test, seams identified, dependency graph, testing obstacles, and testing strategy.");
  }

  return lines.join("\n");
}

async function streamQuery(
  prompt: string,
  opts: RunOptions,
  phase: Phase,
  ctx: PhaseContext,
): Promise<void> {
  const thinkingTokens = opts.thinking ? THINKING_TOKENS[opts.thinking] : undefined;
  const iterable = query({
    prompt,
    options: {
      cwd: opts.repoRoot,
      permissionMode: opts.permissionMode ?? "acceptEdits",
      ...(opts.allowedTools && opts.allowedTools.length > 0
        ? { allowedTools: opts.allowedTools }
        : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(typeof thinkingTokens === "number" && thinkingTokens > 0
        ? { maxThinkingTokens: thinkingTokens }
        : {}),
    },
  });

  // Grab the iterator explicitly so the watchdog can call .return() on the
  // SAME instance that the consumer loop is awaiting.
  const iterator = (iterable as AsyncIterable<SDKMessage>)[Symbol.asyncIterator]();

  let lastActivity = Date.now();
  let watchdogFired = false;
  const watchdog = setInterval(() => {
    const idleMs = Date.now() - lastActivity;
    if (idleMs > INACTIVITY_TIMEOUT_MS) {
      watchdogFired = true;
      iterator.return?.(undefined);
      return;
    }
    // Emit a heartbeat ToolUse for each tool call that is still pending (no
    // tool_result received yet). This keeps the JSONL and UI alive during
    // long-running sub-agent invocations where the iterator is otherwise silent.
    for (const [, toolName] of ctx.pendingToolCalls) {
      void emit(opts, {
        ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
        type: "ToolUse",
        tool: toolName,
        summary: `still running… (${Math.round(idleMs / 1000)}s elapsed)`,
        blocked: false,
      });
    }
  }, WATCHDOG_INTERVAL_MS);

  try {
    while (true) {
      const { done, value } = await iterator.next();
      if (done) break;
      lastActivity = Date.now();
      await onMessage(value, opts, phase, ctx);
    }
    if (watchdogFired) {
      throw new InactivityTimeoutError(INACTIVITY_TIMEOUT_MS);
    }
  } finally {
    clearInterval(watchdog);
  }
}

async function onMessage(
  message: SDKMessage,
  opts: RunOptions,
  phase: Phase,
  ctx: PhaseContext,
): Promise<void> {
  const anyMsg = message as any;

  // Terminal SDK signal. `success` = clean end. Any `error_*` subtype means
  // the SDK already exhausted its retries — surface as a phase failure.
  // Emit a blocked ToolUse event for each permission denial so the UI can
  // surface them.
  if (anyMsg.type === "result") {
    const denials: { tool_name?: string; tool_input?: Record<string, unknown> }[] =
      Array.isArray(anyMsg.permission_denials) ? anyMsg.permission_denials : [];
    for (const d of denials) {
      await emit(opts, {
        ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
        type: "ToolUse",
        tool: d.tool_name ?? "unknown",
        summary: summarizeToolInput(d.tool_name ?? "", d.tool_input ?? {}),
        blocked: true,
      });
    }
    if (typeof anyMsg.subtype === "string" && anyMsg.subtype.startsWith("error_")) {
      throw new SdkSessionError(anyMsg.subtype, anyMsg);
    }
    return;
  }

  // Mid-stream system warnings (transient, SDK is retrying). Log only.
  if (anyMsg.type === "system" && anyMsg.subtype === "error") {
    console.warn("[sdk-runner] transient system error:", anyMsg);
    return;
  }

  // Assistant turn — capture tool_use blocks for the ToolUse timeline and
  // remember Bash commands so we can match them to their eventual tool_result.
  if (anyMsg.type === "assistant" && anyMsg.message?.content) {
    for (const block of anyMsg.message.content) {
      if (block.type === "tool_use") {
        if (block.id) ctx.pendingToolCalls.set(block.id, block.name);
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
      if (toolUseId) ctx.pendingToolCalls.delete(toolUseId);
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
