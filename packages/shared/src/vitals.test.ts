import { describe, it, expect } from "vitest";
import { emptyVitals, VitalsSchema } from "./vitals.js";
import { PHASES } from "./phases.js";

describe("emptyVitals", () => {
  it("produces a value that satisfies VitalsSchema", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "sdk" });
    expect(() => VitalsSchema.parse(v)).not.toThrow();
  });

  it("initializes every phase to 'pending'", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "plugin" });
    for (const p of PHASES) {
      expect(v.phaseStatus[p]).toBe("pending");
    }
  });

  it("starts with no current phase and empty coverage baselines", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "managed" });
    expect(v.currentPhase).toBeNull();
    expect(v.coverage.baseline).toBeNull();
    expect(v.coverage.current).toBeNull();
    expect(v.tests).toEqual({ total: 0, passing: 0, failing: 0, skipped: 0 });
    expect(v.seamsFound).toBe(0);
    expect(v.dependenciesBroken).toBe(0);
  });

  it("baselineRef defaults to null and round-trips through the schema", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "sdk" });
    expect(v.baselineRef).toBeNull();
    const withSha = { ...v, baselineRef: "abc123" };
    expect(() => VitalsSchema.parse(withSha)).not.toThrow();
  });

  it("startedAt and lastUpdated are valid ISO timestamps", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "sdk" });
    expect(() => new Date(v.startedAt).toISOString()).not.toThrow();
    expect(v.startedAt).toBe(v.lastUpdated);
  });

  it("echoes engine + runId + repoRoot", () => {
    const v = emptyVitals({ runId: "abc", repoRoot: "/x", engine: "managed" });
    expect(v.runId).toBe("abc");
    expect(v.repoRoot).toBe("/x");
    expect(v.engine).toBe("managed");
  });
});

describe("VitalsSchema", () => {
  it("rejects vitals with a missing phase entry", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "sdk" });
    const mutated: unknown = {
      ...v,
      phaseStatus: { ...v.phaseStatus, plan: undefined },
    };
    expect(() => VitalsSchema.parse(mutated)).toThrow();
  });

  it("rejects vitals with an unknown phase status", () => {
    const v = emptyVitals({ runId: "r1", repoRoot: "/tmp/repo", engine: "sdk" });
    const mutated: unknown = {
      ...v,
      phaseStatus: { ...v.phaseStatus, plan: "almost-done" },
    };
    expect(() => VitalsSchema.parse(mutated)).toThrow();
  });
});
