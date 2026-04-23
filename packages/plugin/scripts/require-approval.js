#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, PHASES } from "../hooks/_lib.js";
export function run(opts) {
    const { argv, cwd } = opts;
    const [rawPhase] = argv;
    if (!rawPhase || !PHASES.includes(rawPhase)) {
        return {
            stdout: "",
            stderr: `Usage: require-approval.js <${PHASES.join("|")}>\n`,
            exitCode: 1,
        };
    }
    const phase = rawPhase;
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
    if (result.stdout)
        process.stdout.write(result.stdout);
    if (result.stderr)
        process.stderr.write(result.stderr);
    process.exit(result.exitCode);
}
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
    main();
}
//# sourceMappingURL=require-approval.js.map