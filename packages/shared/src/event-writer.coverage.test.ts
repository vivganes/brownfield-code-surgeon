/**
 * Coverage tests for event-writer.ts uncovered lines:
 *   47-48: appendEvent throws non-ENOENT from appendFile
 *   55-56: readEventIndexSync re-throws non-ENOENT from readFileSync
 *   102-103: readEvents re-throws non-ENOENT errors
 *   125-126: readVitals re-throws non-ENOENT errors
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendEvent,
  appendEventDedupedSync,
  readEvents,
  readVitals,
  makeBaseEvent,
} from "./event-writer.js";

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ew-cov-"));
}

describe("event-writer coverage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Lines 47-48: appendEvent (async) — fsp.appendFile throws a non-ENOENT error
  it("appendEvent re-throws non-ENOENT errors from appendFile", async () => {
    const repo = mkRepo();
    try {
      // Create .surgery/events.jsonl as a directory so appendFile fails with EISDIR.
      const surgeryDir = path.join(repo, ".surgery");
      fs.mkdirSync(surgeryDir, { recursive: true });
      fs.mkdirSync(path.join(surgeryDir, "events.jsonl"), { recursive: true });

      const event = {
        ...makeBaseEvent({ phase: "plan" as const, engine: "sdk" as const, runId: "r1" }),
        type: "PhaseStart" as const,
      };
      await expect(appendEvent(repo, event)).rejects.toThrow();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  // Lines 55-56: readEventIndexSync catch block — invalid/unparseable lines in events.jsonl
  // are silently skipped. We seed the file with a bad JSON line to trigger the catch.
  it("appendEventDedupedSync skips invalid lines in events.jsonl (lines 55-56)", async () => {
    const repo = mkRepo();
    try {
      const surgeryDir = path.join(repo, ".surgery");
      fs.mkdirSync(surgeryDir, { recursive: true });
      // Write a file with one valid line and one invalid JSON line.
      const validEvent = {
        ...makeBaseEvent({ phase: "plan" as const, engine: "managed" as const, runId: "r1" }),
        type: "PhaseStart" as const,
        seq: 0,
      };
      fs.writeFileSync(
        path.join(surgeryDir, "events.jsonl"),
        JSON.stringify(validEvent) + "\n" + "NOT_VALID_JSON\n",
        "utf8",
      );

      // appendEventDedupedSync should parse the file, skip the bad line, and append a new event.
      const newEvent = {
        ...makeBaseEvent({ phase: "plan" as const, engine: "managed" as const, runId: "r1" }),
        type: "PhaseEnd" as const,
        outcome: "completed" as const,
        durationMs: 100,
      };
      const result = appendEventDedupedSync(repo, newEvent);
      expect(result).toBe(true);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  // Lines 55-56 (also): readEventIndexSync re-throws non-ENOENT from readFileSync
  it("appendEventDedupedSync re-throws non-ENOENT errors from readFileSync", () => {
    const repo = mkRepo();
    try {
      // Make events.jsonl a directory so fs.readFileSync throws EISDIR.
      const surgeryDir = path.join(repo, ".surgery");
      fs.mkdirSync(surgeryDir, { recursive: true });
      fs.mkdirSync(path.join(surgeryDir, "events.jsonl"), { recursive: true });

      const event = {
        ...makeBaseEvent({ phase: "plan" as const, engine: "managed" as const, runId: "r1" }),
        type: "PhaseStart" as const,
      };
      expect(() => appendEventDedupedSync(repo, event)).toThrow();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  // Lines 102-103: readEvents re-throws non-ENOENT errors
  it("readEvents re-throws non-ENOENT errors from readFile", async () => {
    const repo = mkRepo();
    try {
      // Make events.jsonl a directory so fsp.readFile throws EISDIR.
      const surgeryDir = path.join(repo, ".surgery");
      fs.mkdirSync(surgeryDir, { recursive: true });
      fs.mkdirSync(path.join(surgeryDir, "events.jsonl"), { recursive: true });

      await expect(readEvents(repo)).rejects.toThrow();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  // Lines 125-126: readVitals re-throws non-ENOENT errors
  it("readVitals re-throws non-ENOENT errors from readFile", async () => {
    const repo = mkRepo();
    try {
      // Make vitals.json a directory so fsp.readFile throws EISDIR.
      const surgeryDir = path.join(repo, ".surgery");
      fs.mkdirSync(surgeryDir, { recursive: true });
      fs.mkdirSync(path.join(surgeryDir, "vitals.json"), { recursive: true });

      await expect(readVitals(repo)).rejects.toThrow();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
