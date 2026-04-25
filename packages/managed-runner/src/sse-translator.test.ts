import { describe, it, expect } from "vitest";
import {
  translateEvent,
  extractArtifactWrites,
  normalizeScaffoldPath,
  type ManagedEvent,
  type TranslateContext,
} from "./sse-translator.js";

const ctx: TranslateContext = { runId: "r-1", phase: "finish" };

describe("normalizeScaffoldPath", () => {
  it("strips the /workspace/repo/ prefix", () => {
    expect(normalizeScaffoldPath("/workspace/repo/plan/plan.md")).toBe(
      "plan/plan.md",
    );
  });

  it("accepts repo-relative scaffold paths", () => {
    expect(normalizeScaffoldPath("plan/plan.md")).toBe("plan/plan.md");
    expect(normalizeScaffoldPath(".surgery/events.jsonl")).toBe(".surgery/events.jsonl");
    expect(normalizeScaffoldPath("./plan/seams-and-dependencies.md")).toBe(
      "plan/seams-and-dependencies.md",
    );
  });

  it("rejects paths outside plan/ and .surgery/", () => {
    expect(normalizeScaffoldPath("src/index.ts")).toBeUndefined();
    expect(normalizeScaffoldPath("/etc/passwd")).toBeUndefined();
    expect(normalizeScaffoldPath("plan/../src/secret.ts")).toBeUndefined();
  });

  it("rejects absolute paths that are not under /workspace/repo", () => {
    expect(normalizeScaffoldPath("/tmp/plan/plan.md")).toBeUndefined();
  });

  it("normalizes Windows-style backslashes", () => {
    expect(normalizeScaffoldPath("plan\\plan.md")).toBe("plan/plan.md");
  });
});

describe("extractArtifactWrites", () => {
  it("returns a write entry for the write tool with path+content", () => {
    expect(
      extractArtifactWrites("write", {
        path: "plan/plan.md",
        content: "hello",
      }),
    ).toEqual([{ path: "plan/plan.md", kind: "write", content: "hello" }]);
  });

  it("accepts file_path as an alias for path", () => {
    expect(
      extractArtifactWrites("write", {
        file_path: "/workspace/repo/.surgery/vitals.json",
        content: "{}",
      }),
    ).toEqual([{ path: ".surgery/vitals.json", kind: "write", content: "{}" }]);
  });

  it("returns an edit entry with old_string/new_string", () => {
    expect(
      extractArtifactWrites("edit", {
        path: "plan/plan.md",
        old_string: "old",
        new_string: "new",
      }),
    ).toEqual([
      {
        path: "plan/plan.md",
        kind: "edit",
        oldString: "old",
        newString: "new",
      },
    ]);
  });

  it("returns nothing for non-write/edit tools", () => {
    expect(extractArtifactWrites("read", { path: "plan/plan.md" })).toEqual([]);
    expect(extractArtifactWrites("bash", { command: "ls" })).toEqual([]);
  });

  it("returns nothing when the path is outside scaffolding", () => {
    expect(
      extractArtifactWrites("write", { path: "src/index.ts", content: "x" }),
    ).toEqual([]);
  });

  it("returns nothing when content is missing for write", () => {
    expect(extractArtifactWrites("write", { path: "plan/plan.md" })).toEqual([]);
  });
});

