import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type EngineKind = "sdk" | "plugin" | "managed";

export interface ManagedFinishArgs {
  /** Optional repo URL; managed-runner derives from `git remote origin` if absent. */
  repoUrl?: string;
  /** Optional base branch; managed-runner derives from `origin/HEAD` if absent. */
  baseBranch?: string;
  /** Optional scratch branch override; defaults to `surgery/<runId>/finish`. */
  scratchBranch?: string;
  /** Anthropic Managed-Agents environment ID (required when engine="managed"). */
  agentEnvId?: string;
}

export interface StartArgs {
  repoRoot: string;
  request: string;
  engine?: EngineKind;
  autoApprove?: boolean;
  runId?: string;
  model?: string;
  thinking?: "off" | "low" | "medium" | "high";
  /** Only consulted when engine === "managed". */
  managed?: ManagedFinishArgs;
}

export interface RunState {
  engine: EngineKind;
  pid: number;
  startedAt: string;
  request: string;
  runId: string | null;
  /** Number of stages in the chain (1 for sdk, 2 for managed). */
  stages: number;
  /** 1-indexed stage currently executing (only meaningful while running). */
  activeStage: number;
}

interface SpawnPlan {
  cliPath: string;
  cliArgs: string[];
  logPrefix: string;
}

const LOCAL_PHASES_FOR_MANAGED = [
  "plan",
  "map",
  "break",
  "cover",
  "implement",
  "refactor",
] as const;

function defaultRunId(): string {
  return `run-${Date.now().toString(36)}`;
}

function defaultScratchBranch(runId: string): string {
  return `surgery/${runId}/finish`;
}

class RunManager {
  private child: ChildProcess | null = null;
  private chain: SpawnPlan[] = [];
  private state: RunState | null = null;
  private logs: string[] = [];
  private aborted = false;

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  getState(): RunState | null {
    return this.state;
  }

  getLogs(): string[] {
    return this.logs.slice(-200);
  }

  start(args: StartArgs): RunState {
    if (this.isRunning()) {
      throw new Error("a run is already in progress");
    }
    const engine: EngineKind = args.engine ?? "sdk";
    if (engine === "plugin") {
      throw new Error(
        "the plugin engine is user-driven; trigger /surgery from Claude Code instead",
      );
    }

    const { plans, runId } = planChain(args);
    this.chain = plans.slice(1);
    this.logs = [];
    this.aborted = false;
    this.state = {
      engine,
      pid: -1,
      startedAt: new Date().toISOString(),
      request: args.request,
      runId,
      stages: plans.length,
      activeStage: 1,
    };
    if (plans.length > 1) {
      this.appendLog(
        `[run-manager] chained dispatch: ${plans.length} stages — ${plans.map((p) => p.logPrefix).join(" → ")}`,
      );
    }
    this.spawnNext(plans[0]!, args.repoRoot);
    return this.state;
  }

  abort(): boolean {
    if (!this.child) return false;
    this.aborted = true;
    this.chain = [];
    this.child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    return true;
  }

  private spawnNext(plan: SpawnPlan, repoRoot: string): void {
    this.appendLog(
      `[${plan.logPrefix}] spawn: ${process.execPath} ${plan.cliArgs.join(" ")}`,
    );
    const child = spawn(process.execPath, plan.cliArgs, {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    if (this.state) {
      this.state = { ...this.state, pid: child.pid ?? -1 };
    }
    child.stdout?.on("data", (b) => this.appendLog(b.toString()));
    child.stderr?.on("data", (b) => this.appendLog(b.toString()));
    child.on("error", (err) => {
      this.appendLog(`[${plan.logPrefix}] spawn error: ${String(err)}`);
      this.child = null;
      this.chain = [];
    });
    child.on("exit", (code, signal) => {
      this.appendLog(
        `[${plan.logPrefix}] exited with code=${code} signal=${signal ?? "none"}`,
      );
      this.child = null;

      // Decide whether to advance the chain.
      const success = code === 0 && !this.aborted;
      const next = success ? this.chain.shift() : undefined;
      if (next) {
        if (this.state) {
          this.state = { ...this.state, activeStage: this.state.activeStage + 1 };
        }
        this.appendLog(
          `[run-manager] stage ${this.state?.activeStage ?? "?"}/${this.state?.stages ?? "?"}: starting ${next.logPrefix}`,
        );
        this.spawnNext(next, repoRoot);
      } else {
        if (!success && this.chain.length > 0) {
          this.appendLog(
            `[run-manager] aborting chain: ${this.chain.length} stage(s) skipped`,
          );
          this.chain = [];
        }
      }
    });
  }

  private appendLog(chunk: string): void {
    for (const line of chunk.split(/\r?\n/)) {
      if (line) this.logs.push(line);
    }
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500);
    }
  }
}

