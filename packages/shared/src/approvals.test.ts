import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearApproval,
  isApproved,
  readApproval,
  waitForApproval,
  writeApproval,
} from "./approvals.js";
import { approvalFile } from "./artifacts.js";

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "surgery-app-"));
}

describe("approvals", () => {
  it("isApproved is false before writeApproval, true after", async () => {
    const repo = mkRepo();
    expect(isApproved(repo, "plan")).toBe(false);
    await writeApproval(repo, "plan", { note: "looks good" });
    expect(isApproved(repo, "plan")).toBe(true);
  });

  it("writeApproval persists a valid token readable by readApproval", async () => {
    const repo = mkRepo();
    await writeApproval(repo, "cover", { approvedBy: "vivek", note: "43 tests, solid" });
    const token = await readApproval(repo, "cover");
    expect(token).not.toBeNull();
    expect(token?.phase).toBe("cover");
    expect(token?.approvedBy).toBe("vivek");
    expect(token?.note).toBe("43 tests, solid");
    expect(() => new Date(token!.approvedAt).toISOString()).not.toThrow();
  });

  it("readApproval returns null when there is no approval", async () => {
    const repo = mkRepo();
    expect(await readApproval(repo, "plan")).toBeNull();
  });

  it("clearApproval is idempotent (no throw when file is absent)", async () => {
    const repo = mkRepo();
    await expect(clearApproval(repo, "plan")).resolves.toBeUndefined();
    await writeApproval(repo, "plan");
    await clearApproval(repo, "plan");
    expect(isApproved(repo, "plan")).toBe(false);
    await expect(clearApproval(repo, "plan")).resolves.toBeUndefined();
  });

  it("writeApproval creates the approvals directory if missing", async () => {
    const repo = mkRepo();
    expect(fs.existsSync(path.join(repo, "plan", ".approvals"))).toBe(false);
    await writeApproval(repo, "map");
    expect(fs.existsSync(approvalFile(repo, "map"))).toBe(true);
  });

  it("approvals are phase-scoped", async () => {
    const repo = mkRepo();
    await writeApproval(repo, "plan");
    expect(isApproved(repo, "plan")).toBe(true);
    expect(isApproved(repo, "map")).toBe(false);
  });

  it("waitForApproval resolves as soon as the token appears", async () => {
    const repo = mkRepo();
    setTimeout(() => {
      void writeApproval(repo, "break", { note: "go ahead" });
    }, 50);
    const token = await waitForApproval(repo, "break", { pollMs: 25, timeoutMs: 2000 });
    expect(token.phase).toBe("break");
    expect(token.note).toBe("go ahead");
  });

  it("waitForApproval times out when no token is written", async () => {
    const repo = mkRepo();
    await expect(
      waitForApproval(repo, "plan", { pollMs: 20, timeoutMs: 100 }),
    ).rejects.toThrow(/Timed out/);
  });
});
