#!/usr/bin/env node
import fs from "node:fs";
import {
  readStdin,
  resolveRepoRoot,
  readVitals,
  writeVitals,
  appendEvent,
  baseEvent,
  classifyArtifact,
  readCoverageSnapshot,
  type CoverageSnapshot,
  type Vitals,
  type HookInput,
} from "./_lib.js";

const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "MultiEdit"]);

function extractPath(input: Record<string, unknown>): string | null {
  for (const key of ["file_path", "filePath", "path", "notebook_path"]) {
    const v = input[key];
    if (typeof v === "string") return v;
  }
  return null;
}

function extractBash(input: Record<string, unknown>): string | null {
  const v = input["command"];
  return typeof v === "string" ? v : null;
}

export function parseTestOutput(stdout: string): {
  passed?: number;
  failed?: number;
  total?: number;
} | null {
  const m1 = stdout.match(/Tests?:\s+(\d+)\s+passed.*?(\d+)\s+total/i);
  if (m1 && m1[1] && m1[2]) {
    return { passed: Number(m1[1]), total: Number(m1[2]) };
  }
  const m2 = stdout.match(
    /(\d+)\s+passing[\s\S]*?(\d+)\s+failing/i,
  );
  if (m2 && m2[1] && m2[2]) {
    const passed = Number(m2[1]);
    const failed = Number(m2[2]);
    return { passed, failed, total: passed + failed };
  }
  const m3 = stdout.match(/=+\s*(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i);
  if (m3 && m3[1]) {
    const passed = Number(m3[1]);
    const failed = m3[2] ? Number(m3[2]) : 0;
    return { passed, failed, total: passed + failed };
  }
  return null;
}

export interface RunOptions {
  input?: HookInput;
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  stdout: string;
  exitCode: number;
}

export function run(opts: RunOptions = {}): RunResult {
  const input = opts.input ?? {};
  const env = opts.env ?? process.env;
  const repoRoot = resolveRepoRoot(input, env);
  const vitals = readVitals(repoRoot);
  if (!vitals) return { stdout: "", exitCode: 0 };

  const toolName = input.tool_name ?? "unknown";
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
  const toolResponse = input.tool_response as
    | { stdout?: string; stderr?: string; interrupted?: boolean }
    | undefined;

  appendEvent(repoRoot, {
    ...baseEvent(repoRoot),
    type: "ToolUse",
    tool: toolName,
    blocked: false,
  });

  if (WRITE_TOOLS.has(toolName)) {
    const p = extractPath(toolInput);
    if (p) {
      let bytes = 0;
      try {
        bytes = fs.statSync(p).size;
      } catch {
        bytes = 0;
      }
      const kind = classifyArtifact(p);
      appendEvent(repoRoot, {
        ...baseEvent(repoRoot),
        type: "ArtifactWritten",
        path: p,
        bytes,
        kind,
      });
      const updated: Vitals = {
        ...vitals,
        artifacts: Array.from(new Set([...(vitals.artifacts ?? []), p])),
      };
      writeVitals(repoRoot, updated);
    }
  }

  if (toolName === "Bash") {
    const cmd = extractBash(toolInput) ?? "";
    const looksLikeTests =
      /\b(npm|pnpm|yarn|bun)\s+(test|run\s+test)|vitest|jest|pytest|go\s+test|cargo\s+test|mvn\s+test/.test(
        cmd,
      );
    if (looksLikeTests && toolResponse?.stdout) {
      const parsed = parseTestOutput(toolResponse.stdout);
      if (parsed && parsed.total !== undefined) {
        const passed = parsed.passed ?? 0;
        const failed = parsed.failed ?? Math.max(0, parsed.total - passed);
        appendEvent(repoRoot, {
          ...baseEvent(repoRoot),
          type: "TestRun",
          passed,
          failed,
          skipped: 0,
          total: parsed.total,
        });
        const updated: Vitals = {
          ...vitals,
          tests: {
            total: parsed.total,
            passing: passed,
            failing: failed,
            skipped: 0,
          },
        };
        writeVitals(repoRoot, updated);
      }

      // Tests often write a coverage summary to disk. Sample + emit a delta
      // only when the snapshot actually changed since the last observation.
      const snap = readCoverageSnapshot(repoRoot);
      if (snap) {
        const fresh = readVitals(repoRoot) ?? vitals;
        const currentKey = coverageKey(fresh.coverage.current);
        const newKey = coverageKey(snap);
        if (currentKey !== newKey) {
          const before =
            (fresh.coverage.current as CoverageSnapshot | null) ??
            (fresh.coverage.baseline as CoverageSnapshot | null) ??
            snap;
          appendEvent(repoRoot, {
            ...baseEvent(repoRoot),
            type: "CoverageDelta",
            before,
            after: snap,
          });
          const nextBaseline =
            (fresh.coverage.baseline as CoverageSnapshot | null) ?? snap;
          const coverageUpdate: Vitals = {
            ...fresh,
            coverage: {
              baseline: nextBaseline,
              current: snap,
            },
          };
          writeVitals(repoRoot, coverageUpdate);
        }
      }
    }
  }

  return { stdout: "", exitCode: 0 };
}

function coverageKey(snap: CoverageSnapshot | null): string {
  if (!snap) return "-";
  return [snap.statements, snap.branches, snap.functions, snap.lines]
    .map((v) => (typeof v === "number" ? v.toFixed(2) : "-"))
    .join("|");
}

async function main() {
  const input = await readStdin();
  const result = run({ input });
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    process.stderr.write(`[post-tool-use hook] ${String(err)}\n`);
    process.exit(0);
  });
}
