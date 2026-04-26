/**
 * Coverage tests for approvals.ts lines 36-37, 60-62.
 * Line 36-37: readApproval re-throws non-ENOENT errors.
 * Lines 60-62: waitForApproval console.log throttle.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readApproval, waitForApproval, writeApproval } from "./approvals.js";

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "surgery-app-cov-"));
}

describe("approvals coverage", () => {
  it("readApproval re-throws errors that are not ENOENT", async () => {
    const repo = mkRepo();
    try {
      // Create a directory where the file should be so readFile throws EISDIR
      const approvalDir = path.join(repo, "plan", ".approvals", "plan.ok");
      fs.mkdirSync(approvalDir, { recursive: true });

      await expect(readApproval(repo, "plan")).rejects.toThrow();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("waitForApproval logs a waiting message after 30s without approval", async () => {
    // We mock Date.now() to simulate 31s having passed, triggering lines 60-62.
    // The waitForApproval logic:
    //   let lastLog = Date.now();           <-- call #1
    //   while (Date.now() < deadline) {    <-- call #2 (while check)
    //     ...
    //     if (Date.now() - lastLog >= 30_000) { <-- call #3: needs to be lastLog+31s
    //       console.log(...)
    //       lastLog = Date.now();           <-- call #4
    //     }
    //     await setTimeout(pollMs)
    //   }  // while check call #5...
    // We need: call#1=base, call#2=base (< deadline), call#3=base+31s, call#4=base+31s,
    //          call#5=base+62s (>= deadline to exit)
    const repo = mkRepo();
    const consoleSpy = vi.spyOn(console, "log").mockReturnValue(undefined);

    const base = 1_000_000;
    let callCount = 0;
    vi.spyOn(Date, "now").mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return base;                   // lastLog init
      if (callCount === 2) return base + 1;               // while check — inside deadline (base+60s)
      if (callCount === 3) return base + 31_000;          // if-check — triggers log
      if (callCount === 4) return base + 31_000;          // lastLog = Date.now()
      return base + 200_000;                              // while check — past deadline → exit
    });

    try {
      await expect(
        waitForApproval(repo, "plan", { pollMs: 10, timeoutMs: 60_000 }),
      ).rejects.toThrow(/Timed out/);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("still waiting"),
      );
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(repo, { recursive: true, force: true });
    }
  }, 10_000);
});
