#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readStdin, resolveRepoRoot, readVitals, writeVitals, appendEvent, baseEvent, PHASES, } from "./_lib.js";
async function main() {
    const input = await readStdin();
    const repoRoot = resolveRepoRoot(input);
    const vitals = readVitals(repoRoot);
    if (!vitals || !vitals.currentPhase)
        process.exit(0);
    const phase = vitals.currentPhase;
    const startedAt = vitals.phaseStartedAt?.[phase];
    const durationMs = startedAt
        ? Math.max(0, Date.now() - new Date(startedAt).getTime())
        : 0;
    appendEvent(repoRoot, {
        ...baseEvent(repoRoot, { phase }),
        type: "PhaseEnd",
        outcome: "completed",
        durationMs,
    });
    const idx = PHASES.indexOf(phase);
    const next = idx >= 0 && idx < PHASES.length - 1 ? PHASES[idx + 1] : null;
    const updated = {
        ...vitals,
        currentPhase: next ?? null,
        phaseStatus: {
            ...vitals.phaseStatus,
            [phase]: "awaiting-approval",
        },
    };
    writeVitals(repoRoot, updated);
    appendEvent(repoRoot, {
        ...baseEvent(repoRoot, { phase }),
        type: "ApprovalRequested",
        artifacts: vitals.artifacts ?? [],
        summary: `Phase "${phase}" completed. Review artifacts and approve to continue.`,
    });
    commitPhase(repoRoot, phase, updated.runId);
    process.exit(0);
}
function commitPhase(repoRoot, phase, runId) {
    try {
        execSync("git add -A", { cwd: repoRoot, stdio: "ignore" });
        const msg = `surgery(${phase}): phase complete [${runId}]`;
        execSync(`git commit -m ${JSON.stringify(msg)}`, {
            cwd: repoRoot,
            stdio: "ignore",
        });
    }
    catch {
        // Not a git repo, nothing staged, or git unavailable — silently continue.
    }
}
main().catch((err) => {
    process.stderr.write(`[subagent-stop hook] ${String(err)}\n`);
    process.exit(0);
});
//# sourceMappingURL=subagent-stop.js.map