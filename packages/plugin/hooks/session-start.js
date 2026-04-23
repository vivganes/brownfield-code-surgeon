#!/usr/bin/env node
import { readStdin, resolveRepoRoot, readVitals, writeVitals, emptyVitals, ensureSurgeryDir, appendEvent, baseEvent, } from "./_lib.js";
export function run(opts = {}) {
    const input = opts.input ?? {};
    const env = opts.env ?? process.env;
    const repoRoot = resolveRepoRoot(input, env);
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
    return { stdout: JSON.stringify(output), exitCode: 0 };
}
async function main() {
    const input = await readStdin();
    const result = run({ input });
    process.stdout.write(result.stdout);
    process.exit(result.exitCode);
}
// Only invoke main when run as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
    main().catch((err) => {
        process.stderr.write(`[session-start hook] ${String(err)}\n`);
        process.exit(0);
    });
}
//# sourceMappingURL=session-start.js.map