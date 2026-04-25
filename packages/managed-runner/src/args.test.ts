import { describe, it, expect } from "vitest";
import { parseArgs, defaultScratchBranch } from "./args.js";

describe("parseArgs", () => {
  it("defaults runId to a generated id and dryRun to false", () => {
    const args = parseArgs([]);
    expect(args.runId).toMatch(/^run-/);
    expect(args.dryRun).toBe(false);
    expect(args.help).toBe(false);
  });

  it("parses repo, repo-url, base-branch, run-id, scratch-branch", () => {
    const args = parseArgs([
      "--repo",
      ".",
      "--repo-url",
      "https://github.com/x/y.git",
      "--base-branch",
      "develop",
      "--run-id",
      "r-fixed",
      "--scratch-branch",
      "surgery/r-fixed/finish",
    ]);
    expect(args.repoUrl).toBe("https://github.com/x/y.git");
    expect(args.baseBranch).toBe("develop");
    expect(args.runId).toBe("r-fixed");
    expect(args.scratchBranch).toBe("surgery/r-fixed/finish");
  });

  it("toggles dry-run and help", () => {
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--frobnicate"])).toThrow(/unknown flag/);
  });

  it("defaultScratchBranch follows surgery/<runId>/finish", () => {
    expect(defaultScratchBranch("r-1")).toBe("surgery/r-1/finish");
  });
});
