/**
 * Coverage tests for require-approval.ts.
 * We simulate what main() does by calling run() and routing through process mocks.
 * The main() function guard (import.meta.url check) cannot fire in Vitest's
 * module environment, so we focus on maximising coverage of the run() logic paths.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./require-approval.js";

function mkTmp(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ra-cov-"));
  fs.writeFileSync(path.join(tmp, "package.json"), "{}");
  return tmp;
}

describe("require-approval run() — extra coverage paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("approved phase: run() stdout written, exit 0 (main() simulation)", () => {
    const tmp = mkTmp();
    const approvalsDir = path.join(tmp, "plan", ".approvals");
    fs.mkdirSync(approvalsDir, { recursive: true });
    fs.writeFileSync(path.join(approvalsDir, "plan.ok"), "{}");

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    try {
      const result = run({ argv: ["plan"], cwd: tmp });
      // Replicate main() body (lines 45-48):
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);

      expect(result.exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("approved"));
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("invalid phase: run() stderr written, exit 1 (main() simulation)", () => {
    const tmp = mkTmp();
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    try {
      const result = run({ argv: [], cwd: tmp });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Usage"));
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("missing approval: run() stderr written, exit 2 (main() simulation)", () => {
    const tmp = mkTmp();
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    try {
      const result = run({ argv: ["map"], cwd: tmp });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("not approved"));
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
