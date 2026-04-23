#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  findRepoRoot,
  readVitals,
  writeVitals,
  appendEvent,
  baseEvent,
  PHASES,
  type Phase,
} from "../hooks/_lib.js";

export interface RunOptions {
  argv: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function run(opts: RunOptions): RunResult {
  const { argv, cwd } = opts;
  const env = opts.env ?? process.env;
  const now = opts.now ?? (() => new Date());
  const [rawPhase, ...noteParts] = argv;
  if (!rawPhase || !(PHASES as readonly string[]).includes(rawPhase)) {
    return {
      stdout: "",
      stderr: `Usage: approve.js <${PHASES.join("|")}> [note]\n`,
      exitCode: 1,
    };
  }
  const phase = rawPhase as Phase;
  const repoRoot = findRepoRoot(cwd);
  const approvalsDir = path.join(repoRoot, "plan", ".approvals");
  fs.mkdirSync(approvalsDir, { recursive: true });
  const token = {
    phase,
    approvedAt: now().toISOString(),
    approvedBy: env.USER ?? env.USERNAME ?? "human",
    note: noteParts.join(" ") || undefined,
  };
  fs.writeFileSync(
    path.join(approvalsDir, `${phase}.ok`),
    JSON.stringify(token, null, 2),
    "utf8",
  );

  const vitals = readVitals(repoRoot);
  if (vitals) {
    vitals.phaseStatus = { ...vitals.phaseStatus, [phase]: "completed" };
    const isLastPhase = PHASES.indexOf(phase) === PHASES.length - 1;
    if (isLastPhase) {
      vitals.currentPhase = null;
    }
    writeVitals(repoRoot, vitals);
  }

  appendEvent(repoRoot, {
    ...baseEvent(repoRoot, { phase }),
    type: "ApprovalGranted",
    approvedBy: token.approvedBy,
    note: token.note,
  });

  return { stdout: `Phase ${phase} approved.\n`, stderr: "", exitCode: 0 };
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
