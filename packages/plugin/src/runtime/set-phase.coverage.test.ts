/**
 * Coverage tests for set-phase.ts lines 58-63, 66-67 (the main() function body).
 * We replicate what main() does by calling run() and piping results, since the
 * import.meta.url guard won't fire in a test environment.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./set-phase.js";

function mkTmp(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sp-main-cov-"));
  fs.writeFileSync(path.join(tmp, "package.json"), "{}");
  return tmp;
}

describe("set-phase main() coverage via run() + process mocks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stdout path: run() returns stdout, simulate main() writing it and exiting 0", () => {
    const tmp = mkTmp();
    try {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const result = run({ argv: ["plan", "add dark mode"], cwd: tmp });

      // Simulate exactly what main() does (lines 59-63):
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);

      expect(result.exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Phase set to: plan"));
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("stderr path: invalid argv writes stderr and exits 1", () => {
    const tmp = mkTmp();
    try {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const result = run({ argv: ["bogus"], cwd: tmp });

      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);

      expect(result.exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Usage"));
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("empty argv: no stdout, stderr written, exits 1", () => {
    const tmp = mkTmp();
    try {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

      const result = run({ argv: [], cwd: tmp });

      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);

      expect(stderrSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
