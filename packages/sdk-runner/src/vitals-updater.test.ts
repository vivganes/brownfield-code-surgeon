import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emptyVitals, type Phase } from "@brownfield-surgeon/shared";
import { loadOrInitVitals, setPhaseStatus } from "./vitals-updater.js";

// Mock the shared module's file operations
vi.mock("@brownfield-surgeon/shared", async () => {
  const actual = await vi.importActual("@brownfield-surgeon/shared");
  return {
    ...actual,
    readVitals: vi.fn(),
    writeVitals: vi.fn(),
  };
});

describe("loadOrInitVitals", () => {
  let mockReadVitals: any;
  let mockWriteVitals: any;

  beforeEach(async () => {
    const shared = await import("@brownfield-surgeon/shared");
    mockReadVitals = vi.mocked(shared.readVitals);
    mockWriteVitals = vi.mocked(shared.writeVitals);
    mockReadVitals.mockClear();
    mockWriteVitals.mockClear();
  });

  it("loads existing vitals", async () => {
    const existingVitals = emptyVitals({
      runId: "existing-run",
      repoRoot: "/repo",
      engine: "sdk",
    });
    mockReadVitals.mockResolvedValue(existingVitals);

    const result = await loadOrInitVitals("/repo", "new-run");

    expect(result).toEqual(existingVitals);
    expect(mockWriteVitals).not.toHaveBeenCalled();
  });

  it("initializes new vitals when none exist", async () => {
    mockReadVitals.mockResolvedValue(null);
    mockWriteVitals.mockResolvedValue(undefined);

    const result = await loadOrInitVitals("/repo", "new-run");

    expect(result.runId).toBe("new-run");
    expect(result.repoRoot).toBe("/repo");
    expect(result.engine).toBe("sdk");
    expect(mockWriteVitals).toHaveBeenCalledOnce();
  });

  it("prefers existing vitals over creating new", async () => {
    const existing = emptyVitals({
      runId: "existing",
      repoRoot: "/repo",
      engine: "sdk",
    });
    mockReadVitals.mockResolvedValue(existing);

    const result = await loadOrInitVitals("/repo", "new-run");

    expect(result.runId).toBe("existing");
  });

  it("writes initialized vitals to disk", async () => {
    mockReadVitals.mockResolvedValue(null);

    const result = await loadOrInitVitals("/repo", "run-123");

    expect(mockWriteVitals).toHaveBeenCalledWith("/repo", expect.objectContaining({
      runId: "run-123",
      repoRoot: "/repo",
    }));
  });
});

describe("setPhaseStatus", () => {
  let mockReadVitals: any;
  let mockWriteVitals: any;

  beforeEach(async () => {
    const shared = await import("@brownfield-surgeon/shared");
    mockReadVitals = vi.mocked(shared.readVitals);
    mockWriteVitals = vi.mocked(shared.writeVitals);
    mockReadVitals.mockClear();
    mockWriteVitals.mockClear();
  });

  it("sets phase status to running", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "running");

    expect(result.phaseStatus.plan).toBe("running");
    expect(result.currentPhase).toBe("plan");
  });

  it("sets phase status to completed", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = "plan";
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "completed");

    expect(result.phaseStatus.plan).toBe("completed");
    expect(result.currentPhase).toBeNull();
  });

  it("sets phase status to failed", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = "plan";
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "failed");

    expect(result.phaseStatus.plan).toBe("failed");
    expect(result.currentPhase).toBeNull();
  });

  it("sets phase status to awaiting-approval", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = "plan";
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "awaiting-approval");

    expect(result.phaseStatus.plan).toBe("awaiting-approval");
    expect(result.currentPhase).toBe("plan");
  });

  it("clears currentPhase when setting completed", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = "plan";
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "completed");

    expect(result.currentPhase).toBeNull();
  });

  it("clears currentPhase only if it matches the phase", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = "map";
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "completed");

    expect(result.currentPhase).toBe("map");
  });

  it("writes updated vitals", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    mockReadVitals.mockResolvedValue(vitals);

    await setPhaseStatus("/repo", "plan", "running");

    expect(mockWriteVitals).toHaveBeenCalledWith("/repo", expect.any(Object));
  });

  it("updates lastUpdated timestamp", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    // Force oldTime to be in the past so the comparison is reliable
    const oldTime = new Date(Date.now() - 10000).toISOString();
    vitals.lastUpdated = oldTime;
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "running");

    expect(result.lastUpdated).not.toBe(oldTime);
    expect(new Date(result.lastUpdated).getTime()).toBeGreaterThan(
      new Date(oldTime).getTime()
    );
  });

  it("initializes vitals if none exist", async () => {
    mockReadVitals.mockResolvedValue(null);

    const result = await setPhaseStatus("/repo", "plan", "running");

    expect(result.runId).toBeDefined();
    expect(result.phaseStatus.plan).toBe("running");
  });

  it("handles all phase names", async () => {
    const phases: Phase[] = ["plan", "map", "break", "cover", "implement", "refactor", "finish"];
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });

    for (const phase of phases) {
      mockReadVitals.mockResolvedValue({ ...vitals });
      const result = await setPhaseStatus("/repo", phase, "running");
      expect(result.phaseStatus[phase]).toBe("running");
    }
  });

  it("handles all status values", async () => {
    const statuses = ["pending", "running", "awaiting-approval", "completed", "failed", "skipped"] as const;
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });

    for (const status of statuses) {
      mockReadVitals.mockResolvedValue({ ...vitals });
      const result = await setPhaseStatus("/repo", "plan", status);
      expect(result.phaseStatus.plan).toBe(status);
    }
  });

  it("clears currentPhase for skipped status", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = "plan";
    mockReadVitals.mockResolvedValue(vitals);

    const result = await setPhaseStatus("/repo", "plan", "skipped");

    expect(result.currentPhase).toBeNull();
  });

  it("sets currentPhase only when running", async () => {
    const vitals = emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" });
    vitals.currentPhase = null;
    mockReadVitals.mockResolvedValue(vitals);

    // Test each status
    const statuses = ["pending", "awaiting-approval", "completed", "failed"] as const;
    for (const status of statuses) {
      mockReadVitals.mockResolvedValue({ ...vitals, currentPhase: null });
      const result = await setPhaseStatus("/repo", "plan", status);
      expect(result.currentPhase).toBeNull();
    }
  });
});
