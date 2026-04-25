import { execSync } from "node:child_process";

/**
 * Returns the URL of the `origin` remote, or undefined if not in a repo or
 * origin is unset.
 */
export function resolveRepoUrl(repoRoot: string): string | undefined {
  try {
    const out = execSync("git remote get-url origin", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the name of the currently checked-out branch, or undefined for
 * detached HEAD / non-repo / no commits.
 */
export function resolveCurrentBranch(repoRoot: string): string | undefined {
  try {
    const out = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!out || out === "HEAD") return undefined; // HEAD = detached
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Returns the default base branch (e.g. "main") by resolving `origin/HEAD`.
 * Falls back to "main" when origin/HEAD is unset.
 */
export function resolveBaseBranch(repoRoot: string): string {
  try {
    const sym = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    // sym looks like "refs/remotes/origin/main"
    const match = sym.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) return match[1];
  } catch {
    // fall through
  }
  return "main";
}

