import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readChangesSince, readHeadSha } from "./git-status.js";

function run(repo: string, ...args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}

describe("git-status", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "git-status-"));
    run(repo, "init", "-q", "-b", "main");
    run(repo, "config", "user.email", "test@example.com");
    run(repo, "config", "user.name", "test");
    writeFileSync(path.join(repo, "a.txt"), "alpha\n", "utf8");
    writeFileSync(path.join(repo, "b.txt"), "beta\n", "utf8");
    run(repo, "add", ".");
    run(repo, "commit", "-q", "-m", "initial");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("readHeadSha returns a 40-char SHA for a repo with commits", () => {
    const sha = readHeadSha(repo);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("readHeadSha returns null when path is not a git repo", () => {
    const notRepo = mkdtempSync(path.join(tmpdir(), "not-a-repo-"));
    try {
      expect(readHeadSha(notRepo)).toBeNull();
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });

  it("readChangesSince returns available=false when baseline is null", () => {
    const r = readChangesSince(repo, null);
    expect(r.available).toBe(false);
    expect(r.files).toEqual([]);
    expect(r.reason).toMatch(/baseline/i);
  });

  it("returns no files when nothing has changed since baseline", () => {
    const sha = readHeadSha(repo)!;
    const r = readChangesSince(repo, sha);
    expect(r.available).toBe(true);
    expect(r.files).toEqual([]);
  });

  it("detects modified, added (committed), deleted, and untracked files", () => {
    const sha = readHeadSha(repo)!;

    // Modify a tracked file (committed).
    writeFileSync(path.join(repo, "a.txt"), "alpha-v2\n", "utf8");
    // Delete a tracked file (committed).
    rmSync(path.join(repo, "b.txt"));
    // Add a new tracked file (committed).
    writeFileSync(path.join(repo, "c.txt"), "gamma\n", "utf8");
    run(repo, "add", "-A");
    run(repo, "commit", "-q", "-m", "edits");

    // Add an untracked file (not committed).
    writeFileSync(path.join(repo, "d.txt"), "delta\n", "utf8");

    const r = readChangesSince(repo, sha);
    expect(r.available).toBe(true);
    const byPath = Object.fromEntries(r.files.map((f) => [f.path, f.status]));
    expect(byPath["a.txt"]).toBe("modified");
    expect(byPath["b.txt"]).toBe("deleted");
    expect(byPath["c.txt"]).toBe("added");
    expect(byPath["d.txt"]).toBe("untracked");
  });

  it("detects renames", () => {
    const sha = readHeadSha(repo)!;
    run(repo, "mv", "a.txt", "renamed.txt");
    run(repo, "commit", "-q", "-m", "rename");

    const r = readChangesSince(repo, sha);
    const renamed = r.files.find((f) => f.status === "renamed");
    expect(renamed).toBeDefined();
    expect(renamed?.path).toBe("renamed.txt");
    expect(renamed?.fromPath).toBe("a.txt");
  });

  it("returns available=false with reason when baseline SHA is bogus", () => {
    const r = readChangesSince(repo, "deadbeef".repeat(5));
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/git error/i);
  });

  it("sorts files by path", () => {
    const sha = readHeadSha(repo)!;
    writeFileSync(path.join(repo, "z.txt"), "z\n");
    writeFileSync(path.join(repo, "m.txt"), "m\n");
    const r = readChangesSince(repo, sha);
    const paths = r.files.map((f) => f.path);
    expect([...paths].sort()).toEqual(paths);
  });
});
