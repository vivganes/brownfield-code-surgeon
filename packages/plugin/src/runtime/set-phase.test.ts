import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./set-phase.js";
import { readVitals, eventsFile, emptyVitals, writeVitals } from "../hooks/_lib.js";

function mkTmp(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "set-phase-test-"));
  fs.writeFileSync(path.join(tmp, "package.json"), "{}");
  return tmp;
}

function events(tmp: string) {
  return fs
    .readFileSync(eventsFile(tmp), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("set-phase run()", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects unknown/missing phases with exit 1", () => {
    expect(run({ argv: [], cwd: tmp }).exitCode).toBe(1);
    expect(run({ argv: ["bogus"], cwd: tmp }).exitCode).toBe(1);
  });

  it("initializes fresh vitals when none exist and sets currentPhase", () => {
    const r = run({
      argv: ["plan", "add dark mode"],
      cwd: tmp,
      now: () => new Date("2026-04-23T12:00:00Z"),
    });
    expect(r.exitCode).toBe(0);

    const v = readVitals(tmp)!;
    expect(v.currentPhase).toBe("plan");
    expect(v.phaseStatus.plan).toBe("running");
    expect(v.phaseStartedAt!.plan).toBe("2026-04-23T12:00:00.000Z");

    const phaseStart = events(tmp).find((e) => e.type === "PhaseStart")!;
    expect(phaseStart.phase).toBe("plan");
    expect(phaseStart.request).toBe("add dark mode");
  });

  it("preserves an existing run and only mutates the target phase", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    v.phaseStatus.plan = "completed";
    writeVitals(tmp, v);
    const originalRunId = v.runId;

    run({ argv: ["map"], cwd: tmp });
    const updated = readVitals(tmp)!;
    expect(updated.runId).toBe(originalRunId);
    expect(updated.currentPhase).toBe("map");
    expect(updated.phaseStatus.plan).toBe("completed");
    expect(updated.phaseStatus.map).toBe("running");
  });

  it("omits request from the event when not provided", () => {
    run({ argv: ["cover"], cwd: tmp });
    const phaseStart = events(tmp).find((e) => e.type === "PhaseStart")!;
    expect(phaseStart.request).toBeUndefined();
  });

  it("prints the run id in the stdout confirmation", () => {
    const r = run({ argv: ["break"], cwd: tmp });
    expect(r.stdout).toMatch(/^Phase set to: break \(run run-/);
  });
});
