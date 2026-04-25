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

  it("uses the resuming narrative when checkoutBranch === scratchBranch", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
      checkoutBranch: "surgery/r-1/finish",
    });
    expect(text).toMatch(/Phases 1.{0,3}6.*already been completed/);
    expect(text).toContain("You are already on `surgery/r-1/finish`");
  });

  it("uses the fresh-run narrative when checkoutBranch is the base branch", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
    });
    expect(text).toMatch(/fresh run on the base branch/);
    expect(text).toContain("git checkout -B surgery/r-1/finish");
  });

  it("embeds attached files as fenced code blocks", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
      checkoutBranch: "surgery/r-1/finish",
      attachedFiles: [
        { path: "plan/plan.md", content: "## the plan\nstep 1\n" },
        { path: "plan/seams-and-dependencies.md", content: "seams\n" },
      ],
    });
    expect(text).toContain("### plan/plan.md");
    expect(text).toContain("## the plan");
    expect(text).toContain("### plan/seams-and-dependencies.md");
    expect(text).toContain("seams");
  });

  it("defangs inner ``` fences in attached file content", () => {
    const text = buildKickoffPrompt({
      runId: "r-1",
      baseBranch: "main",
      scratchBranch: "surgery/r-1/finish",
      attachedFiles: [
        { path: "plan/plan.md", content: "before\n```ts\ncode\n```\nafter" },
      ],
    });
    // The outer fence pair belongs to our wrapper. Inner ``` should be
    // replaced with the zero-width-joiner trick so the markdown stays valid.
    const fenceCount = (text.match(/^```$/gm) ?? []).length;
    expect(fenceCount).toBe(2);
  });
});
