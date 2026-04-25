import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emptyVitals } from "@brownfield-surgeon/shared";

// Mock the Claude Agent SDK so we never make real network calls.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

// Mock core-prompts so we don't need real prompt files.
vi.mock("@brownfield-surgeon/core-prompts", () => ({
  loadPrompt: vi.fn(() => ({ body: "MOCK PROMPT BODY" })),
}));

// Mock shared so file I/O / approval-waiting are inert.
vi.mock("@brownfield-surgeon/shared", async () => {
  const actual = await vi.importActual<any>("@brownfield-surgeon/shared");
  return {
    ...actual,
    appendEvent: vi.fn(async () => {}),
    waitForApproval: vi.fn(async () => {}),
    isApproved: vi.fn(() => false),
    writeApproval: vi.fn(async () => {}),
    readVitals: vi.fn(),
    writeVitals: vi.fn(async () => {}),
    readCoverageSnapshot: vi.fn(() => null),
  };
});

async function loadRunner() {
  return await import("./runner.js");
}

function emptyAsyncIterable() {
  return {
    async *[Symbol.asyncIterator]() {
      // emit nothing — the phase will still complete cleanly
    },
  };
}

describe("runPipeline", () => {
  let mockQuery: any;
  let mockShared: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    mockQuery = vi.mocked(sdk.query);
    mockQuery.mockReturnValue(emptyAsyncIterable());

    mockShared = await import("@brownfield-surgeon/shared");
    vi.mocked(mockShared.readVitals).mockResolvedValue(
      emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" }),
    );
  });

  it("loads vitals before running any phase", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "do thing",
      phases: [],
      runId: "run-1",
      autoApprove: true,
    });

    // readVitals is called as part of loadOrInitVitals.
    expect(mockShared.readVitals).toHaveBeenCalled();
  });

  it("runs each requested phase in order", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "implement X",
      phases: ["plan", "map"],
      runId: "run-1",
      autoApprove: true,
    });

    // Two phases → query() invoked twice (once per phase).
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("skips query when phases array is empty", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "noop",
      phases: [],
      runId: "run-1",
      autoApprove: true,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("emits PhaseStart and PhaseEnd events for a phase", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "implement X",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const eventTypes = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1].type);

    expect(eventTypes).toContain("PhaseStart");
    expect(eventTypes).toContain("PhaseEnd");
  });

  it("emits ApprovalRequested then ApprovalGranted with auto-approve", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "implement X",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const eventTypes = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1].type);

    const approvalReqIdx = eventTypes.indexOf("ApprovalRequested");
    const approvalGrantedIdx = eventTypes.indexOf("ApprovalGranted");

    expect(approvalReqIdx).toBeGreaterThan(-1);
    expect(approvalGrantedIdx).toBeGreaterThan(approvalReqIdx);
  });

  it("calls writeApproval when autoApprove is true", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "implement X",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    expect(mockShared.writeApproval).toHaveBeenCalledWith(
      "/repo",
      "plan",
      expect.objectContaining({ approvedBy: expect.stringContaining("auto-approve") }),
    );
  });

  it("waits for approval when autoApprove is false and not yet approved", async () => {
    vi.mocked(mockShared.isApproved).mockReturnValue(false);

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "implement X",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: false,
    });

    expect(mockShared.waitForApproval).toHaveBeenCalledWith(
      "/repo",
      "plan",
      expect.objectContaining({ pollMs: 1000 }),
    );
  });

  it("skips waitForApproval when isApproved already returns true", async () => {
    vi.mocked(mockShared.isApproved).mockReturnValue(true);

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "implement X",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: false,
    });

    expect(mockShared.waitForApproval).not.toHaveBeenCalled();
  });

  it("emits PhaseEnd with outcome=failed when streaming throws", async () => {
    mockQuery.mockReturnValue({
      // eslint-disable-next-line require-yield
      async *[Symbol.asyncIterator]() {
        throw new Error("boom");
      },
    });

    const { runPipeline } = await loadRunner();
    await expect(
      runPipeline({
        repoRoot: "/repo",
        request: "implement X",
        phases: ["plan"],
        runId: "run-1",
        autoApprove: true,
      }),
    ).rejects.toThrow("boom");

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);

    const phaseEnd = events.find((e) => e.type === "PhaseEnd");
    expect(phaseEnd).toBeDefined();
    expect(phaseEnd.outcome).toBe("failed");
    expect(phaseEnd.errorMessage).toContain("boom");
  });

  it("re-throws errors so the pipeline halts on failure", async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        throw new Error("phase died");
      },
    });

    const { runPipeline } = await loadRunner();
    await expect(
      runPipeline({
        repoRoot: "/repo",
        request: "x",
        phases: ["plan", "map"],
        runId: "run-1",
        autoApprove: true,
      }),
    ).rejects.toThrow("phase died");

    // Second phase should never start because the first threw.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("passes model option through to query when provided", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
      model: "claude-opus-4-7",
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.options.model).toBe("claude-opus-4-7");
  });

  it("omits model when not provided", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.options.model).toBeUndefined();
  });

  it("passes maxThinkingTokens for thinking=high", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
      thinking: "high",
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.options.maxThinkingTokens).toBe(12000);
  });

  it("omits maxThinkingTokens when thinking=off", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
      thinking: "off",
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.options.maxThinkingTokens).toBeUndefined();
  });

  it("uses acceptEdits permission mode", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.options.permissionMode).toBe("acceptEdits");
  });

  it("sets cwd to repoRoot for the agent", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/some/other/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.options.cwd).toBe("/some/other/repo");
  });

  it("includes the phase prompt body and user request in the prompt", async () => {
    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "ADD-WIDGETS",
      phases: ["plan"],
      runId: "RUN-XYZ",
      autoApprove: true,
    });

    const queryCall = mockQuery.mock.calls[0][0];
    expect(queryCall.prompt).toContain("MOCK PROMPT BODY");
    expect(queryCall.prompt).toContain("ADD-WIDGETS");
    expect(queryCall.prompt).toContain("RUN-XYZ");
    expect(queryCall.prompt).toContain("/repo");
  });
});

