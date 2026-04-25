import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./subagent-stop.js";
import { emptyVitals, writeVitals, readVitals, eventsFile } from "./_lib.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "subagent-stop-test-"));
}

function events(tmp: string) {
  if (!fs.existsSync(eventsFile(tmp))) return [];
  return fs
    .readFileSync(eventsFile(tmp), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("subagent-stop run()", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = mkTmp();
    env = { SURGERY_REPO_ROOT: tmp };
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("no-ops when vitals are missing", () => {
    const commit = vi.fn();
    run({ env, commit });
    expect(commit).not.toHaveBeenCalled();
    expect(events(tmp)).toHaveLength(0);
  });

  it("no-ops when no currentPhase is set", () => {
    writeVitals(tmp, emptyVitals(tmp));
    const commit = vi.fn();
    run({ env, commit });
    expect(commit).not.toHaveBeenCalled();
  });

  it("emits PhaseEnd, ApprovalRequested, advances to next phase, invokes commit", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    v.phaseStartedAt = { plan: new Date(Date.now() - 5000).toISOString() };
    v.artifacts = ["plan/plan.md"];
    writeVitals(tmp, v);

    const commit = vi.fn();
    run({ env, commit });

    const evs = events(tmp);
    const phaseEnd = evs.find((e) => e.type === "PhaseEnd")!;
    expect(phaseEnd.phase).toBe("plan");
    expect(phaseEnd.outcome).toBe("completed");
    expect(phaseEnd.durationMs).toBeGreaterThan(0);

    const approval = evs.find((e) => e.type === "ApprovalRequested")!;
    expect(approval.phase).toBe("plan");
    expect(approval.artifacts).toEqual(["plan/plan.md"]);

    const updated = readVitals(tmp)!;
    expect(updated.currentPhase).toBe("map");
    expect(updated.phaseStatus.plan).toBe("awaiting-approval");

    expect(commit).toHaveBeenCalledWith(tmp, "plan", updated.runId);
  });

  it("clears currentPhase when finishing the last phase", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "finish";
    v.phaseStartedAt = { finish: new Date().toISOString() };
    writeVitals(tmp, v);

    run({ env, commit: () => {} });
    expect(readVitals(tmp)!.currentPhase).toBeNull();
  });

  it("records durationMs=0 when phaseStartedAt is missing", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    writeVitals(tmp, v);

    run({ env, commit: () => {} });
    const phaseEnd = events(tmp).find((e) => e.type === "PhaseEnd")!;
    expect(phaseEnd.durationMs).toBe(0);
  });

  it("uses injected now() for deterministic duration", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "cover";
    v.phaseStartedAt = { cover: new Date(1000).toISOString() };
    writeVitals(tmp, v);

    run({ env, commit: () => {}, now: () => 4500 });
    const phaseEnd = events(tmp).find((e) => e.type === "PhaseEnd")!;
    expect(phaseEnd.durationMs).toBe(3500);
  });

  it("skips commit when vitals.commitPerPhase is false", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    v.phaseStartedAt = { plan: new Date().toISOString() };
    v.commitPerPhase = false;
    writeVitals(tmp, v);

    const commit = vi.fn();
    run({ env, commit });
    expect(commit).not.toHaveBeenCalled();

    // PhaseEnd / ApprovalRequested still emit normally
    const evs = events(tmp);
    expect(evs.find((e) => e.type === "PhaseEnd")).toBeTruthy();
    expect(evs.find((e) => e.type === "ApprovalRequested")).toBeTruthy();
  });

  it("commits when vitals.commitPerPhase is missing (legacy vitals.json)", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    v.phaseStartedAt = { plan: new Date().toISOString() };
    // simulate an older vitals.json with no commitPerPhase field
    delete (v as Partial<typeof v>).commitPerPhase;
    writeVitals(tmp, v as typeof v);

    const commit = vi.fn();
    run({ env, commit });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("swallows errors from the commit function gracefully (via defaultCommit)", () => {
    // defaultCommit tries execSync; in a non-git tmp dir it should not throw.
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    v.phaseStartedAt = { plan: new Date().toISOString() };
    writeVitals(tmp, v);
    expect(() => run({ env })).not.toThrow();
  });
});
