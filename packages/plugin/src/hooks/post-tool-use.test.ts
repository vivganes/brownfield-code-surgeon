import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run, parseTestOutput } from "./post-tool-use.js";
import { emptyVitals, writeVitals, readVitals, eventsFile } from "./_lib.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "post-tool-use-test-"));
}

function events(tmp: string) {
  if (!fs.existsSync(eventsFile(tmp))) return [];
  return fs
    .readFileSync(eventsFile(tmp), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("parseTestOutput", () => {
  it("parses Jest-style 'Tests: X passed, Y total'", () => {
    const r = parseTestOutput("Tests: 12 passed, 12 total");
    expect(r).toEqual({ passed: 12, total: 12 });
  });

  it("parses Mocha-style 'X passing / Y failing'", () => {
    const r = parseTestOutput("  42 passing (1.2s)\n  3 failing");
    expect(r).toEqual({ passed: 42, failed: 3, total: 45 });
  });

  it("parses pytest-style '=== N passed ==='", () => {
    const r = parseTestOutput("========= 9 passed, 1 failed in 0.3s =========");
    expect(r).toEqual({ passed: 9, failed: 1, total: 10 });
  });

  it("returns null on unrecognized output", () => {
    expect(parseTestOutput("nothing here")).toBeNull();
  });
});

describe("post-tool-use run()", () => {
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

  it("no-ops when vitals are missing", () => {
    fs.rmSync(path.join(tmp, ".surgery"), { recursive: true, force: true });
    const result = run({
      input: { tool_name: "Write", tool_input: { file_path: "a.ts" } },
      env,
    });
    expect(result.exitCode).toBe(0);
    expect(events(tmp)).toHaveLength(0);
  });

  it("emits a ToolUse event for every tool invocation", () => {
    run({ input: { tool_name: "Read", tool_input: {} }, env });
    const evs = events(tmp);
    expect(evs).toHaveLength(1);
    expect(evs[0].type).toBe("ToolUse");
    expect(evs[0].tool).toBe("Read");
    expect(evs[0].blocked).toBe(false);
  });

  it("emits ArtifactWritten and records the artifact on writes", () => {
    const artifactPath = path.join(tmp, "plan", "plan.md");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, "# Plan\n");

    run({
      input: { tool_name: "Write", tool_input: { file_path: artifactPath } },
      env,
    });

    const evs = events(tmp);
    const artifact = evs.find((e) => e.type === "ArtifactWritten");
    expect(artifact).toBeDefined();
    expect(artifact.path).toBe(artifactPath);
    expect(artifact.kind).toBe("plan");
    expect(artifact.bytes).toBeGreaterThan(0);

    const vitals = readVitals(tmp)!;
    expect(vitals.artifacts).toContain(artifactPath);
  });

  it("records bytes=0 if the file doesn't exist on disk", () => {
    run({
      input: {
        tool_name: "Edit",
        tool_input: { file_path: path.join(tmp, "ghost.md") },
      },
      env,
    });
    const artifact = events(tmp).find((e) => e.type === "ArtifactWritten");
    expect(artifact.bytes).toBe(0);
  });

  it("deduplicates artifacts across repeated writes", () => {
    const p = path.join(tmp, "plan", "plan.md");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "x");
    for (let i = 0; i < 3; i++) {
      run({ input: { tool_name: "Write", tool_input: { file_path: p } }, env });
    }
    const vitals = readVitals(tmp)!;
    expect(vitals.artifacts.filter((a) => a === p)).toHaveLength(1);
  });

  it("parses test output from Bash and emits TestRun + updates vitals", () => {
    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "========= 9 passed, 1 failed in 0.3s =========" },
      },
      env,
    });
    const testRun = events(tmp).find((e) => e.type === "TestRun");
    expect(testRun).toMatchObject({ passed: 9, failed: 1, total: 10 });
    expect(readVitals(tmp)!.tests).toEqual({
      total: 10,
      passing: 9,
      failing: 1,
      skipped: 0,
    });
  });

  it("ignores Bash commands that aren't test runners", () => {
    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "ls -la" },
        tool_response: { stdout: "9 passed" },
      },
      env,
    });
    expect(events(tmp).some((e) => e.type === "TestRun")).toBe(false);
  });

  it("ignores test invocations with unparseable output", () => {
    run({
      input: {
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { stdout: "¯\\_(ツ)_/¯" },
      },
      env,
    });
    expect(events(tmp).some((e) => e.type === "TestRun")).toBe(false);
  });
});