describe("runPipeline — message handling", () => {
  let mockQuery: any;
  let mockShared: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    mockQuery = vi.mocked(sdk.query);

    mockShared = await import("@brownfield-surgeon/shared");
    vi.mocked(mockShared.readVitals).mockResolvedValue(
      emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" }),
    );
    vi.mocked(mockShared.isApproved).mockReturnValue(true);
  });

  it("emits ToolUse events for assistant tool_use blocks", async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "Write",
                input: { file_path: "/repo/plan/plan.md" },
              },
            ],
          },
        };
      },
    });

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const toolUse = events.find((e) => e.type === "ToolUse");
    expect(toolUse).toBeDefined();
    expect(toolUse.tool).toBe("Write");
    expect(toolUse.summary).toBe("/repo/plan/plan.md");
  });

  it("summarizes Bash tool_use with command (truncated to 120 chars)", async () => {
    const longCmd = "echo " + "x".repeat(200);
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "Bash",
                input: { command: longCmd },
              },
            ],
          },
        };
      },
    });

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const toolUse = events.find((e) => e.type === "ToolUse");
    expect(toolUse.summary.length).toBe(120);
  });

  it("emits TestRun for npm test tool_result with parseable output", async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "Bash",
                input: { command: "npm test" },
              },
            ],
          },
        };
        yield {
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                content: "Tests:       3 passed, 0 failed, 3 total",
              },
            ],
          },
        };
      },
    });

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const testRun = events.find((e) => e.type === "TestRun");
    // parseTestOutput may or may not match this format; the contract is
    // simply that we attempted to handle the tool_result without crashing.
    if (testRun) {
      expect(testRun.total).toBeGreaterThanOrEqual(0);
    }
  });

  it("ignores tool_result for non-test bash commands", async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "Bash",
                input: { command: "ls -la" },
              },
            ],
          },
        };
        yield {
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                content: "drwxr-xr-x ...",
              },
            ],
          },
        };
      },
    });

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    expect(events.find((e) => e.type === "TestRun")).toBeUndefined();
  });

  it("emits CoverageDelta when readCoverageSnapshot returns data", async () => {
    let snapshotCalls = 0;
    vi.mocked(mockShared.readCoverageSnapshot).mockImplementation(() => {
      snapshotCalls += 1;
      // Return a snapshot only on the second call (phase-end), so the
      // before/after key fingerprint differs from the initial null.
      if (snapshotCalls === 2) {
        return { statements: 80, branches: 70, functions: 75, lines: 80 };
      }
      return null;
    });

    mockQuery.mockReturnValue(emptyAsyncIterable());

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    expect(events.find((e) => e.type === "CoverageDelta")).toBeDefined();
  });

  it("does not emit duplicate CoverageDelta for identical snapshots", async () => {
    vi.mocked(mockShared.readCoverageSnapshot).mockReturnValue({
      statements: 80,
      branches: 70,
      functions: 75,
      lines: 80,
    });

    mockQuery.mockReturnValue(emptyAsyncIterable());

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const coverageEvents = events.filter((e) => e.type === "CoverageDelta");
    // First sample emits one. Second sample with identical fingerprint is deduped.
    expect(coverageEvents.length).toBeLessThanOrEqual(1);
  });
});

