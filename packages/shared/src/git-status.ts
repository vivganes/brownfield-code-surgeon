import { execFileSync } from "node:child_process";

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface ChangedFile {
  status: ChangeStatus;
  path: string;
  /** For renames, the previous path. */
  fromPath?: string;
}

export interface ChangesResult {
  available: boolean;
  baseline: string | null;
  files: ChangedFile[];
  reason?: string;
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Returns the current HEAD SHA, or null if the repo has no commits or isn't a
 * git repo at all. Never throws.
 */
export function readHeadSha(repoRoot: string): string | null {
  try {
    return git(repoRoot, ["rev-parse", "HEAD"]) || null;
  } catch {
    return null;
  }
}

const STATUS_MAP: Record<string, ChangeStatus> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "renamed",
  T: "modified",
};

function parseDiffStatus(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    const code = parts[0];
    if (!code) continue;
    const head = code[0];
    if (!head) continue;
    if (head === "R" || head === "C") {
      const fromPath = parts[1];
      const path = parts[2];
      if (fromPath && path) {
        files.push({ status: "renamed", path, fromPath });
      }
      continue;
    }
    const status = STATUS_MAP[head];
    const p = parts[1];
    if (status && p) files.push({ status, path: p });
  }
  return files;
}

function parseUntracked(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    files.push({ status: "untracked", path: line });
  }
  return files;
}

/**
 * Computes the surgical diff: what's changed in `repoRoot` since `baseline`,
 * plus untracked files. Returns `{ available: false }` when not a git repo or
 * no baseline is recorded — callers can render an empty state.
 */
export function readChangesSince(
  repoRoot: string,
  baseline: string | null,
): ChangesResult {
  if (!baseline) {
    return { available: false, baseline: null, files: [], reason: "no baseline recorded" };
  }
  try {
    const tracked = git(repoRoot, ["diff", "--name-status", baseline]);
    const untracked = git(repoRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    const files = [...parseDiffStatus(tracked), ...parseUntracked(untracked)];
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { available: true, baseline, files };
  } catch (err) {
    return {
      available: false,
      baseline,
      files: [],
      reason: `git error: ${(err as Error).message}`,
    };
  }
}
