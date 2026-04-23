#!/usr/bin/env node
import { findRepoRoot, readVitals, writeVitals, emptyVitals, appendEvent, baseEvent, PHASES, } from "../hooks/_lib.js";
function main() {
    const [, , rawPhase, request] = process.argv;
    if (!rawPhase || !PHASES.includes(rawPhase)) {
        process.stderr.write(`Usage: set-phase.js <${PHASES.join("|")}> [request]\n`);
        process.exit(1);
    }
    const phase = rawPhase;
    const repoRoot = findRepoRoot(process.cwd());
    let vitals = readVitals(repoRoot) ?? emptyVitals(repoRoot);
    vitals.currentPhase = phase;
    vitals.phaseStartedAt = vitals.phaseStartedAt ?? {};
    vitals.phaseStartedAt[phase] = new Date().toISOString();
    vitals.phaseStatus = { ...vitals.phaseStatus, [phase]: "running" };
    writeVitals(repoRoot, vitals);
    appendEvent(repoRoot, {
        ...baseEvent(repoRoot, { phase }),
        type: "PhaseStart",
        request: request ?? undefined,
    });
    process.stdout.write(`Phase set to: ${phase} (run ${vitals.runId})\n`);
}
main();
//# sourceMappingURL=set-phase.js.map