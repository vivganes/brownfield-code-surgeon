import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveBaseBranch,
  resolveCurrentBranch,
  resolveRepoUrl,
} from "./git-context.js";

describe("resolveRepoUrl / resolveBaseBranch (no-repo behavior)", () => {
  it("returns undefined for resolveRepoUrl in a non-repo dir", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mr-norepo-"));
    expect(resolveRepoUrl(tmp)).toBeUndefined();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("falls back to 'main' for resolveBaseBranch in a non-repo dir", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mr-norepo-"));
    expect(resolveBaseBranch(tmp)).toBe("main");
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe("resolveCurrentBranch", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mr-curbranch-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns undefined in a non-repo dir", () => {
    expect(resolveCurrentBranch(tmp)).toBeUndefined();
  });

  it("returns the current branch name after a commit", () => {
    execSync("git init -q -b main", { cwd: tmp });
    execSync(`git config user.email "t@t.io" && git config user.name "T"`, {
      cwd: tmp,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    });
    fs.writeFileSync(path.join(tmp, "f.txt"), "x");
    execSync("git add f.txt && git commit -q -m init", {
      cwd: tmp,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    });
    expect(resolveCurrentBranch(tmp)).toBe("main");

    execSync("git checkout -q -b feature/x", { cwd: tmp });
    expect(resolveCurrentBranch(tmp)).toBe("feature/x");
  });

  it("returns undefined when HEAD is detached", () => {
    execSync("git init -q -b main", { cwd: tmp });
    execSync(`git config user.email "t@t.io" && git config user.name "T"`, {
      cwd: tmp,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    });
    fs.writeFileSync(path.join(tmp, "f.txt"), "x");
    execSync("git add f.txt && git commit -q -m c1", {
      cwd: tmp,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    });
    const sha = execSync("git rev-parse HEAD", { cwd: tmp }).toString().trim();
    execSync(`git checkout -q ${sha}`, { cwd: tmp });
    expect(resolveCurrentBranch(tmp)).toBeUndefined();
  });
});
