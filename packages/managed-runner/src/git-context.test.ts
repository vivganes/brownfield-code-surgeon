import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveBaseBranch, resolveRepoUrl } from "./git-context.js";

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
