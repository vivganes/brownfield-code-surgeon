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

function main() {
  const [, , rawPhase, ...noteParts] = process.argv;
  if (!rawPhase || !(PHASES as readonly string[]).includes(rawPhase)) {
    process.stderr.write(
      `Usage: approve.js <${PHASES.join("|")}> [note]\n`,
    );
    process.exit(1);
  }
  const phase = rawPhase as Phase;
  const repoRoot = findRepoRoot(process.cwd());
  const approvalsDir = path.join(repoRoot, "plan", ".approvals");
  fs.mkdirSync(approvalsDir, { recursive: true });
  const token = {
    phase,
    approvedAt: new Date().toISOString(),
    approvedBy: process.env.USER ?? process.env.USERNAME ?? "human",
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

  process.stdout.write(`Phase ${phase} approved.\n`);
}

main();