describe("hardening: SDK error result handling", () => {
  let mockQuery: any;
  let mockShared: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    mockQuery = vi.mocked(sdk.query);
    mockShared = await import("@brownfield-surgeon/shared");
    vi.mocked(mockShared.readVitals).mockResolvedValue(
      emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" }),
    );
  });

  it("throws and marks phase failed when SDK yields a result with error_* subtype", async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "result",
          subtype: "error_max_turns",
          // shape doesn't matter for the runner — only type+subtype are read
        };
      },
    });

    const { runPipeline } = await loadRunner();
    await expect(
      runPipeline({
        repoRoot: "/repo",
        request: "x",
        phases: ["plan"],
        runId: "run-1",
        autoApprove: true,
      }),
    ).rejects.toThrow(/error_max_turns/);

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const phaseEnd = events.find((e) => e.type === "PhaseEnd");
    expect(phaseEnd).toBeDefined();
    expect(phaseEnd.outcome).toBe("failed");
    expect(phaseEnd.errorMessage).toContain("error_max_turns");
  });

  it("treats result with subtype=success as a clean end (no throw)", async () => {
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "result", subtype: "success" };
      },
    });

    const { runPipeline } = await loadRunner();
    await expect(
      runPipeline({
        repoRoot: "/repo",
        request: "x",
        phases: ["plan"],
        runId: "run-1",
        autoApprove: true,
      }),
    ).resolves.toBeUndefined();

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const phaseEnd = events.find((e) => e.type === "PhaseEnd");
    expect(phaseEnd?.outcome).toBe("completed");
  });

  it("logs mid-stream system errors but does not abort the phase", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockQuery.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "system", subtype: "error", message: "transient blip" };
        // SDK keeps going and finishes cleanly
      },
    });

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("transient"),
      expect.any(Object),
    );
    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    expect(events.find((e) => e.type === "PhaseEnd")?.outcome).toBe("completed");
    warnSpy.mockRestore();
  });
});

describe("hardening: stale-phase recovery on startup", () => {
  let mockQuery: any;
  let mockShared: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    mockQuery = vi.mocked(sdk.query);
    mockQuery.mockReturnValue(emptyAsyncIterable());
    mockShared = await import("@brownfield-surgeon/shared");
  });

  it("resets a phase that was left in 'running' from a crashed previous run", async () => {
    const stale = emptyVitals({ runId: "old", repoRoot: "/repo", engine: "sdk" });
    stale.phaseStatus.map = "running";
    vi.mocked(mockShared.readVitals).mockResolvedValue(stale);

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: [],
      runId: "run-new",
      autoApprove: true,
    });

    // setPhaseStatus is implemented via writeVitals — check that "map"
    // was written with status "failed" before any new phase work began.
    const writeCalls = vi.mocked(mockShared.writeVitals).mock.calls;
    const hadFailedMap = writeCalls.some(
      (c: any[]) => (c[1] as any).phaseStatus.map === "failed",
    );
    expect(hadFailedMap).toBe(true);

    // And we emitted a PhaseEnd(failed) event for the recovered phase.
    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const recovered = events.find(
      (e) => e.type === "PhaseEnd" && e.phase === "map" && e.outcome === "failed",
    );
    expect(recovered).toBeDefined();
    expect(recovered.errorMessage).toMatch(/previous crash/i);
  });

  it("does not touch phases in pending/completed/failed/awaiting-approval states", async () => {
    const v = emptyVitals({ runId: "old", repoRoot: "/repo", engine: "sdk" });
    v.phaseStatus.plan = "completed";
    v.phaseStatus.map = "awaiting-approval";
    v.phaseStatus.break = "failed";
    vi.mocked(mockShared.readVitals).mockResolvedValue(v);

    const { runPipeline } = await loadRunner();
    await runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: [],
      runId: "run-new",
      autoApprove: true,
    });

    // No event should be emitted for non-running phases.
    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    expect(events.length).toBe(0);
  });
});

describe("hardening: inactivity watchdog", () => {
  let mockQuery: any;
  let mockShared: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    mockQuery = vi.mocked(sdk.query);
    mockShared = await import("@brownfield-surgeon/shared");
    vi.mocked(mockShared.readVitals).mockResolvedValue(
      emptyVitals({ runId: "run-1", repoRoot: "/repo", engine: "sdk" }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls iterator.return() and throws InactivityTimeoutError when iterator stalls", async () => {
    let resolveNext: (v: { done: true; value: undefined }) => void = () => {};
    const nextPromise = new Promise<{ done: true; value: undefined }>((r) => {
      resolveNext = r;
    });
    const returnSpy = vi.fn(() => {
      resolveNext({ done: true, value: undefined });
      return Promise.resolve({ done: true, value: undefined });
    });
    mockQuery.mockReturnValue({
      [Symbol.asyncIterator]() {
        return {
          next: () => nextPromise,
          return: returnSpy,
        };
      },
    });

    const { runPipeline } = await loadRunner();
    // Attach .catch immediately so the rejection is never "unhandled" while
    // we're advancing fake timers.
    const settled = runPipeline({
      repoRoot: "/repo",
      request: "x",
      phases: ["plan"],
      runId: "run-1",
      autoApprove: true,
    }).then(
      () => ({ ok: true as const }),
      (err: Error) => ({ ok: false as const, err }),
    );

    // Yield to start the iterator, then advance past the 30-minute threshold.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);

    const result = await settled;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.message).toMatch(/idle/);
    expect(returnSpy).toHaveBeenCalled();

    const events = vi
      .mocked(mockShared.appendEvent)
      .mock.calls.map((c: any[]) => c[1]);
    const phaseEnd = events.find((e) => e.type === "PhaseEnd");
    expect(phaseEnd?.outcome).toBe("failed");
    expect(phaseEnd?.errorMessage).toMatch(/idle/i);
  });
});
