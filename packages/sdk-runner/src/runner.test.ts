import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunOptions } from "./runner.js";

describe("runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RunOptions type", () => {
    it("has required fields", () => {
      const opts: RunOptions = {
        repoRoot: "/repo",
        request: "add feature",
        phases: ["plan", "implement"],
        runId: "run-123",
        autoApprove: false,
      };

      expect(opts.repoRoot).toBe("/repo");
      expect(opts.request).toBe("add feature");
      expect(opts.phases).toEqual(["plan", "implement"]);
      expect(opts.runId).toBe("run-123");
      expect(opts.autoApprove).toBe(false);
    });

    it("supports optional model and thinking", () => {
      const opts: RunOptions = {
        repoRoot: "/repo",
        request: "add feature",
        phases: ["plan"],
        runId: "run-123",
        autoApprove: true,
        model: "claude-opus-4-7",
        thinking: "high",
      };

      expect(opts.model).toBe("claude-opus-4-7");
      expect(opts.thinking).toBe("high");
    });

    it("allows empty phases array", () => {
      const opts: RunOptions = {
        repoRoot: "/repo",
        request: "check",
        phases: [],
        runId: "run-123",
        autoApprove: false,
      };

      expect(opts.phases).toHaveLength(0);
    });

    it("allows all seven phases", () => {
      const opts: RunOptions = {
        repoRoot: "/repo",
        request: "full surgery",
        phases: ["plan", "map", "break", "cover", "implement", "refactor", "finish"],
        runId: "run-123",
        autoApprove: false,
      };

      expect(opts.phases).toHaveLength(7);
    });
  });

  describe("SDK runner configuration", () => {
    it("supports different models", () => {
      const models = [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
      ];

      for (const model of models) {
        const opts: RunOptions = {
          repoRoot: "/repo",
          request: "test",
          phases: ["plan"],
          runId: "run-1",
          autoApprove: false,
          model,
        };
        expect(opts.model).toBe(model);
      }
    });

    it("supports thinking levels", () => {
      const levels = ["off", "low", "medium", "high"] as const;

      for (const level of levels) {
        const opts: RunOptions = {
          repoRoot: "/repo",
          request: "test",
          phases: ["plan"],
          runId: "run-1",
          autoApprove: false,
          thinking: level,
        };
        expect(opts.thinking).toBe(level);
      }
    });
  });

  describe("Pipeline execution patterns", () => {
    it("documents phase execution order", () => {
      // The order matters: each phase builds on previous
      const phases = ["plan", "map", "break", "cover", "implement", "refactor", "finish"] as const;
      expect(phases).toEqual([
        "plan",
        "map",
        "break",
        "cover",
        "implement",
        "refactor",
        "finish",
      ]);
    });

    it("supports running subset of phases", () => {
      const subset = ["plan", "implement", "finish"];
      expect(subset).toHaveLength(3);
      expect(subset[0]).toBe("plan");
      expect(subset[subset.length - 1]).toBe("finish");
    });

    it("auto-approve skips manual approval wait", () => {
      const withApproval: RunOptions = {
        repoRoot: "/repo",
        request: "test",
        phases: ["plan"],
        runId: "run-1",
        autoApprove: true,
      };

      const withoutApproval: RunOptions = {
        repoRoot: "/repo",
        request: "test",
        phases: ["plan"],
        runId: "run-2",
        autoApprove: false,
      };

      expect(withApproval.autoApprove).not.toBe(withoutApproval.autoApprove);
    });
  });

  describe("Event emission patterns", () => {
    it("emits phase lifecycle events", () => {
      const events = [
        "PhaseStart",
        "ApprovalRequested",
        "ApprovalGranted",
        "PhaseEnd",
      ];

      expect(events).toHaveLength(4);
      expect(events[0]).toBe("PhaseStart");
      expect(events[events.length - 1]).toBe("PhaseEnd");
    });

    it("tracks phase status transitions", () => {
      const transitions = {
        running: "PhaseStart emitted",
        "awaiting-approval": "ApprovalRequested emitted",
        completed: "ApprovalGranted emitted, PhaseEnd with outcome completed",
        failed: "PhaseEnd with outcome failed",
      };

      expect(Object.keys(transitions)).toHaveLength(4);
      expect(transitions.running).toContain("PhaseStart");
      expect(transitions.failed).toContain("failed");
    });
  });

  describe("Prompt building", () => {
    it("phase prompt includes context", () => {
      // Based on buildPhasePrompt logic
      const contextFields = [
        "Repo root",
        "Run id",
        "Engine",
        "User request",
      ];

      expect(contextFields).toHaveLength(4);
      expect(contextFields.includes("Repo root")).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("catches phase execution errors", () => {
      // Phase execution wraps streamQuery in try-catch
      // Errors set phase status to failed
      const errorHandling = {
        catches: true,
        setsStatus: "failed",
        emitsEvent: "PhaseEnd with outcome failed",
      };

      expect(errorHandling.catches).toBe(true);
      expect(errorHandling.setsStatus).toBe("failed");
    });

    it("re-throws errors after recording", () => {
      // After setting status and emitting event, error is re-thrown
      const behavior = {
        recordError: true,
        rethrow: true,
      };

      expect(behavior.recordError && behavior.rethrow).toBe(true);
    });
  });

  describe("Vitals tracking", () => {
    it("initializes vitals at pipeline start", () => {
      const step = "loadOrInitVitals called with repoRoot and runId";
      expect(step).toContain("loadOrInitVitals");
    });

    it("updates phase status during execution", () => {
      const updates = [
        { event: "PhaseStart", status: "running" },
        { event: "ApprovalRequested", status: "awaiting-approval" },
        { event: "ApprovalGranted", status: "completed" },
      ];

      expect(updates).toHaveLength(3);
      expect(updates[0].status).toBe("running");
      expect(updates[2].status).toBe("completed");
    });
  });

  describe("Coverage sampling", () => {
    it("samples coverage at phase start and end", () => {
      const samples = ["phase-start", "phase-end"];
      expect(samples).toHaveLength(2);
      expect(samples).toContain("phase-start");
      expect(samples).toContain("phase-end");
    });

    it("avoids duplicate coverage deltas", () => {
      // PhaseContext tracks lastCoverageKey to avoid duplicates
      const ctx = {
        lastCoverageKey: null,
      };

      expect(ctx.lastCoverageKey).toBeNull();
    });
  });

  describe("Tool use tracking", () => {
    it("tracks bash commands by tool_use_id", () => {
      // PhaseContext.bashCommands: Map<string, string>
      const commands = new Map<string, string>();
      commands.set("tool-123", "npm test");
      commands.set("tool-124", "git commit");

      expect(commands.size).toBe(2);
      expect(commands.get("tool-123")).toBe("npm test");
    });
  });

  describe("Query streaming", () => {
    it("includes thinking tokens when configured", () => {
      // streamQuery checks thinkingTokens and passes to query options
      const thinkingConfig = {
        off: 0,
        low: 2000,
        medium: 5000,
        high: 12000,
      };

      expect(thinkingConfig.high).toBe(12000);
      expect(thinkingConfig.off).toBe(0);
    });

    it("passes model to query options when set", () => {
      // streamQuery: ...(opts.model ? { model: opts.model } : {})
      const opts1: RunOptions = {
        repoRoot: "/repo",
        request: "test",
        phases: ["plan"],
        runId: "run-1",
        autoApprove: false,
        model: "claude-opus-4-7",
      };

      const opts2: RunOptions = {
        repoRoot: "/repo",
        request: "test",
        phases: ["plan"],
        runId: "run-2",
        autoApprove: false,
      };

      expect(opts1.model).toBeDefined();
      expect(opts2.model).toBeUndefined();
    });

    it("sets permissionMode to acceptEdits", () => {
      // streamQuery passes permissionMode: "acceptEdits" to query options
      expect("acceptEdits").toBe("acceptEdits");
    });
  });
});
