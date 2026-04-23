import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./require-approval.js";

function mkTmp(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "require-approval-test-"));
  fs.writeFileSync(path.join(tmp, "package.json"), "{}");
  return tmp;
}

describe("require-approval run()", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects missing/unknown phase with exit code 1", () => {
    expect(run({ argv: [], cwd: tmp }).exitCode).toBe(1);
    expect(run({ argv: ["nope"], cwd: tmp }).exitCode).toBe(1);
  });

  it("exits 2 with a clear error when approval token is missing", () => {
    const r = run({ argv: ["plan"], cwd: tmp });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/not approved/);
  });

  it("exits 0 when the approval token exists", () => {
    const approvalsDir = path.join(tmp, "plan", ".approvals");
    fs.mkdirSync(approvalsDir, { recursive: true });
    fs.writeFileSync(path.join(approvalsDir, "map.ok"), "{}");

    const r = run({ argv: ["map"], cwd: tmp });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Phase map approved — continuing/);
  });
});
