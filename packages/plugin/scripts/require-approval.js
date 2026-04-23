#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, PHASES } from "../hooks/_lib.js";
function main() {
    const [, , rawPhase] = process.argv;
    if (!rawPhase || !PHASES.includes(rawPhase)) {
        process.stderr.write(`Usage: require-approval.js <${PHASES.join("|")}>\n`);
        process.exit(1);
    }
    const phase = rawPhase;
    const repoRoot = findRepoRoot(process.cwd());
    const approvalFile = path.join(repoRoot, "plan", ".approvals", `${phase}.ok`);
    if (!fs.existsSync(approvalFile)) {
        process.stderr.write(`ERROR: phase "${phase}" is not approved. Run: node .claude/surgery/approve.js ${phase}\n`);
        process.exit(2);
    }
    process.stdout.write(`Phase ${phase} approved — continuing.\n`);
}
main();
//# sourceMappingURL=require-approval.js.map