import { describe, it, expect } from "vitest";
import { __testing } from "./run-manager.js";

const { planSdkRunner, planManagedRunner } = __testing;

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
