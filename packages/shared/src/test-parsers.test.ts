import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  isTestCommand,
  parseTestOutput,
  readCoverageSnapshot,
} from "./test-parsers.js";

// ---------------------------------------------------------------------------
// isTestCommand
// ---------------------------------------------------------------------------
describe("isTestCommand", () => {
  it("returns false for null", () => {
    expect(isTestCommand(null)).toBe(false);
  });
  it("returns false for undefined", () => {
    expect(isTestCommand(undefined)).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(isTestCommand("")).toBe(false);
  });
  it("matches npm test", () => {
    expect(isTestCommand("npm test")).toBe(true);
  });
  it("matches npm run test", () => {
    expect(isTestCommand("npm run test")).toBe(true);
  });
  it("matches npm run test:coverage", () => {
    expect(isTestCommand("npm run test:coverage")).toBe(true);
  });
  it("matches pnpm test", () => {
    expect(isTestCommand("pnpm test")).toBe(true);
  });
  it("matches yarn test", () => {
    expect(isTestCommand("yarn test")).toBe(true);
  });
  it("matches bun test", () => {
    expect(isTestCommand("bun test")).toBe(true);
  });
  it("matches vitest", () => {
    expect(isTestCommand("npx vitest --run")).toBe(true);
  });
  it("matches jest", () => {
    expect(isTestCommand("jest --coverage")).toBe(true);
  });
  it("matches pytest", () => {
    expect(isTestCommand("pytest tests/")).toBe(true);
  });
  it("matches go test", () => {
    expect(isTestCommand("go test ./...")).toBe(true);
  });
  it("matches cargo test", () => {
    expect(isTestCommand("cargo test")).toBe(true);
  });
  it("matches mvn test", () => {
    expect(isTestCommand("mvn test")).toBe(true);
  });
  it("does not match unrelated commands", () => {
    expect(isTestCommand("ls -la")).toBe(false);
    expect(isTestCommand("git commit -m 'test'")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseTestOutput
// ---------------------------------------------------------------------------
describe("parseTestOutput", () => {
  describe("vitest / jest style", () => {
    it("parses passed only", () => {
      const result = parseTestOutput("Tests: 12 passed, 12 total");
      expect(result).toEqual({ passed: 12, failed: 0, skipped: 0, total: 12 });
    });

    it("parses passed + failed + total", () => {
      const result = parseTestOutput("Tests: 3 failed, 12 passed, 15 total");
      expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
    });

    it("parses with skipped", () => {
      const result = parseTestOutput("Tests: 3 failed, 1 skipped, 12 passed, 16 total");
      expect(result).toEqual({ passed: 12, failed: 3, skipped: 1, total: 16 });
    });

    it("infers total from parts when missing", () => {
      const result = parseTestOutput("Tests: 5 passed");
      expect(result).toEqual({ passed: 5, failed: 0, skipped: 0, total: 5 });
    });

    it("is case insensitive", () => {
      const result = parseTestOutput("tests: 2 passed, 2 total");
      expect(result).toEqual({ passed: 2, failed: 0, skipped: 0, total: 2 });
    });
  });

  describe("mocha style", () => {
    it("parses passing and failing", () => {
      const stdout = "  12 passing\n  3 failing";
      const result = parseTestOutput(stdout);
      expect(result).toEqual({ passed: 12, failed: 3, skipped: 0, total: 15 });
    });

    it("parses passing without failing (no mocha match since failing is required)", () => {
      // mocha regex requires both passing AND failing
      const result = parseTestOutput("  5 passing");
      expect(result).toBeNull();
    });
  });

  describe("pytest style", () => {
    it("parses passed only", () => {
      const result = parseTestOutput("=== 12 passed in 3.2s ===");
      expect(result).toEqual({ passed: 12, failed: 0, skipped: 0, total: 12 });
    });

    it("parses with failed", () => {
      const result = parseTestOutput("=== 2 failed, 10 passed in 1.5s ===");
      expect(result).toEqual({ passed: 10, failed: 2, skipped: 0, total: 12 });
    });

    it("parses with skipped", () => {
      const result = parseTestOutput("=== 10 passed, 1 skipped in 2.0s ===");
      expect(result).toEqual({ passed: 10, failed: 0, skipped: 1, total: 11 });
    });
  });

  describe("go test style", () => {
    it("parses ok line with individual PASS/FAIL lines", () => {
      const stdout = [
        "--- PASS: TestFoo (0.00s)",
        "--- PASS: TestBar (0.01s)",
        "--- FAIL: TestBaz (0.02s)",
        "ok  \tgithub.com/example/pkg\t0.03s",
      ].join("\n");
      const result = parseTestOutput(stdout);
      expect(result).toEqual({ passed: 2, failed: 1, skipped: 0, total: 3 });
    });

    it("returns null when ok line present but no PASS/FAIL markers", () => {
      // passes + fails = 0 so the condition fails
      const result = parseTestOutput("ok  \tgithub.com/example/pkg\t0.01s");
      expect(result).toBeNull();
    });
  });

  it("returns null for unrecognized output", () => {
    expect(parseTestOutput("nothing useful here")).toBeNull();
    expect(parseTestOutput("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readCoverageSnapshot
// ---------------------------------------------------------------------------
describe("readCoverageSnapshot", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no coverage file exists", () => {
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("parses vitest/jest coverage-summary.json", () => {
    const coverageDir = path.join(tmpDir, "coverage");
    fs.mkdirSync(coverageDir);
    fs.writeFileSync(
      path.join(coverageDir, "coverage-summary.json"),
      JSON.stringify({
        total: {
          statements: { pct: 85.5 },
          branches: { pct: 72.0 },
          functions: { pct: 90.0 },
          lines: { pct: 86.0 },
        },
      }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).toEqual({
      statements: 85.5,
      branches: 72.0,
      functions: 90.0,
      lines: 86.0,
    });
  });

  it("parses vitest/jest coverage-summary.json with missing optional metrics", () => {
    const coverageDir = path.join(tmpDir, "coverage");
    fs.mkdirSync(coverageDir);
    fs.writeFileSync(
      path.join(coverageDir, "coverage-summary.json"),
      JSON.stringify({
        total: {
          statements: { pct: 75.0 },
        },
      }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).not.toBeNull();
    expect(snap!.statements).toBe(75.0);
    expect(snap!.branches).toBeUndefined();
  });

  it("parses nyc coverage-final.json", () => {
    const coverageDir = path.join(tmpDir, "coverage");
    fs.mkdirSync(coverageDir);
    // nyc format: per-file statement/branch/function maps
    fs.writeFileSync(
      path.join(coverageDir, "coverage-final.json"),
      JSON.stringify({
        "/src/foo.ts": {
          s: { "0": 1, "1": 0 }, // 1 covered, 1 not
          b: { "0": [1, 0] }, // 1 branch covered, 1 not
          f: { "0": 1 }, // 1 function covered
        },
        "/src/bar.ts": {
          s: { "0": 1, "1": 1 }, // 2 covered
          b: { "0": [0, 0] }, // 0 covered
          f: { "0": 0 }, // 0 covered
        },
      }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).not.toBeNull();
    // statements: 3 covered / 4 total = 75%
    expect(snap!.statements).toBe(75);
    // branches: 1 covered / 4 total = 25%
    expect(snap!.branches).toBe(25);
    // functions: 1 covered / 2 total = 50%
    expect(snap!.functions).toBe(50);
  });

  it("returns null for malformed JSON", () => {
    const coverageDir = path.join(tmpDir, "coverage");
    fs.mkdirSync(coverageDir);
    fs.writeFileSync(path.join(coverageDir, "coverage-summary.json"), "{ bad json");
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("returns null for empty object JSON", () => {
    const coverageDir = path.join(tmpDir, "coverage");
    fs.mkdirSync(coverageDir);
    fs.writeFileSync(path.join(coverageDir, "coverage-summary.json"), "{}");
    expect(readCoverageSnapshot(tmpDir)).toBeNull();
  });

  it("tries .coverage/coverage-summary.json as a candidate", () => {
    const dotCoverageDir = path.join(tmpDir, ".coverage");
    fs.mkdirSync(dotCoverageDir);
    fs.writeFileSync(
      path.join(dotCoverageDir, "coverage-summary.json"),
      JSON.stringify({
        total: { statements: { pct: 60.0 } },
      }),
    );
    const snap = readCoverageSnapshot(tmpDir);
    expect(snap).not.toBeNull();
    expect(snap!.statements).toBe(60.0);
  });
});
