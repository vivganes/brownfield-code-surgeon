#!/usr/bin/env node
import {
  readStdin,
  resolveRepoRoot,
  readVitals,
  writeVitals,
  emptyVitals,
  ensureSurgeryDir,
  appendEvent,
  baseEvent,
} from "./_lib.js";

async function main() {
  const input = await readStdin();
  const repoRoot = resolveRepoRoot(input);
  ensureSurgeryDir(repoRoot);

  let vitals = readVitals(repoRoot);
  if (!vitals) {
    vitals = emptyVitals(repoRoot);
    writeVitals(repoRoot, vitals);
    appendEvent(repoRoot, {
      ...baseEvent(repoRoot, { phase: "plan" }),
      type: "SessionStart",
      source: input.source ?? "startup",
    });
  }

  const summary = vitals.currentPhase
    ? `Brownfield surgery session resumed. Current phase: ${vitals.currentPhase}. Run: ${vitals.runId}.`
    : `Brownfield surgery session ready. No run in progress. Use /surgery <request> or /plan <request> to begin.`;

  const output = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: summary,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[session-start hook] ${String(err)}\n`);
  process.exit(0);
});
