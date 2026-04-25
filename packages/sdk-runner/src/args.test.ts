import { describe, it, expect, beforeEach } from "vitest";
import { parseArgs, THINKING_TOKENS, type CliArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses minimal arguments", () => {
    const args = parseArgs(["--repo", ".", "--request", "add feature"]);
    expect(args.request).toBe("add feature");
    expect(args.repoRoot).toBeDefined();
  });

  it("requires --request flag", () => {
    const args = parseArgs(["--repo", "."]);
    expect(args.request).toBe("");
  });

  it("defaults to all phases", () => {
    const args = parseArgs(["--repo", ".", "--request", "test"]);
    expect(args.phases).toEqual([
      "plan",
      "map",
      "break",
      "cover",
      "implement",
      "refactor",
      "finish",
    ]);
  });

  it("parses custom phases", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--phases", "plan,map"]);
    expect(args.phases).toEqual(["plan", "map"]);
  });

  it("parses phases with whitespace", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--phases", "plan, map, break"]);
    expect(args.phases).toEqual(["plan", "map", "break"]);
  });

  it("parses --auto-approve flag", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--auto-approve"]);
    expect(args.autoApprove).toBe(true);
  });

  it("defaults autoApprove to false", () => {
    const args = parseArgs(["--repo", ".", "--request", "test"]);
    expect(args.autoApprove).toBe(false);
  });

  it("parses custom run ID", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--run-id", "custom-run-123"]);
    expect(args.runId).toBe("custom-run-123");
  });

  it("generates run ID when not provided", () => {
    const args = parseArgs(["--repo", ".", "--request", "test"]);
    expect(args.runId).toMatch(/^run-/);
  });

  it("parses --model flag", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--model", "claude-opus-4-7"]);
    expect(args.model).toBe("claude-opus-4-7");
  });

  it("parses --thinking flag with valid values", () => {
    const levels = ["off", "low", "medium", "high"] as const;
    for (const level of levels) {
      const args = parseArgs(["--repo", ".", "--request", "test", "--thinking", level]);
      expect(args.thinking).toBe(level);
    }
  });

  it("throws on invalid --thinking value", () => {
    expect(() => {
      parseArgs(["--repo", ".", "--request", "test", "--thinking", "invalid"]);
    }).toThrow("--thinking must be off|low|medium|high");
  });

  it("case-insensitive thinking levels", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--thinking", "MEDIUM"]);
    expect(args.thinking).toBe("medium");
  });

  it("parses -h flag as help", () => {
    const args = parseArgs(["-h"]);
    expect(args.help).toBe(true);
  });

  it("parses --help flag", () => {
    const args = parseArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  it("throws on unknown flag", () => {
    expect(() => {
      parseArgs(["--unknown-flag"]);
    }).toThrow("unknown flag: --unknown-flag");
  });

  it("ignores positional arguments", () => {
    const args = parseArgs(["positional", "--request", "test", "another"]);
    expect(args.request).toBe("test");
  });

  it("combines multiple flags", () => {
    const args = parseArgs([
      "--repo",
      "/tmp/repo",
      "--request",
      "implement feature X",
      "--phases",
      "plan,implement",
      "--auto-approve",
      "--run-id",
      "test-123",
      "--model",
      "claude-opus-4-7",
      "--thinking",
      "high",
    ]);

    expect(args.repoRoot).toMatch(/tmp[\\/]repo/);
    expect(args.request).toBe("implement feature X");
    expect(args.phases).toEqual(["plan", "implement"]);
    expect(args.autoApprove).toBe(true);
    expect(args.runId).toBe("test-123");
    expect(args.model).toBe("claude-opus-4-7");
    expect(args.thinking).toBe("high");
  });

  it("handles missing values gracefully", () => {
    const args = parseArgs(["--repo"]);
    // Should resolve to current directory
    expect(args.repoRoot).toBeDefined();
  });

  it("resolves repo paths", () => {
    const args = parseArgs(["--repo", ".", "--request", "test"]);
    expect(args.repoRoot).toBeDefined();
    expect(args.repoRoot).not.toBe(".");
  });

  it("handles empty phases list", () => {
    const args = parseArgs(["--repo", ".", "--request", "test", "--phases", ""]);
    expect(args.phases).toHaveLength(0);
  });

  it("handles invalid phase names", () => {
    expect(() => {
      parseArgs(["--repo", ".", "--request", "test", "--phases", "invalid-phase"]);
    }).toThrow();
  });

  it("default help flag is false", () => {
    const args = parseArgs(["--repo", ".", "--request", "test"]);
    expect(args.help).toBe(false);
  });

  it("parses request with special characters", () => {
    const request = "add feature with 'quotes' and \"double quotes\" and special $chars!";
    const args = parseArgs(["--repo", ".", "--request", request]);
    expect(args.request).toBe(request);
  });

  it("preserves exact request text", () => {
    const request = "   add feature   with   spaces   ";
    const args = parseArgs(["--repo", ".", "--request", request]);
    expect(args.request).toBe(request);
  });

  it("commitPerPhase defaults to false", () => {
    const args = parseArgs(["--repo", ".", "--request", "x"]);
    expect(args.commitPerPhase).toBe(false);
    expect(args.pushTo).toBeUndefined();
  });

  it("parses --commit-per-phase", () => {
    const args = parseArgs(["--repo", ".", "--request", "x", "--commit-per-phase"]);
    expect(args.commitPerPhase).toBe(true);
  });

  it("parses --push-to and implicitly enables commit-per-phase", () => {
    const args = parseArgs([
      "--repo",
      ".",
      "--request",
      "x",
      "--push-to",
      "surgery/r-1/finish",
    ]);
    expect(args.pushTo).toBe("surgery/r-1/finish");
    expect(args.commitPerPhase).toBe(true);
  });
});

describe("THINKING_TOKENS", () => {
  it("has correct token values", () => {
    expect(THINKING_TOKENS.off).toBe(0);
    expect(THINKING_TOKENS.low).toBe(2000);
    expect(THINKING_TOKENS.medium).toBe(5000);
    expect(THINKING_TOKENS.high).toBe(12000);
  });

  it("has entry for each level", () => {
    const levels = ["off", "low", "medium", "high"] as const;
    for (const level of levels) {
      expect(THINKING_TOKENS[level]).toBeDefined();
      expect(typeof THINKING_TOKENS[level]).toBe("number");
    }
  });

  it("tokens are non-negative", () => {
    Object.values(THINKING_TOKENS).forEach((tokens) => {
      expect(tokens).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("HELP text", () => {
  it("contains command name", async () => {
    const { HELP } = await import("./args.js");
    expect(HELP).toContain("surgery-run");
  });

  it("contains usage information", async () => {
    const { HELP } = await import("./args.js");
    expect(HELP).toContain("Usage:");
    expect(HELP).toContain("--repo");
    expect(HELP).toContain("--request");
  });

  it("documents all flags", async () => {
    const { HELP } = await import("./args.js");
    expect(HELP).toContain("--phases");
    expect(HELP).toContain("--auto-approve");
    expect(HELP).toContain("--run-id");
    expect(HELP).toContain("--model");
    expect(HELP).toContain("--thinking");
    expect(HELP).toContain("--help");
  });
});
