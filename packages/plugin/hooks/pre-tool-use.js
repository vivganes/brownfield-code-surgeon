#!/usr/bin/env node
import { readStdin, resolveRepoRoot, readVitals, appendEvent, baseEvent, isSourcePath, isTestPath, } from "./_lib.js";
const WRITE_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "MultiEdit"]);
function extractPath(toolName, toolInput) {
    const candidates = ["file_path", "filePath", "path", "notebook_path"];
    for (const key of candidates) {
        const v = toolInput[key];
        if (typeof v === "string")
            return v;
    }
    return null;
}
function extractBashCommand(toolInput) {
    const v = toolInput["command"];
    return typeof v === "string" ? v : null;
}
function evaluatePhase(phase, toolName, toolInput) {
    const filePath = extractPath(toolName, toolInput);
    const bashCmd = extractBashCommand(toolInput);
    const writing = WRITE_TOOLS.has(toolName) && filePath !== null;
    if (phase === "plan" || phase === "map") {
        if (writing && filePath && isSourcePath(filePath)) {
            return {
                block: true,
                reason: `Phase "${phase}" forbids modifying production source files. Only plan/ and docs/ writes are allowed. Attempted write: ${filePath}. Finish the current phase and request approval before editing source.`,
            };
        }
        if (writing && filePath && isTestPath(filePath)) {
            return {
                block: true,
                reason: `Phase "${phase}" forbids modifying test files. Test creation belongs to the Cover phase.`,
            };
        }
    }
    if (phase === "break") {
        if (writing &&
            filePath &&
            isSourcePath(filePath) &&
            /\.new\.|\/new\//i.test(filePath)) {
            return {
                block: true,
                reason: `Phase "break" forbids adding new feature code. Only seam-breaking refactors to existing code are allowed. Implementation belongs to the Implement phase.`,
            };
        }
    }
    if (phase === "cover") {
        if (writing && filePath && isSourcePath(filePath)) {
            return {
                block: true,
                reason: `Phase "cover" forbids writing to production source files. Write tests first (*.test.*, *.spec.*, or tests/**). Source edits belong to the Implement phase.`,
            };
        }
    }
    if (phase === "refactor") {
        if (writing && filePath && isTestPath(filePath)) {
            return {
                block: true,
                reason: `Phase "refactor" must preserve behavior — do not modify existing tests. If a test needs updating, the behavior changed and that belongs to the Implement phase.`,
            };
        }
    }
    if (phase === "finish") {
        if (writing && filePath && isSourcePath(filePath)) {
            return {
                block: true,
                reason: `Phase "finish" is for docs and cleanup only. Source edits require returning to an earlier phase.`,
            };
        }
    }
    if (bashCmd) {
        const lower = bashCmd.toLowerCase();
        if ((phase === "plan" || phase === "map") &&
            /\b(npm|pnpm|yarn|bun)\s+(test|run\s+test)|vitest|jest|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test/.test(lower)) {
            return {
                block: true,
                reason: `Phase "${phase}" is read-only reconnaissance. Running test suites here wastes time — tests run in Cover/Implement.`,
            };
        }
        if (/\b(rm\s+-rf|git\s+reset\s+--hard|git\s+push\s+--force|git\s+clean\s+-fd)/.test(lower)) {
            return {
                block: true,
                reason: `Destructive command blocked during surgery. Use safer alternatives or request explicit override.`,
            };
        }
    }
    return { block: false };
}
async function main() {
    const input = await readStdin();
    const repoRoot = resolveRepoRoot(input);
    const vitals = readVitals(repoRoot);
    const phase = vitals?.currentPhase ?? null;
    const toolName = input.tool_name ?? "unknown";
    const toolInput = input.tool_input ?? {};
    if (!phase) {
        process.exit(0);
    }
    const decision = evaluatePhase(phase, toolName, toolInput);
    if (decision.block) {
        appendEvent(repoRoot, {
            ...baseEvent(repoRoot),
            type: "ToolUse",
            tool: toolName,
            blocked: true,
            reason: decision.reason,
        });
        const output = {
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: decision.reason,
            },
        };
        process.stdout.write(JSON.stringify(output));
        process.exit(0);
    }
    process.exit(0);
}
main().catch((err) => {
    process.stderr.write(`[pre-tool-use hook] ${String(err)}\n`);
    process.exit(0);
});
//# sourceMappingURL=pre-tool-use.js.map