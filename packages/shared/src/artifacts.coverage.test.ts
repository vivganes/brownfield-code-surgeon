/**
 * Coverage tests for artifacts.ts lines 28-29, 32-33 (planFile, seamsFile).
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { planFile, seamsFile } from "./artifacts.js";

describe("artifacts path helpers", () => {
  it("planFile returns <repoRoot>/plan/plan.md", () => {
    expect(planFile("/repo")).toBe(path.join("/repo", "plan/plan.md"));
  });

  it("seamsFile returns <repoRoot>/plan/seams-and-dependencies.md", () => {
    expect(seamsFile("/repo")).toBe(
      path.join("/repo", "plan/seams-and-dependencies.md"),
    );
  });
});
