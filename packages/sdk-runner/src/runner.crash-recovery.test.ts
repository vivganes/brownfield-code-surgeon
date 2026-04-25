import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptyVitals } from "@brownfield-surgeon/shared";
import { markPhaseFailedSync } from "./runner.js";

describe("markPhaseFailedSync", () => {
  let repoRoot: string;
  let vitalsPath: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(tmpdir(), "sdk-runner-crash-"));
    mkdirSync(path.join(repoRoot, "plan"), { recursive: true });
    vitalsPath = path.join(repoRoot, "plan", "vitals.json");
    const v = emptyVitals({ runId: "r1", repoRoot, engine: "sdk" });
    v.phaseStatus.map = "running";
    v.currentPhase = "map";
    writeFileSync(vitalsPath, JSON.stringify(v, null, 2), "utf8");
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("flips the named phase to 'failed' on disk", () => {
    markPhaseFailedSync(repoRoot, "map", "uncaughtException: boom");
    const after = JSON.parse(readFileSync(vitalsPath, "utf8"));
    expect(after.phaseStatus.map).toBe("failed");
  });

  it("clears currentPhase if it matched the failed phase", () => {
    markPhaseFailedSync(repoRoot, "map", "any");
    const after = JSON.parse(readFileSync(vitalsPath, "utf8"));
    expect(after.currentPhase).toBeNull();
  });

  it("leaves other phases untouched", () => {
    markPhaseFailedSync(repoRoot, "map", "any");
    const after = JSON.parse(readFileSync(vitalsPath, "utf8"));
    expect(after.phaseStatus.plan).toBe("pending");
    expect(after.phaseStatus.break).toBe("pending");
  });

  it("updates lastUpdated", () => {
    const before = JSON.parse(readFileSync(vitalsPath, "utf8")).lastUpdated;
    // Force a tick so the ISO timestamp differs.
    const start = Date.now();
    while (Date.now() === start) { /* spin briefly */ }
    markPhaseFailedSync(repoRoot, "map", "any");
    const after = JSON.parse(readFileSync(vitalsPath, "utf8"));
    expect(after.lastUpdated).not.toBe(before);
  });

  it("does not throw when vitals.json is missing (best-effort)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rmSync(vitalsPath);
    expect(() => markPhaseFailedSync(repoRoot, "map", "any")).not.toThrow();
    errSpy.mockRestore();
  });
});
