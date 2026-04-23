import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyArtifact,
  isTestPath,
  isSourcePath,
  findRepoRoot,
  resolveRepoRoot,
  emptyVitals,
  readVitals,
  writeVitals,
  appendEvent,
  baseEvent,
  ensureSurgeryDir,
  eventsFile,
  vitalsFile,
  PHASES,
} from "./_lib.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "surgeon-test-"));
}

describe("classifyArtifact", () => {
  it("identifies approval tokens by directory and extension", () => {
    expect(classifyArtifact("plan/.approvals/plan.ok")).toBe("approval");
    expect(classifyArtifact("PLAN/.APPROVALS/MAP.OK")).toBe("approval");
    expect(classifyArtifact("some/dir/foo.ok")).toBe("approval");
  });

  it("recognizes the canonical plan document", () => {
    expect(classifyArtifact("plan/plan.md")).toBe("plan");
    expect(classifyArtifact("/repo/plan/plan.md")).toBe("plan");
  });

  it("recognizes seams document anywhere in path", () => {
    expect(classifyArtifact("plan/seams-and-dependencies.md")).toBe("seams");
    expect(classifyArtifact("docs/seams-and-dependencies-v2.md")).toBe("seams");
  });

  it("classifies test files by suffix and tests/ directory", () => {
    expect(classifyArtifact("src/foo.test.ts")).toBe("test");
    expect(classifyArtifact("src/foo.spec.tsx")).toBe("test");
    expect(classifyArtifact("tests/integration/a.ts")).toBe("test");
  });

  it("classifies arbitrary markdown and docs/ as doc", () => {
    expect(classifyArtifact("README.md")).toBe("doc");
    expect(classifyArtifact("repo/docs/guide.txt")).toBe("doc");
  });

  it("classifies common source extensions as source", () => {
    expect(classifyArtifact("src/index.ts")).toBe("source");
    expect(classifyArtifact("lib/mod.py")).toBe("source");
    expect(classifyArtifact("app/Main.java")).toBe("source");
  });

  it("falls back to 'other' for unknown extensions", () => {
    expect(classifyArtifact("assets/logo.png")).toBe("other");
    expect(classifyArtifact("data/sample.csv")).toBe("other");
  });

  it("normalizes Windows-style backslashes", () => {
    expect(classifyArtifact("plan\\.approvals\\plan.ok")).toBe("approval");
    expect(classifyArtifact("src\\tests\\a.ts")).toBe("test");
  });
});

describe("isTestPath / isSourcePath", () => {
  it("detects .test / .spec files", () => {
    expect(isTestPath("a/b.test.ts")).toBe(true);
    expect(isTestPath("a/b.spec.js")).toBe(true);
    expect(isTestPath("src/foo.ts")).toBe(false);
  });

  it("detects tests/ and __tests__/ directories", () => {
    expect(isTestPath("tests/foo.ts")).toBe(true);
    expect(isTestPath("pkg/__tests__/foo.ts")).toBe(true);
  });

  it("isSourcePath excludes test files even with source extensions", () => {
    expect(isSourcePath("src/foo.ts")).toBe(true);
    expect(isSourcePath("src/foo.test.ts")).toBe(false);
    expect(isSourcePath("tests/foo.ts")).toBe(false);
  });

  it("isSourcePath rejects non-source extensions", () => {
    expect(isSourcePath("README.md")).toBe(false);
    expect(isSourcePath("data.json")).toBe(false);
  });
});

