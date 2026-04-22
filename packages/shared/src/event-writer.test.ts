import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendEvent,
  appendEventSync,
  ensureSurgeryDir,
  makeBaseEvent,
  readEvents,
  readVitals,
  writeVitals,
} from "./event-writer.js";
import { emptyVitals } from "./vitals.js";
import type { SurgeryEvent } from "./events.js";

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "surgery-evt-"));
}

describe("ensureSurgeryDir", () => {
  it("creates both .surgery and plan/.approvals", async () => {
    const repo = mkRepo();
    await ensureSurgeryDir(repo);
    expect(fs.existsSync(path.join(repo, ".surgery"))).toBe(true);
    expect(fs.existsSync(path.join(repo, "plan", ".approvals"))).toBe(true);
  });

  it("is idempotent", async () => {
    const repo = mkRepo();
    await ensureSurgeryDir(repo);
    await ensureSurgeryDir(repo);
    expect(fs.existsSync(path.join(repo, ".surgery"))).toBe(true);
  });
});

describe("appendEvent + readEvents", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkRepo();
  });

  it("round-trips a sequence of events in order", async () => {
    const runId = "r1";
    const e1: SurgeryEvent = {
      ...makeBaseEvent({ phase: "plan", engine: "sdk", runId }),
      type: "PhaseStart",
      request: "add comments",
    };
    const e2: SurgeryEvent = {
      ...makeBaseEvent({ phase: "plan", engine: "sdk", runId }),
      type: "ArtifactWritten",
      path: "plan/plan.md",
      bytes: 1234,
      kind: "plan",
    };
    const e3: SurgeryEvent = {
      ...makeBaseEvent({ phase: "plan", engine: "sdk", runId }),
      type: "PhaseEnd",
      outcome: "completed",
      durationMs: 2500,
    };
    await appendEvent(repo, e1);
    await appendEvent(repo, e2);
    await appendEvent(repo, e3);

    const events = await readEvents(repo);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      "PhaseStart",
      "ArtifactWritten",
      "PhaseEnd",
    ]);
  });

  it("rejects invalid events at append time (no partial write)", async () => {
    const bad = {
      timestamp: "not-a-date",
      phase: "plan",
      engine: "sdk",
      runId: "r1",
      type: "PhaseStart",
    } as unknown as SurgeryEvent;
    await expect(appendEvent(repo, bad)).rejects.toThrow();
    const events = await readEvents(repo);
    expect(events).toEqual([]);
  });

  it("readEvents returns [] when the file does not exist", async () => {
    const events = await readEvents(repo);
    expect(events).toEqual([]);
  });

  it("each appended line is independently valid JSON", async () => {
    const runId = "r1";
    await appendEvent(repo, {
      ...makeBaseEvent({ phase: "cover", engine: "sdk", runId }),
      type: "TestRun",
      passed: 10,
      failed: 0,
      skipped: 0,
      total: 10,
    });
    await appendEvent(repo, {
      ...makeBaseEvent({ phase: "cover", engine: "sdk", runId }),
      type: "TestRun",
      passed: 12,
      failed: 1,
      skipped: 0,
      total: 13,
    });
    const raw = await fsp.readFile(
      path.join(repo, ".surgery", "events.jsonl"),
      "utf8",
    );
    const lines = raw.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("appendEventSync", () => {
  it("writes the same content as the async variant", async () => {
    const repo = mkRepo();
    appendEventSync(repo, {
      ...makeBaseEvent({ phase: "plan", engine: "plugin", runId: "r1" }),
      type: "PhaseStart",
    });
    const events = await readEvents(repo);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("PhaseStart");
  });

  it("rejects invalid events synchronously", () => {
    const repo = mkRepo();
    expect(() =>
      appendEventSync(repo, {
        timestamp: new Date().toISOString(),
        phase: "plan",
        engine: "sdk",
        runId: "",
        type: "PhaseStart",
      } as unknown as SurgeryEvent),
    ).toThrow();
  });
});

describe("vitals round-trip", () => {
  it("readVitals returns null when vitals.json does not exist", async () => {
    const repo = mkRepo();
    expect(await readVitals(repo)).toBeNull();
  });

  it("writeVitals persists JSON readable by readVitals", async () => {
    const repo = mkRepo();
    const v = emptyVitals({ runId: "r1", repoRoot: repo, engine: "sdk" });
    await writeVitals(repo, v);
    const read = await readVitals(repo);
    expect(read).toEqual(v);
  });
});
