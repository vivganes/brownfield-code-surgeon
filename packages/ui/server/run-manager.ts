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
}

interface SpawnPlan {
  cliPath: string;
  cliArgs: string[];
  logPrefix: string;
}

class RunManager {
  private child: ChildProcess | null = null;
  private state: RunState | null = null;
  private logs: string[] = [];

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
      // Plugin runs inside Claude Code itself, driven by slash commands. The
      // backend does not spawn it.
      throw new Error(
        "the plugin engine is user-driven; trigger /surgery from Claude Code instead",
      );
    }

    const plan =
      engine === "managed"
        ? planManagedRunner(args)
        : planSdkRunner(args);

    this.logs = [];
    this.appendLog(
      `[${plan.logPrefix}] spawn: ${process.execPath} ${plan.cliArgs.join(" ")}`,
    );
    const child = spawn(process.execPath, plan.cliArgs, {
      cwd: args.repoRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    this.state = {
      engine,
      pid: child.pid ?? -1,
      startedAt: new Date().toISOString(),
      request: args.request,
      runId: args.runId ?? null,
    };
    child.stdout?.on("data", (b) => this.appendLog(b.toString()));
    child.stderr?.on("data", (b) => this.appendLog(b.toString()));
    child.on("error", (err) => {
      this.appendLog(`[${plan.logPrefix}] spawn error: ${String(err)}`);
      this.child = null;
    });
    child.on("exit", (code, signal) => {
      this.appendLog(
        `[${plan.logPrefix}] exited with code=${code} signal=${signal ?? "none"}`,
      );
      this.child = null;
    });
    return this.state;
  }

  abort(): boolean {
    if (!this.child) return false;
    this.child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    return true;
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

function planSdkRunner(args: StartArgs): SpawnPlan {
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
  return { cliPath, cliArgs, logPrefix: "sdk-runner" };
}

function planManagedRunner(args: StartArgs): SpawnPlan {
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
  if (m?.agentEnvId) cliArgs.push("--agent-env-id", m.agentEnvId);
  return { cliPath, cliArgs, logPrefix: "managed-runner" };
}

export const runManager = new RunManager();

// Exported for tests.
export const __testing = { planSdkRunner, planManagedRunner };
