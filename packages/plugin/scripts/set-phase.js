#!/usr/bin/env node
import { findRepoRoot, readVitals, writeVitals, emptyVitals, appendEvent, baseEvent, PHASES, } from "../hooks/_lib.js";
export function run(opts) {
    const { argv, cwd } = opts;
    const now = opts.now ?? (() => new Date());
    const [rawPhase, request] = argv;
    if (!rawPhase || !PHASES.includes(rawPhase)) {
        return {
            stdout: "",
            stderr: `Usage: set-phase.js <${PHASES.join("|")}> [request]\n`,
            exitCode: 1,
        };
    }
    const phase = rawPhase;
    const repoRoot = findRepoRoot(cwd);
    const vitals = readVitals(repoRoot) ?? emptyVitals(repoRoot);
    vitals.currentPhase = phase;
    vitals.phaseStartedAt = vitals.phaseStartedAt ?? {};
    vitals.phaseStartedAt[phase] = now().toISOString();
    vitals.phaseStatus = { ...vitals.phaseStatus, [phase]: "running" };
    writeVitals(repoRoot, vitals);
    appendEvent(repoRoot, {
        ...baseEvent(repoRoot, { phase }),
        type: "PhaseStart",
        request: request ?? undefined,
    });
    return {
        stdout: `Phase set to: ${phase} (run ${vitals.runId})\n`,
        stderr: "",
        exitCode: 0,
    };
}
function main() {
    const result = run({ argv: process.argv.slice(2), cwd: process.cwd() });
    if (result.stdout)
        process.stdout.write(result.stdout);
    if (result.stderr)
        process.stderr.write(result.stderr);
    process.exit(result.exitCode);
}
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
    main();
}
//# sourceMappingURL=set-phase.js.map