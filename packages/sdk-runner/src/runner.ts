import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  appendEvent,
  makeBaseEvent,
  waitForApproval,
  isApproved,
  type Phase,
  type SurgeryEvent,
} from "@brownfield-surgeon/shared";
import { loadPrompt } from "@brownfield-surgeon/core-prompts";
import { loadOrInitVitals, setPhaseStatus } from "./vitals-updater.js";

const ENGINE = "sdk" as const;

export interface RunOptions {
  repoRoot: string;
  request: string;
  phases: Phase[];
  runId: string;
  autoApprove: boolean;
}

export async function runPipeline(opts: RunOptions): Promise<void> {
  await loadOrInitVitals(opts.repoRoot, opts.runId);

  for (const phase of opts.phases) {
    await runPhase(phase, opts);
  }
}

async function runPhase(phase: Phase, opts: RunOptions): Promise<void> {
  const startedAt = Date.now();
  await emit(opts, {
    ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
    type: "PhaseStart",
    request: opts.request,
  });
  await setPhaseStatus(opts.repoRoot, phase, "running");

  try {
    const prompt = buildPhasePrompt(phase, opts);
    await streamQuery(prompt, opts, phase);

    await setPhaseStatus(opts.repoRoot, phase, "awaiting-approval");
    await emit(opts, {
      ...makeBaseEvent({ phase, engine: ENGINE, runId: opts.runId }),
      type: "ApprovalRequested",
      summary: `phase "${phase}" complete — awaiting human approval`,
      artifacts: [],
    });

    if (opts.autoApprove) {
      // Auto-approval still writes the ok file so other tools observe the same invariant.
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
): Promise<void> {
  const iter = query({
    prompt,
    options: {
      cwd: opts.repoRoot,
      permissionMode: "acceptEdits",
    },
  });
  for await (const message of iter as AsyncIterable<SDKMessage>) {
    await onMessage(message, opts, phase);
  }
}

async function onMessage(message: SDKMessage, opts: RunOptions, phase: Phase): Promise<void> {
  // Mirror tool-use and text events onto the surgery timeline so the UI shows SDK runs
  // with the same granularity as the plugin.
  const anyMsg = message as any;
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
      }
    }
  }
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
