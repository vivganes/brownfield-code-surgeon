import { describe, it, expect } from "vitest";
import { __testing } from "./run-manager.js";

const { planSdkRunner, planManagedRunner, planChain, defaultScratchBranch } =
  __testing;

describe("planSdkRunner", () => {
  it("targets dist/cli.js in the sdk-runner package", () => {
    const plan = planSdkRunner({
      repoRoot: "/work/repo",
      request: "add comments",
    });
    expect(plan.cliPath.replace(/\\/g, "/")).toMatch(
      /sdk-runner\/dist\/cli\.js$/,
    );
    expect(plan.logPrefix).toBe("sdk-runner");
  });

  it("includes --repo and --request as the leading args", () => {
    const plan = planSdkRunner({
      repoRoot: "/work/repo",
      request: "add comments",
    });
    // index 0 is cliPath; --repo and --request follow
    expect(plan.cliArgs.slice(1, 5)).toEqual([
      "--repo",
      "/work/repo",
      "--request",
      "add comments",
    ]);
  });

  it("appends --auto-approve, --run-id, --model, --thinking when set", () => {
    const plan = planSdkRunner({
      repoRoot: "/work",
      request: "x",
      autoApprove: true,
      runId: "r-7",
      model: "claude-opus-4-7",
      thinking: "high",
    });
    expect(plan.cliArgs).toContain("--auto-approve");
    expect(plan.cliArgs).toContain("--run-id");
    expect(plan.cliArgs).toContain("r-7");
    expect(plan.cliArgs).toContain("--model");
    expect(plan.cliArgs).toContain("claude-opus-4-7");
    expect(plan.cliArgs).toContain("--thinking");
    expect(plan.cliArgs).toContain("high");
  });
});

describe("planManagedRunner", () => {
  it("targets dist/cli.js in the managed-runner package", () => {
    const plan = planManagedRunner({
      repoRoot: "/work/repo",
      request: "x",
    });
    expect(plan.cliPath.replace(/\\/g, "/")).toMatch(
      /managed-runner\/dist\/cli\.js$/,
    );
    expect(plan.logPrefix).toBe("managed-runner");
  });

  it("passes --repo and --request when present", () => {
    const plan = planManagedRunner({
      repoRoot: "/work/repo",
      request: "x",
    });
    expect(plan.cliArgs).toContain("--repo");
    expect(plan.cliArgs).toContain("/work/repo");
    expect(plan.cliArgs).toContain("--request");
    expect(plan.cliArgs).toContain("x");
  });

  it("forwards managed.* fields as flags only when set", () => {
    const plan = planManagedRunner({
      repoRoot: "/work",
      request: "x",
      runId: "r-1",
      model: "claude-opus-4-7",
      managed: {
        repoUrl: "https://github.com/x/y.git",
        baseBranch: "main",
        scratchBranch: "surgery/r-1/finish",
        agentEnvId: "env_abc",
      },
    });
    expect(plan.cliArgs).toContain("--run-id");
    expect(plan.cliArgs).toContain("r-1");
    expect(plan.cliArgs).toContain("--model");
    expect(plan.cliArgs).toContain("claude-opus-4-7");
    expect(plan.cliArgs).toContain("--repo-url");
    expect(plan.cliArgs).toContain("https://github.com/x/y.git");
    expect(plan.cliArgs).toContain("--base-branch");
    expect(plan.cliArgs).toContain("main");
    expect(plan.cliArgs).toContain("--scratch-branch");
    expect(plan.cliArgs).toContain("surgery/r-1/finish");
    expect(plan.cliArgs).toContain("--agent-env-id");
    expect(plan.cliArgs).toContain("env_abc");
  });

  it("omits managed.* flags when the args object is missing or empty", () => {
    const plan = planManagedRunner({
      repoRoot: "/work",
      request: "x",
    });
    expect(plan.cliArgs).not.toContain("--repo-url");
    expect(plan.cliArgs).not.toContain("--base-branch");
    expect(plan.cliArgs).not.toContain("--scratch-branch");
    expect(plan.cliArgs).not.toContain("--agent-env-id");
  });
});

describe("planChain", () => {
  it("returns a single sdk-runner stage for engine=sdk", () => {
    const { plans, runId } = planChain({
      repoRoot: "/work",
      request: "x",
      engine: "sdk",
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.logPrefix).toBe("sdk-runner");
    // sdk standalone does NOT push or commit per phase
    expect(plans[0]!.cliArgs).not.toContain("--commit-per-phase");
    expect(plans[0]!.cliArgs).not.toContain("--push-to");
    expect(runId).toMatch(/^run-/);
  });

  it("returns two stages for engine=managed: sdk phases 1-6, then managed", () => {
    const { plans, runId } = planChain({
      repoRoot: "/work",
      request: "x",
      engine: "managed",
      runId: "r-fixed",
      managed: { agentEnvId: "env_abc" },
    });
    expect(plans).toHaveLength(2);
    expect(plans[0]!.logPrefix).toBe("sdk-runner");
    expect(plans[1]!.logPrefix).toBe("managed-runner");
    expect(runId).toBe("r-fixed");
  });

  it("stage 1 (sdk) runs only phases 1-6 with commit-per-phase + push-to scratch", () => {
    const { plans } = planChain({
      repoRoot: "/work",
      request: "x",
      engine: "managed",
      runId: "r-1",
      managed: { agentEnvId: "env_abc" },
    });
    const sdk = plans[0]!.cliArgs;
    expect(sdk).toContain("--phases");
    const phasesIdx = sdk.indexOf("--phases");
    expect(sdk[phasesIdx + 1]).toBe("plan,map,break,cover,implement,refactor");
    expect(sdk).toContain("--commit-per-phase");
    expect(sdk).toContain("--push-to");
    expect(sdk).toContain(defaultScratchBranch("r-1"));
  });

  it("stage 2 (managed) is told to check out the scratch branch", () => {
    const { plans } = planChain({
      repoRoot: "/work",
      request: "x",
      engine: "managed",
      runId: "r-1",
      managed: { agentEnvId: "env_abc" },
    });
    const managed = plans[1]!.cliArgs;
    expect(managed).toContain("--checkout-branch");
    const idx = managed.indexOf("--checkout-branch");
    expect(managed[idx + 1]).toBe(defaultScratchBranch("r-1"));
    // Both stages share the same runId.
    expect(managed).toContain("--run-id");
    expect(managed).toContain("r-1");
  });

  it("respects an explicit managed.scratchBranch override across both stages", () => {
    const { plans } = planChain({
      repoRoot: "/work",
      request: "x",
      engine: "managed",
      runId: "r-1",
      managed: {
        agentEnvId: "env_abc",
        scratchBranch: "custom/branch",
      },
    });
    expect(plans[0]!.cliArgs).toContain("custom/branch");
    expect(plans[1]!.cliArgs).toContain("custom/branch");
  });

  it("generates a runId when none is provided", () => {
    const { runId } = planChain({
      repoRoot: "/work",
      request: "x",
      engine: "sdk",
    });
    expect(runId).toMatch(/^run-/);
  });

  it("throws for engine=plugin (user-driven, not plannable)", () => {
    expect(() =>
      planChain({ repoRoot: "/work", request: "x", engine: "plugin" }),
    ).toThrow(/plugin/);
  });
});
