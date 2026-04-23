import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type EngineKind = "sdk" | "plugin";

export interface StartArgs {
  repoRoot: string;
  request: string;
  engine?: EngineKind;
  autoApprove?: boolean;
  runId?: string;
  model?: string;
  thinking?: "off" | "low" | "medium" | "high";
}

export interface RunState {
  engine: EngineKind;
  pid: number;
  startedAt: string;
  request: string;
  runId: string | null;
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
    if (engine !== "sdk") {
      throw new Error("only the sdk engine can be spawned from the UI backend");
    }
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

    this.logs = [];
    this.appendLog(`[sdk-runner] spawn: ${process.execPath} ${cliArgs.join(" ")}`);
    const child = spawn(process.execPath, cliArgs, {
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
      this.appendLog(`[sdk-runner] spawn error: ${String(err)}`);
      this.child = null;
    });
    child.on("exit", (code, signal) => {
      this.appendLog(
        `[sdk-runner] exited with code=${code} signal=${signal ?? "none"}`,
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

export const runManager = new RunManager();
