import { execSync } from "node:child_process";

export type GitExec = (cmd: string, cwd: string) => string;

const defaultExec: GitExec = (cmd, cwd) =>
  execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();

export interface PullResult {
  ok: boolean;
  fetched: boolean;
  merged: boolean;
  message: string;
}

/**
 * Fetch + fast-forward merge the scratch branch from origin. Best-effort —
 * any error is captured in the result rather than thrown so the heartbeat
 * loop can keep ticking.
 */
export function pullScratchOnce(
  repoRoot: string,
  scratchBranch: string,
  exec: GitExec = defaultExec,
): PullResult {
  // Validate up front — an unsafe branch name is a programmer error, not a
  // recoverable network failure. Surface it loudly.
  const safeBranch = shellArg(scratchBranch);
  try {
    exec(`git fetch origin ${safeBranch}`, repoRoot);
  } catch (err) {
    return { ok: false, fetched: false, merged: false, message: String(err) };
  }
  try {
    exec(`git merge --ff-only FETCH_HEAD`, repoRoot);
    return { ok: true, fetched: true, merged: true, message: "fast-forwarded" };
  } catch (err) {
    // Common case: nothing to merge yet (branch doesn't exist on remote, or
    // local is already at FETCH_HEAD). Treat as a non-error tick.
    return {
      ok: true,
      fetched: true,
      merged: false,
      message: `no fast-forward: ${truncate(String(err), 200)}`,
    };
  }
}

export interface HeartbeatHandle {
  stop(): void;
}

/**
 * Starts a setInterval that pulls the scratch branch periodically until
 * stop() is called. The first tick fires after `intervalMs` (not immediately);
 * the caller can run pullScratchOnce manually before starting if it wants
 * an immediate sync.
 */
export function startHeartbeat(args: {
  repoRoot: string;
  scratchBranch: string;
  intervalMs: number;
  onTick?: (result: PullResult) => void;
  exec?: GitExec;
}): HeartbeatHandle {
  const id = setInterval(() => {
    const r = pullScratchOnce(args.repoRoot, args.scratchBranch, args.exec);
    args.onTick?.(r);
  }, args.intervalMs);
  // Don't keep the event loop alive for the heartbeat alone.
  if (typeof id === "object" && typeof (id as { unref?: () => void }).unref === "function") {
    (id as { unref: () => void }).unref();
  }
  return {
    stop() {
      clearInterval(id);
    },
  };
}

function shellArg(s: string): string {
  // Refuse anything weird; branch names in our flow are surgery/<runId>/finish.
  if (!/^[A-Za-z0-9._\-/]+$/.test(s)) {
    throw new Error(`unsafe branch name: ${s}`);
  }
  return s;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