/**
 * Compute the spawn plans for a run. Single-stage for engine=sdk;
 * two-stage for engine=managed (sdk-runner phases 1–6, then managed-runner
 * for Finish on the scratch branch).
 */
export function planChain(args: StartArgs): {
  plans: SpawnPlan[];
  runId: string;
} {
  const engine: EngineKind = args.engine ?? "sdk";
  const runId = args.runId ?? defaultRunId();

  if (engine === "plugin") {
    throw new Error("plugin engine cannot be planned");
  }

  if (engine === "managed") {
    const scratch =
      args.managed?.scratchBranch ?? defaultScratchBranch(runId);
    const sdkStage = planSdkRunner({
      ...args,
      runId,
      phases: [...LOCAL_PHASES_FOR_MANAGED],
      commitPerPhase: true,
      pushTo: scratch,
    });
    const managedStage = planManagedRunner({
      ...args,
      runId,
      managed: {
        ...args.managed,
        scratchBranch: scratch,
        // Cloud session checks out the scratch branch (where 1–6 just landed).
        // Pass via `--checkout-branch`.
      },
      checkoutBranch: scratch,
    });
    return { plans: [sdkStage, managedStage], runId };
  }

  return { plans: [planSdkRunner({ ...args, runId })], runId };
}

interface SdkPlanArgs extends StartArgs {
  phases?: readonly string[];
  commitPerPhase?: boolean;
  pushTo?: string;
}

function planSdkRunner(args: SdkPlanArgs): SpawnPlan {
  const cliPath = path.resolve(
    __dirname,
    "..",
    "..",
    "sdk-runner",
    "dist",
    "cli.js",
  );
  const cliArgs = [
    cliPath,
    "--repo",
    args.repoRoot,
    "--request",
    args.request,
  ];
  if (args.autoApprove) cliArgs.push("--auto-approve");
  if (args.runId) cliArgs.push("--run-id", args.runId);
  if (args.model) cliArgs.push("--model", args.model);
  if (args.thinking) cliArgs.push("--thinking", args.thinking);
  if (args.phases && args.phases.length > 0) {
    cliArgs.push("--phases", args.phases.join(","));
  }
  if (args.commitPerPhase) cliArgs.push("--commit-per-phase");
  if (args.pushTo) cliArgs.push("--push-to", args.pushTo);
  return { cliPath, cliArgs, logPrefix: "sdk-runner" };
}

interface ManagedPlanArgs extends StartArgs {
  /** Branch the cloud should checkout into the container — usually the scratch branch. */
  checkoutBranch?: string;
}

function planManagedRunner(args: ManagedPlanArgs): SpawnPlan {
  const cliPath = path.resolve(
    __dirname,
    "..",
    "..",
    "managed-runner",
    "dist",
    "cli.js",
  );
  const cliArgs = [cliPath, "--repo", args.repoRoot];
  if (args.runId) cliArgs.push("--run-id", args.runId);
  if (args.request) cliArgs.push("--request", args.request);
  if (args.model) cliArgs.push("--model", args.model);
  const m = args.managed;
  if (m?.repoUrl) cliArgs.push("--repo-url", m.repoUrl);
  if (m?.baseBranch) cliArgs.push("--base-branch", m.baseBranch);
  if (m?.scratchBranch) cliArgs.push("--scratch-branch", m.scratchBranch);
  if (args.checkoutBranch) cliArgs.push("--checkout-branch", args.checkoutBranch);
  if (m?.agentEnvId) cliArgs.push("--agent-env-id", m.agentEnvId);
  return { cliPath, cliArgs, logPrefix: "managed-runner" };
}

export const runManager = new RunManager();

// Exported for tests.
export const __testing = {
  planSdkRunner,
  planManagedRunner,
  planChain,
  defaultScratchBranch,
};
