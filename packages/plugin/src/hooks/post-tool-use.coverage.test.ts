/**
 * Supplemental tests for post-tool-use covering the CoverageDelta path
 * (lines ~144-174) not reached by the existing post-tool-use.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./post-tool-use.js";
import { emptyVitals, writeVitals, readVitals, eventsFile } from "./_lib.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "post-tool-use-cov-test-"));
}

function events(tmp: string) {
  if (!fs.existsSync(eventsFile(tmp))) return [];
  return fs
    .readFileSync(eventsFile(tmp), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("post-tool-use coverage delta path", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = mkTmp();
    env = { SURGERY_REPO_ROOT: tmp };
    const v = emptyVitals(tmp);
    v.currentPhase = "implement";
    writeVitals(tmp, v);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeCoverageSummary(statements: number) {
    const dir = path.join(tmp, "coverage");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "coverage-summary.json"),
      JSON.stringify({ total: { statements: { pct: statements } } }),
    );
  }

  it("emits CoverageDelta and updates vitals.coverage.current when coverage file exists", () => {
    writeCoverageSummary(72.5);

    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 10 passed, 10 total" },
      },
      env,
    });

    const evs = events(tmp);
    const delta = evs.find((e: { type: string }) => e.type === "CoverageDelta");
    expect(delta).toBeDefined();
    expect(delta.after.statements).toBe(72.5);

    const v = readVitals(tmp)!;
    expect(v.coverage.current).toEqual({ statements: 72.5 });
  });

  it("does not emit a second CoverageDelta when coverage snapshot is unchanged", () => {
    writeCoverageSummary(72.5);

    // First run — establishes baseline
    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 10 passed, 10 total" },
      },
      env,
    });

    // Second run — same coverage on disk, should NOT emit another CoverageDelta
    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 10 passed, 10 total" },
      },
      env,
    });

    const deltas = events(tmp).filter(
      (e: { type: string }) => e.type === "CoverageDelta",
    );
    expect(deltas).toHaveLength(1);
  });

  it("emits a new CoverageDelta when coverage improves", () => {
    writeCoverageSummary(72.5);

    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 10 passed, 10 total" },
      },
      env,
    });

    // Coverage improves
    writeCoverageSummary(80.0);

    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 10 passed, 10 total" },
      },
      env,
    });

    const deltas = events(tmp).filter(
      (e: { type: string }) => e.type === "CoverageDelta",
    );
    expect(deltas).toHaveLength(2);
    expect(deltas[1].before.statements).toBe(72.5);
    expect(deltas[1].after.statements).toBe(80.0);
  });

  it("does not emit CoverageDelta when no coverage file on disk", () => {
    // No coverage file written

    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 5 passed, 5 total" },
      },
      env,
    });

    expect(events(tmp).some((e: { type: string }) => e.type === "CoverageDelta")).toBe(false);
  });

  it("uses existing baseline as 'before' snapshot when current is null", () => {
    // Manually set a baseline in vitals
    const v = readVitals(tmp)!;
    v.coverage.baseline = { statements: 60.0 };
    v.coverage.current = null;
    writeVitals(tmp, v);

    writeCoverageSummary(75.0);

    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "Tests: 5 passed, 5 total" },
      },
      env,
    });

    const delta = events(tmp).find((e: { type: string }) => e.type === "CoverageDelta");
    expect(delta).toBeDefined();
    expect(delta.before.statements).toBe(60.0);
    expect(delta.after.statements).toBe(75.0);
  });

  it("handles MultiEdit write tool — emits ArtifactWritten", () => {
    const p = path.join(tmp, "src", "foo.ts");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "export const x = 1;");

    run({
      input: {
        tool_name: "MultiEdit",
        tool_input: { file_path: p },
      },
      env,
    });

    const artifact = events(tmp).find(
      (e: { type: string }) => e.type === "ArtifactWritten",
    );
    expect(artifact).toBeDefined();
    expect(artifact.path).toBe(p);
    expect(artifact.kind).toBe("source");
  });

  it("handles NotebookEdit write tool — emits ArtifactWritten with notebook_path", () => {
    const p = path.join(tmp, "notebook.ipynb");
    fs.writeFileSync(p, "{}");

    run({
      input: {
        tool_name: "NotebookEdit",
        tool_input: { notebook_path: p },
      },
      env,
    });

    const artifact = events(tmp).find(
      (e: { type: string }) => e.type === "ArtifactWritten",
    );
    expect(artifact).toBeDefined();
    expect(artifact.path).toBe(p);
  });

  it("skips Bash test parsing when tool_response has no stdout", () => {
    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stderr: "some error" },
      },
      env,
    });

    expect(events(tmp).some((e: { type: string }) => e.type === "TestRun")).toBe(false);
  });
});
