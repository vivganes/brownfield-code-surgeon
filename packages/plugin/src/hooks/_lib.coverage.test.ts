/**
 * Supplemental tests for readCoverageSnapshot / normalizeCoverageJson
 * (lines 226–273 of _lib.ts) and resolveRepoRoot (lines 275–283).
 * The existing _lib.test.ts does not cover these paths.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { readCoverageSnapshot, resolveRepoRoot } from "./_lib.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readCoverageSnapshot — covers lines 211-273
// ---------------------------------------------------------------------------
describe("readCoverageSnapshot", () => {
  it("returns null when no coverage files exist", () => {
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("parses vitest/jest coverage-summary.json with all metrics", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "coverage-summary.json"),
      JSON.stringify({
        total: {
          statements: { pct: 88.0 },
          branches: { pct: 70.0 },
          functions: { pct: 95.0 },
          lines: { pct: 89.0 },
        },
      }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).toEqual({
      statements: 88.0,
      branches: 70.0,
      functions: 95.0,
      lines: 89.0,
    });
  });

  it("parses vitest/jest coverage-summary.json — statements only, no optional fields", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "coverage-summary.json"),
      JSON.stringify({ total: { statements: { pct: 55.5 } } }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).not.toBeNull();
    expect(snap!.statements).toBe(55.5);
    expect(snap!.branches).toBeUndefined();
    expect(snap!.functions).toBeUndefined();
    expect(snap!.lines).toBeUndefined();
  });

  it("parses nyc coverage-final.json by rolling up s counters", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    // 3 statements covered out of 4 = 75%
    fs.writeFileSync(
      path.join(dir, "coverage-final.json"),
      JSON.stringify({
        "/src/a.ts": { s: { "0": 1, "1": 1 } },
        "/src/b.ts": { s: { "0": 1, "1": 0 } },
      }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).not.toBeNull();
    expect(snap!.statements).toBe(75);
  });

  it("returns null for nyc format when no files have s counters", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "coverage-final.json"),
      JSON.stringify({
        "/src/a.ts": { notAnS: {} },
      }),
    );
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "coverage-summary.json"), "{ bad json");
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("returns null for empty object JSON", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "coverage-summary.json"), "{}");
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("falls through to .coverage/coverage-summary.json candidate", () => {
    const dir = path.join(tmpDir, ".coverage");
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "coverage-summary.json"),
      JSON.stringify({ total: { statements: { pct: 42.0 } } }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap!.statements).toBe(42.0);
  });

  it("skips a candidate when coverage-summary.json has no total.statements.pct", () => {
    const dir = path.join(tmpDir, "coverage");
    fs.mkdirSync(dir);
    // total exists but statements.pct is not a number
    fs.writeFileSync(
      path.join(dir, "coverage-summary.json"),
      JSON.stringify({ total: { statements: "not-an-object" } }),
    );
    // This normalization returns null, so readCoverageSnapshot returns null
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveRepoRoot — covers lines 275-283
// ---------------------------------------------------------------------------
describe("resolveRepoRoot", () => {
  it("prefers SURGERY_REPO_ROOT env var above cwd", () => {
    const result = resolveRepoRoot(
      { cwd: "/some/other" },
      { SURGERY_REPO_ROOT: "/explicit/root" },
    );
    expect(result).toBe("/explicit/root");
  });

  it("uses input.cwd and walks up to package.json when no env var", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), "{}");
    const nested = path.join(tmpDir, "sub", "dir");
    fs.mkdirSync(nested, { recursive: true });
    const result = resolveRepoRoot({ cwd: nested }, {});
    // Should walk up to tmpDir which has package.json
    expect(result).toBe(fs.realpathSync(tmpDir));
  });

  it("falls back to process.cwd() when neither env nor cwd provided", () => {
    const result = resolveRepoRoot({}, {});
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
