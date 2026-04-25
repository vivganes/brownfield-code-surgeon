import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drainSessionStream } from "./runner.js";
import type { ManagedEvent } from "./sse-translator.js";

function mkRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mr-runner-"));
}

async function* arrayStream<T>(items: T[]): AsyncIterable<T> {
  for (const x of items) yield x;
}

describe("drainSessionStream", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkRepo();
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("translates a happy-path stream and writes artifacts + events", async () => {
    const events: ManagedEvent[] = [
      {
        type: "session.status_running",
        id: "e1",
        processed_at: "2026-04-25T10:00:00Z",
      },
      {
        type: "agent.tool_use",
        id: "e2",
        name: "write",
        input: { path: "plan/plan.md", content: "## plan\nrun finish\n" },
        processed_at: "2026-04-25T10:01:00Z",
      },
      {
        type: "agent.tool_use",
        id: "e3",
        name: "bash",
        input: { command: "git status" },
        processed_at: "2026-04-25T10:02:00Z",
      },
      {
        type: "session.status_idle",
        id: "e4",
        processed_at: "2026-04-25T10:03:00Z",
        stop_reason: { type: "end_turn" },
      },
    ];

    const r = await drainSessionStream({
      stream: arrayStream(events),
      repoRoot: repo,
      runId: "r-1",
      scratchBranch: "surgery/r-1/finish",
      // disable heartbeat — tested separately
      heartbeatMs: 0,
    });

    expect(r.control).toEqual({ kind: "completed" });
    // PhaseStart + 2 ToolUse + PhaseEnd = 4
    expect(r.eventsAppended).toBe(4);
    expect(r.artifactsWritten).toBe(1);

    const planMd = fs.readFileSync(path.join(repo, "plan/plan.md"), "utf8");
    expect(planMd).toBe("## plan\nrun finish\n");

    const lines = fs
      .readFileSync(path.join(repo, ".surgery/events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(lines.map((e) => e.type)).toEqual([
      "PhaseStart",
      "ToolUse",
      "ToolUse",
      "PhaseEnd",
    ]);
    expect(lines.every((e) => e.engine === "managed" && e.runId === "r-1")).toBe(
      true,
    );
  });

  it("dedupes by SDK event id within the stream", async () => {
    const dup: ManagedEvent = {
      type: "agent.tool_use",
      id: "tu_dup",
      name: "bash",
      input: { command: "ls" },
      processed_at: "2026-04-25T10:01:00Z",
    };
    const events: ManagedEvent[] = [
      { type: "session.status_running", id: "e1", processed_at: "2026-04-25T10:00:00Z" },
      dup,
      dup,
      {
        type: "session.status_idle",
        id: "e4",
        processed_at: "2026-04-25T10:03:00Z",
        stop_reason: { type: "end_turn" },
      },
    ];
    const r = await drainSessionStream({
      stream: arrayStream(events),
      repoRoot: repo,
      runId: "r-1",
      scratchBranch: "surgery/r-1/finish",
      heartbeatMs: 0,
    });
    expect(r.duplicatesSkipped).toBeGreaterThanOrEqual(1);
    // PhaseStart + 1 ToolUse + PhaseEnd = 3 (the second dup is dropped)
    expect(r.eventsAppended).toBe(3);
  });

  it("exits with failed control on session.error", async () => {
    const events: ManagedEvent[] = [
      { type: "session.status_running", id: "e1", processed_at: "2026-04-25T10:00:00Z" },
      {
        type: "session.error",
        id: "e2",
        processed_at: "2026-04-25T10:00:01Z",
        error: { message: "model overloaded" },
      },
    ];
    const r = await drainSessionStream({
      stream: arrayStream(events),
      repoRoot: repo,
      runId: "r-1",
      scratchBranch: "surgery/r-1/finish",
      heartbeatMs: 0,
    });
    expect(r.control).toEqual({ kind: "failed", reason: "model overloaded" });
  });

  it("stops draining after a terminal event even if more follow", async () => {
    let post = 0;
    async function* stream(): AsyncIterable<ManagedEvent> {
      yield { type: "session.status_running", id: "e1", processed_at: "2026-04-25T10:00:00Z" };
      yield {
        type: "session.status_idle",
        id: "e2",
        processed_at: "2026-04-25T10:00:01Z",
        stop_reason: { type: "end_turn" },
      };
      post += 1;
      yield { type: "agent.tool_use", id: "e3", name: "bash", input: {}, processed_at: "2026-04-25T10:00:02Z" };
    }
    const r = await drainSessionStream({
      stream: stream(),
      repoRoot: repo,
      runId: "r-1",
      scratchBranch: "surgery/r-1/finish",
      heartbeatMs: 0,
    });
    expect(r.control.kind).toBe("completed");
    // The async iterator may or may not advance to the post-terminal event.
    // What we care about: we did not append anything for it.
    void post;
    const lines = fs
      .readFileSync(path.join(repo, ".surgery/events.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBe(2); // PhaseStart + PhaseEnd, no extra ToolUse
  });
});
