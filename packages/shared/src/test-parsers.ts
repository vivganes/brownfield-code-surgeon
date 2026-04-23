import fs from "node:fs";
import path from "node:path";
import type { CoverageSnapshot } from "./vitals.js";

export interface ParsedTestResult {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

const TEST_CMD_RE =
  /\b(npm|pnpm|yarn|bun)\s+(test|run\s+test|run\s+test:coverage)|vitest|jest|pytest|go\s+test|cargo\s+test|mvn\s+test/;

export function isTestCommand(command: string | undefined | null): boolean {
  if (!command) return false;
  return TEST_CMD_RE.test(command);
}

export function parseTestOutput(stdout: string): ParsedTestResult | null {
  // Vitest / Jest: "Tests: 12 passed, 3 failed, 1 skipped, 16 total"
  const jestish = stdout.match(
    /Tests?:\s+(?:(\d+)\s+failed,\s+)?(?:(\d+)\s+skipped,\s+)?(\d+)\s+passed(?:,\s+(\d+)\s+total)?/i,
  );
  if (jestish) {
    const failed = jestish[1] ? Number(jestish[1]) : 0;
    const skipped = jestish[2] ? Number(jestish[2]) : 0;
    const passed = jestish[3] ? Number(jestish[3]) : 0;
    const total = jestish[4]
      ? Number(jestish[4])
      : passed + failed + skipped;
    return { passed, failed, skipped, total };
  }

  // Mocha-style: "12 passing  3 failing"
  const mocha = stdout.match(/(\d+)\s+passing[\s\S]*?(\d+)\s+failing/i);
  if (mocha && mocha[1] && mocha[2]) {
    const passed = Number(mocha[1]);
    const failed = Number(mocha[2]);
    return { passed, failed, skipped: 0, total: passed + failed };
  }

  // pytest footer: "=== 12 passed, 2 failed, 1 skipped in 3.2s ==="
  const pytest = stdout.match(
    /=+\s*(?:(\d+)\s+failed,\s*)?(\d+)\s+passed(?:,\s*(\d+)\s+skipped)?/i,
  );
  if (pytest && pytest[2]) {
    const failed = pytest[1] ? Number(pytest[1]) : 0;
    const passed = Number(pytest[2]);
    const skipped = pytest[3] ? Number(pytest[3]) : 0;
    return { passed, failed, skipped, total: passed + failed + skipped };
  }

  // Go test: lines of "--- PASS: ..." / "--- FAIL: ..." ending in PASS/FAIL
  const goPass = stdout.match(/ok\s+\S+\s+[\d.]+s/);
  if (goPass) {
    const passes = (stdout.match(/--- PASS:/g) ?? []).length;
    const fails = (stdout.match(/--- FAIL:/g) ?? []).length;
    if (passes + fails > 0) {
      return { passed: passes, failed: fails, skipped: 0, total: passes + fails };
    }
  }

  return null;
}

// Common coverage summary locations written by vitest/jest + nyc.
const COVERAGE_CANDIDATES = [
  "coverage/coverage-summary.json",
  "coverage/coverage-final.json",
  ".coverage/coverage-summary.json",
];

/**
 * Reads the newest available coverage summary and returns a normalized snapshot.
 * Supports two shapes:
 *   - vitest/jest summary: { total: { statements: { pct }, ... } }
 *   - nyc coverage-final:  { "<file>": { statementMap, s, b, f, l } }  (rolled up)
 */
export function readCoverageSnapshot(repoRoot: string): CoverageSnapshot | null {
  for (const rel of COVERAGE_CANDIDATES) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const raw = fs.readFileSync(abs, "utf8");
      const json = JSON.parse(raw) as unknown;
      const snap = normalizeCoverageJson(json);
      if (snap) return snap;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizeCoverageJson(json: unknown): CoverageSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  // vitest/jest coverage-summary.json shape
  const total = obj.total as Record<string, unknown> | undefined;
  if (total && typeof total === "object") {
    const pickPct = (k: string): number | undefined => {
      const v = total[k];
      if (v && typeof v === "object") {
        const pct = (v as Record<string, unknown>).pct;
        if (typeof pct === "number") return pct;
      }
      return undefined;
    };
    const statements = pickPct("statements");
    if (typeof statements === "number") {
      const snap: CoverageSnapshot = { statements };
      const branches = pickPct("branches");
      const functions = pickPct("functions");
      const lines = pickPct("lines");
      if (branches !== undefined) snap.branches = branches;
      if (functions !== undefined) snap.functions = functions;
      if (lines !== undefined) snap.lines = lines;
      return snap;
    }
  }

  // nyc coverage-final.json: roll up per-file counters ourselves.
  const files = Object.values(obj);
  if (files.length > 0 && files[0] && typeof files[0] === "object") {
    let sTotal = 0;
    let sCovered = 0;
    let bTotal = 0;
    let bCovered = 0;
    let fTotal = 0;
    let fCovered = 0;
    let rolled = false;
    for (const f of files) {
      const rec = f as Record<string, unknown>;
      const s = rec.s as Record<string, number> | undefined;
      const b = rec.b as Record<string, number[]> | undefined;
      const fn = rec.f as Record<string, number> | undefined;
      if (!s && !b && !fn) continue;
      rolled = true;
      if (s) {
        for (const c of Object.values(s)) {
          sTotal += 1;
          if (c > 0) sCovered += 1;
        }
      }
      if (b) {
        for (const arr of Object.values(b)) {
          for (const c of arr) {
            bTotal += 1;
            if (c > 0) bCovered += 1;
          }
        }
      }
      if (fn) {
        for (const c of Object.values(fn)) {
          fTotal += 1;
          if (c > 0) fCovered += 1;
        }
      }
    }
    if (rolled && sTotal > 0) {
      const snap: CoverageSnapshot = {
        statements: pct(sCovered, sTotal),
      };
      if (bTotal > 0) snap.branches = pct(bCovered, bTotal);
      if (fTotal > 0) snap.functions = pct(fCovered, fTotal);
      return snap;
    }
  }

  return null;
}

function pct(covered: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((covered / total) * 1000) / 10;
}
