import { describe, it, expect } from "vitest";
import { buildKickoffPrompt } from "./session.js";

describe("buildKickoffPrompt", () => {
  it("includes runId, base branch, and scratch branch in the body", () => {
    const text = buildKickoffPrompt({
      runId: "r-42",
      baseBranch: "main",
      scratchBranch: "surgery/r-42/finish",
    });
    expect(text).toContain("r-42");
    expect(text).toContain("main");
    expect(text).toContain("surgery/r-42/finish");
    expect(text).toContain("/workspace/repo");
  });

  it("includes the original surgery request when provided", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
      request: "add a comments feature",
    });
    expect(text).toContain("add a comments feature");
  });

  it("omits the request line when not provided", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
    });
    expect(text).not.toMatch(/Original surgery request/);
  });

  it("instructs the agent to push to the scratch branch", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
    });
    expect(text).toContain("git push -u origin surgery/r-1/finish");
  });
});
