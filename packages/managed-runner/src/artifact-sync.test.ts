import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyArtifactWrite } from "./artifact-sync.js";

describe("applyArtifactWrite", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-sync-"));
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("creates parent directories and writes the file for kind=write", () => {
    const r = applyArtifactWrite(repo, {
      path: "plan/plan.md",
      kind: "write",
      content: "## plan\nstep 1\n",
    });
    expect(r.applied).toBe(true);
    expect(fs.readFileSync(path.join(repo, "plan/plan.md"), "utf8")).toBe(
      "## plan\nstep 1\n",
    );
  });

  it("overwrites an existing file on subsequent writes", () => {
    fs.mkdirSync(path.join(repo, "plan"));
    fs.writeFileSync(path.join(repo, "plan/plan.md"), "old");
    const r = applyArtifactWrite(repo, {
      path: "plan/plan.md",
      kind: "write",
      content: "new",
    });
    expect(r.applied).toBe(true);
    expect(fs.readFileSync(path.join(repo, "plan/plan.md"), "utf8")).toBe("new");
  });

  it("applies an edit replacement on the first match", () => {
    fs.mkdirSync(path.join(repo, "plan"));
    fs.writeFileSync(path.join(repo, "plan/plan.md"), "alpha beta gamma");
    const r = applyArtifactWrite(repo, {
      path: "plan/plan.md",
      kind: "edit",
      oldString: "beta",
      newString: "BETA",
    });
    expect(r.applied).toBe(true);
    expect(fs.readFileSync(path.join(repo, "plan/plan.md"), "utf8")).toBe(
      "alpha BETA gamma",
    );
  });

  it("returns edit-no-local-file when the target does not exist locally", () => {
    const r = applyArtifactWrite(repo, {
      path: "plan/plan.md",
      kind: "edit",
      oldString: "x",
      newString: "y",
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("edit-no-local-file");
  });

  it("returns edit-no-match when oldString is absent", () => {
    fs.mkdirSync(path.join(repo, "plan"));
    fs.writeFileSync(path.join(repo, "plan/plan.md"), "alpha gamma");
    const r = applyArtifactWrite(repo, {
      path: "plan/plan.md",
      kind: "edit",
      oldString: "beta",
      newString: "BETA",
    });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("edit-no-match");
  });

  it("skips writes with no content", () => {
    const r = applyArtifactWrite(repo, {
      path: "plan/plan.md",
      kind: "write",
    });
    expect(r.applied).toBe(false);
  });
});