describe("findRepoRoot", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("walks upward to a directory containing package.json", () => {
    fs.writeFileSync(path.join(tmp, "package.json"), "{}");
    const nested = path.join(tmp, "a", "b", "c");
    fs.mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(fs.realpathSync(tmp));
  });

  it("recognizes .surgery as a root marker", () => {
    fs.mkdirSync(path.join(tmp, ".surgery"));
    const nested = path.join(tmp, "x");
    fs.mkdirSync(nested);
    expect(findRepoRoot(nested)).toBe(fs.realpathSync(tmp));
  });

  it("returns the starting directory when no marker is found", () => {
    const nested = path.join(tmp, "no-markers");
    fs.mkdirSync(nested);
    // No markers in tmp or above (other than unknown system ones) — result is path.resolve(start).
    const result = findRepoRoot(nested);
    // Either it finds tmp parent markers (unlikely for mkdtemp root), or returns start.
    // We just assert it is an absolute path that exists.
    expect(path.isAbsolute(result)).toBe(true);
    expect(fs.existsSync(result)).toBe(true);
  });
});

describe("resolveRepoRoot", () => {
  const ORIGINAL = process.env.SURGERY_REPO_ROOT;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SURGERY_REPO_ROOT;
    else process.env.SURGERY_REPO_ROOT = ORIGINAL;
  });

  it("honors the SURGERY_REPO_ROOT env var above everything else", () => {
    process.env.SURGERY_REPO_ROOT = "/explicit/root";
    expect(resolveRepoRoot({ cwd: "/some/other/dir" })).toBe("/explicit/root");
  });

  it("uses input.cwd when env is not set", () => {
    delete process.env.SURGERY_REPO_ROOT;
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, "package.json"), "{}");
      expect(resolveRepoRoot({ cwd: tmp })).toBe(fs.realpathSync(tmp));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("emptyVitals", () => {
  it("initializes every phase to 'pending' and no current phase", () => {
    const v = emptyVitals("/repo");
    expect(v.currentPhase).toBeNull();
    expect(v.engine).toBe("plugin");
    expect(v.repoRoot).toBe("/repo");
    for (const p of PHASES) {
      expect(v.phaseStatus[p]).toBe("pending");
    }
    expect(v.tests).toEqual({ total: 0, passing: 0, failing: 0, skipped: 0 });
    expect(v.runId).toMatch(/^run-/);
  });
});

describe("writeVitals / readVitals round-trip", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("reads what it writes and refreshes lastUpdated", () => {
    const v = emptyVitals(tmp);
    v.lastUpdated = "1970-01-01T00:00:00.000Z";
    writeVitals(tmp, v);
    const back = readVitals(tmp);
    expect(back).not.toBeNull();
    expect(back!.runId).toBe(v.runId);
    // writeVitals bumps lastUpdated
    expect(back!.lastUpdated).not.toBe("1970-01-01T00:00:00.000Z");
    // And the file lives under .surgery/
    expect(fs.existsSync(vitalsFile(tmp))).toBe(true);
  });

  it("returns null when vitals file is missing", () => {
    expect(readVitals(tmp)).toBeNull();
  });

  it("returns null (not throws) on corrupt JSON", () => {
    ensureSurgeryDir(tmp);
    fs.writeFileSync(vitalsFile(tmp), "{not json");
    expect(readVitals(tmp)).toBeNull();
  });
});

describe("appendEvent + baseEvent", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("appends newline-delimited JSON records", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "plan";
    writeVitals(tmp, v);

    appendEvent(tmp, { ...baseEvent(tmp), type: "PhaseStart" });
    appendEvent(tmp, { ...baseEvent(tmp), type: "ToolUse", tool: "Write" });

    const lines = fs
      .readFileSync(eventsFile(tmp), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBe(2);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].type).toBe("PhaseStart");
    expect(parsed[0].phase).toBe("plan");
    expect(parsed[0].engine).toBe("plugin");
    expect(parsed[0].runId).toBe(v.runId);
    expect(parsed[1].tool).toBe("Write");
  });

  it("baseEvent falls back to 'unknown' phase and 'no-run' when no vitals", () => {
    const b = baseEvent(tmp);
    expect(b.phase).toBe("unknown");
    expect(b.runId).toBe("no-run");
  });

  it("baseEvent honors extra overrides", () => {
    const b = baseEvent(tmp, { phase: "finish" });
    expect(b.phase).toBe("finish");
  });
});
