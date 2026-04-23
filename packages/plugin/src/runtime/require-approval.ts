#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, PHASES, type Phase } from "../hooks/_lib.js";

export interface RunOptions {
  argv: string[];
  cwd: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function run(opts: RunOptions): RunResult {
  const { argv, cwd } = opts;
  const [rawPhase] = argv;
  if (!rawPhase || !(PHASES as readonly string[]).includes(rawPhase)) {
    return {
      stdout: "",
      stderr: `Usage: require-approval.js <${PHASES.join("|")}>\n`,
      exitCode: 1,
    };
  }
  const phase = rawPhase as Phase;
  const repoRoot = findRepoRoot(cwd);
  const approvalFile = path.join(repoRoot, "plan", ".approvals", `${phase}.ok`);
  if (!fs.existsSync(approvalFile)) {
    return {
      stdout: "",
      stderr: `ERROR: phase "${phase}" is not approved. Run: node .claude/surgery/approve.js ${phase}\n`,
      exitCode: 2,
    };
  }
  return {
    stdout: `Phase ${phase} approved — continuing.\n`,
    stderr: "",
    exitCode: 0,
  };
}

function main() {
  const result = run({ argv: process.argv.slice(2), cwd: process.cwd() });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main();
}
