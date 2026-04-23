#!/usr/bin/env node
import { execSync } from "node:child_process";
import {
  readStdin,
  resolveRepoRoot,
  readVitals,
  writeVitals,
  appendEvent,
  baseEvent,
  PHASES,
  type Vitals,
  type Phase,
  type HookInput,
} from "./_lib.js";

export type CommitFn = (repoRoot: string, phase: Phase, runId: string) => void;

export interface RunOptions {
  input?: HookInput;
  env?: NodeJS.ProcessEnv;
  commit?: CommitFn;
  now?: () => number;
}

export interface RunResult {
  stdout: string;
  exitCode: number;
}

export function defaultCommit(
  repoRoot: string,
  phase: Phase,
  runId: string,
): void {
  try {
    execSync("git add -A", { cwd: repoRoot, stdio: "ignore" });
    const msg = `surgery(${phase}): phase complete [${runId}]`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, {
      cwd: repoRoot,
      stdio: "ignore",
    });
  } catch {
    // Not a git repo, nothing staged, or git unavailable — silently continue.
  }
}

export function run(opts: RunOptions = {}): RunResult {
  const input = opts.input ?? {};
  const env = opts.env ?? process.env;
  const commit = opts.commit ?? defaultCommit;
  const now = opts.now ?? Date.now;
  const repoRoot = resolveRepoRoot(input, env);
  const vitals = readVitals(repoRoot);
  if (!vitals || !vitals.currentPhase) return { stdout: "", exitCode: 0 };

  const phase = vitals.currentPhase as Phase;
  const startedAt = vitals.phaseStartedAt?.[phase];
  const durationMs = startedAt
    ? Math.max(0, now() - new Date(startedAt).getTime())
    : 0;

  appendEvent(repoRoot, {
    ...baseEvent(repoRoot, { phase }),
    type: "PhaseEnd",
    outcome: "completed",
    durationMs,
  });

  const idx = PHASES.indexOf(phase);
  const next = idx >= 0 && idx < PHASES.length - 1 ? PHASES[idx + 1] : null;

  const updated: Vitals = {
    ...vitals,
    currentPhase: next ?? null,
    phaseStatus: {
      ...vitals.phaseStatus,
      [phase]: "awaiting-approval",
    },
  };
  writeVitals(repoRoot, updated);

  appendEvent(repoRoot, {
    ...baseEvent(repoRoot, { phase }),
    type: "ApprovalRequested",
    artifacts: vitals.artifacts ?? [],
    summary: `Phase "${phase}" completed. Review artifacts and approve to continue.`,
  });

  commit(repoRoot, phase, updated.runId);

  return { stdout: "", exitCode: 0 };
}

async function main() {
  const input = await readStdin();
  const result = run({ input });
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    process.stderr.write(`[subagent-stop hook] ${String(err)}\n`);
    process.exit(0);
  });
}
