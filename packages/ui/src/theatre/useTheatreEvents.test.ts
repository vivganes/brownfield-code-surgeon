import { describe, it, expect } from "vitest";
import { deriveTheatreState } from "./useTheatreEvents.js";
import type { Vitals, SurgeryEvent } from "../types.js";

describe("deriveTheatreState", () => {
  const createVitals = (overrides?: Partial<Vitals>): Vitals => ({
    runId: "test-run-1",
    engine: "sdk",
    currentPhase: "plan",
    repoRoot: "/home/user/repo",
    lastUpdated: new Date().toISOString(),
    phaseStatus: {
      plan: "pending",
      map: "pending",
      break: "pending",
      cover: "pending",
      implement: "pending",
      refactor: "pending",
      finish: "pending",
    },
    ...overrides,
  });

  it("initializes all glyphs as dormant when vitals is null", () => {
    const state = deriveTheatreState(null, []);
    expect(state.glyphs.plan).toBe("dormant");
    expect(state.glyphs.finish).toBe("dormant");
    expect(state.activePhase).toBeNull();
  });

  it("maps phase statuses to glyph states", () => {
    const vitals = createVitals({
      phaseStatus: {
        plan: "completed",
        map: "running",
        break: "awaiting-approval",
        cover: "failed",
        implement: "pending",
        refactor: "pending",
        finish: "pending",
      },
    });

    const state = deriveTheatreState(vitals, []);
    expect(state.glyphs.plan).toBe("complete");
    expect(state.glyphs.map).toBe("active");
    expect(state.glyphs.break).toBe("awaiting-approval");
    expect(state.glyphs.cover).toBe("failed");
    expect(state.glyphs.implement).toBe("dormant");
  });

  it("sets activePhase from vitals currentPhase", () => {
    const vitals = createVitals({ currentPhase: "cover" });
    const state = deriveTheatreState(vitals, []);
    expect(state.activePhase).toBe("cover");
  });

  it("tracks lastArtifactTs from ArtifactWritten events", () => {
    const timestamp = new Date().toISOString();
    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp,
        phase: "plan",
        path: "plan/plan.md",
        reason: "initial plan",
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.lastArtifactTs).toBeGreaterThan(0);
    expect(state.lastArtifactTs).toBe(Date.parse(timestamp));
  });

  it("tracks lastTestFailTs from TestRun events with failures", () => {
    const timestamp = new Date().toISOString();
    const events: SurgeryEvent[] = [
      {
        type: "TestRun",
        timestamp,
        phase: "cover",
        passed: 5,
        failed: 2,
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.lastTestFailTs).toBe(Date.parse(timestamp));
  });

  it("ignores TestRun events with zero failures", () => {
    const events: SurgeryEvent[] = [
      {
        type: "TestRun",
        timestamp: new Date().toISOString(),
        phase: "cover",
        passed: 10,
        failed: 0,
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.lastTestFailTs).toBe(0);
  });

  it("tracks finishedTs from PhaseEnd:finish events", () => {
    const timestamp = new Date(Date.now() - 5000).toISOString();
    const events: SurgeryEvent[] = [
      {
        type: "PhaseEnd",
        timestamp,
        phase: "finish",
        duration: 125,
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.finishedTs).toBe(Date.parse(timestamp));
  });

  it("ignores invalid timestamps gracefully", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp: "invalid-date",
        phase: "plan",
        path: "test.md",
        reason: "test",
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.lastArtifactTs).toBe(0);
  });

  it("uses the most recent timestamp for each metric", () => {
    const t1 = new Date(Date.now() - 10000).toISOString();
    const t2 = new Date(Date.now() - 5000).toISOString();
    const t3 = new Date().toISOString();

    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp: t1,
        phase: "plan",
        path: "plan.md",
        reason: "v1",
      },
      {
        type: "ArtifactWritten",
        timestamp: t3,
        phase: "map",
        path: "seams.md",
        reason: "v2",
      },
      {
        type: "ArtifactWritten",
        timestamp: t2,
        phase: "plan",
        path: "plan.md",
        reason: "v3",
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.lastArtifactTs).toBe(Date.parse(t3));
  });

  it("returns correct structure with all fields", () => {
    const state = deriveTheatreState(createVitals(), []);
    expect(state).toHaveProperty("glyphs");
    expect(state).toHaveProperty("activePhase");
    expect(state).toHaveProperty("lastArtifactTs");
    expect(state).toHaveProperty("lastTestFailTs");
    expect(state).toHaveProperty("finishedTs");
  });

  it("handles multiple test failures and returns the latest", () => {
    const t1 = new Date(Date.now() - 10000).toISOString();
    const t2 = new Date(Date.now() - 5000).toISOString();

    const events: SurgeryEvent[] = [
      {
        type: "TestRun",
        timestamp: t1,
        phase: "cover",
        passed: 5,
        failed: 3,
      },
      {
        type: "TestRun",
        timestamp: t2,
        phase: "cover",
        passed: 8,
        failed: 1,
      },
    ];

    const state = deriveTheatreState(createVitals(), events);
    expect(state.lastTestFailTs).toBe(Date.parse(t2));
  });
});