describe("translateEvent — session lifecycle", () => {
  it("emits PhaseStart on session.status_running", () => {
    const r = translateEvent(
      {
        type: "session.status_running",
        id: "evt_1",
        processed_at: "2026-04-25T10:00:00Z",
      },
      ctx,
    );
    expect(r.control).toEqual({ kind: "continue" });
    expect(r.surgeryEvents).toHaveLength(1);
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "PhaseStart",
      runId: "r-1",
      phase: "finish",
      engine: "managed",
    });
  });

  it("emits PhaseEnd completed and signals done on idle/end_turn", () => {
    const r = translateEvent(
      {
        type: "session.status_idle",
        id: "evt_2",
        processed_at: "2026-04-25T10:05:00Z",
        stop_reason: { type: "end_turn" },
      },
      ctx,
    );
    expect(r.control).toEqual({ kind: "completed" });
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "PhaseEnd",
      outcome: "completed",
    });
  });

  it("emits PhaseEnd failed on idle/retries_exhausted", () => {
    const r = translateEvent(
      {
        type: "session.status_idle",
        id: "evt_3",
        processed_at: "2026-04-25T10:05:00Z",
        stop_reason: { type: "retries_exhausted" },
      },
      ctx,
    );
    expect(r.control.kind).toBe("failed");
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "PhaseEnd",
      outcome: "failed",
    });
  });

  it("continues without an event on idle/requires_action", () => {
    const r = translateEvent(
      {
        type: "session.status_idle",
        id: "evt_4",
        processed_at: "2026-04-25T10:05:00Z",
        stop_reason: { type: "requires_action" },
      },
      ctx,
    );
    expect(r.control).toEqual({ kind: "continue" });
    expect(r.surgeryEvents).toHaveLength(0);
  });

  it("emits PhaseEnd aborted on session.status_terminated", () => {
    const r = translateEvent(
      {
        type: "session.status_terminated",
        id: "evt_5",
        processed_at: "2026-04-25T10:05:00Z",
      },
      ctx,
    );
    expect(r.control.kind).toBe("aborted");
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "PhaseEnd",
      outcome: "aborted",
    });
  });

  it("emits PhaseEnd failed on session.error and surfaces the message", () => {
    const r = translateEvent(
      {
        type: "session.error",
        id: "evt_6",
        processed_at: "2026-04-25T10:05:00Z",
        error: { message: "boom" },
      },
      ctx,
    );
    expect(r.control).toEqual({ kind: "failed", reason: "boom" });
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "PhaseEnd",
      outcome: "failed",
      errorMessage: "boom",
    });
  });
});

describe("translateEvent — tool use", () => {
  it("emits ToolUse for agent.tool_use and surfaces the tool name", () => {
    const r = translateEvent(
      {
        type: "agent.tool_use",
        id: "tu_1",
        name: "bash",
        input: { command: "ls" },
        processed_at: "2026-04-25T10:01:00Z",
      },
      ctx,
    );
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "ToolUse",
      tool: "bash",
      blocked: false,
    });
    expect(r.artifactWrites).toEqual([]);
    expect(r.control).toEqual({ kind: "continue" });
  });

  it("returns artifact writes for write tool calls under scaffolding", () => {
    const r = translateEvent(
      {
        type: "agent.tool_use",
        id: "tu_2",
        name: "write",
        input: { path: "plan/plan.md", content: "## plan" },
        processed_at: "2026-04-25T10:01:00Z",
      },
      ctx,
    );
    expect(r.surgeryEvents).toHaveLength(1);
    expect(r.artifactWrites).toEqual([
      { path: "plan/plan.md", kind: "write", content: "## plan" },
    ]);
  });

  it("re-prefixes mcp tool calls in the SurgeryEvent.tool field", () => {
    const r = translateEvent(
      {
        type: "agent.mcp_tool_use",
        id: "mtu_1",
        name: "do_thing",
        mcp_server_name: "github",
        input: {},
        processed_at: "2026-04-25T10:02:00Z",
      },
      ctx,
    );
    expect(r.surgeryEvents[0]).toMatchObject({
      type: "ToolUse",
      tool: "mcp:github:do_thing",
    });
  });

  it("drops agent.message / agent.thinking / agent.tool_result silently", () => {
    for (const type of [
      "agent.message",
      "agent.thinking",
      "agent.tool_result",
      "agent.thread_context_compacted",
    ] as const) {
      const r = translateEvent(
        { type, id: "x", processed_at: "2026-04-25T10:00:00Z" } as ManagedEvent,
        ctx,
      );
      expect(r.surgeryEvents).toEqual([]);
      expect(r.control).toEqual({ kind: "continue" });
    }
  });
});
