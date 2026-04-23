import fs from "node:fs";
import path from "node:path";
export const PHASES = [
    "plan",
    "map",
    "break",
    "cover",
    "implement",
    "refactor",
    "finish",
];
export async function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        if (process.stdin.isTTY) {
            resolve({});
            return;
        }
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => {
            try {
                resolve(data.trim() ? JSON.parse(data) : {});
            }
            catch {
                resolve({});
            }
        });
        process.stdin.on("error", () => resolve({}));
    });
}
export function findRepoRoot(start) {
    let dir = path.resolve(start);
    const { root } = path.parse(dir);
    while (dir !== root) {
        if (fs.existsSync(path.join(dir, ".git")) ||
            fs.existsSync(path.join(dir, ".surgery")) ||
            fs.existsSync(path.join(dir, "package.json"))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    return path.resolve(start);
}
export function surgeryDir(repoRoot) {
    return path.join(repoRoot, ".surgery");
}
export function eventsFile(repoRoot) {
    return path.join(surgeryDir(repoRoot), "events.jsonl");
}
export function vitalsFile(repoRoot) {
    return path.join(surgeryDir(repoRoot), "vitals.json");
}
export function ensureSurgeryDir(repoRoot) {
    fs.mkdirSync(surgeryDir(repoRoot), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "plan", ".approvals"), { recursive: true });
}
export function readVitals(repoRoot) {
    try {
        const body = fs.readFileSync(vitalsFile(repoRoot), "utf8");
        return JSON.parse(body);
    }
    catch (err) {
        if (err.code === "ENOENT")
            return null;
        return null;
    }
}
export function writeVitals(repoRoot, vitals) {
    ensureSurgeryDir(repoRoot);
    vitals.lastUpdated = new Date().toISOString();
    fs.writeFileSync(vitalsFile(repoRoot), JSON.stringify(vitals, null, 2), "utf8");
}
export function emptyVitals(repoRoot) {
    const now = new Date().toISOString();
    return {
        runId: `run-${Date.now().toString(36)}`,
        repoRoot,
        engine: "plugin",
        startedAt: now,
        lastUpdated: now,
        currentPhase: null,
        phaseStartedAt: {},
        phaseStatus: {
            plan: "pending",
            map: "pending",
            break: "pending",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
        },
        tests: { total: 0, passing: 0, failing: 0, skipped: 0 },
        coverage: { baseline: null, current: null },
        seamsFound: 0,
        dependenciesBroken: 0,
        artifacts: [],
    };
}
export function appendEvent(repoRoot, event) {
    ensureSurgeryDir(repoRoot);
    fs.appendFileSync(eventsFile(repoRoot), JSON.stringify(event) + "\n", "utf8");
}
export function baseEvent(repoRoot, extra = {}) {
    const vitals = readVitals(repoRoot);
    return {
        timestamp: new Date().toISOString(),
        phase: (vitals?.currentPhase ?? "unknown"),
        engine: "plugin",
        runId: vitals?.runId ?? "no-run",
        ...extra,
    };
}
export function classifyArtifact(filePath) {
    const p = filePath.replace(/\\/g, "/").toLowerCase();
    if (p.includes("/.approvals/") || p.endsWith(".ok"))
        return "approval";
    if (p.endsWith("/plan/plan.md") || p.endsWith("plan/plan.md"))
        return "plan";
    if (p.includes("seams-and-dependencies"))
        return "seams";
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) || /(^|\/)tests?\//.test(p))
        return "test";
    if (p.endsWith(".md") || p.includes("/docs/"))
        return "doc";
    if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|cs)$/.test(p))
        return "source";
    return "other";
}
export function isTestPath(filePath) {
    const p = filePath.replace(/\\/g, "/").toLowerCase();
    return (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
        /(^|\/)tests?\//.test(p) ||
        /(^|\/)__tests__\//.test(p));
}
export function isSourcePath(filePath) {
    const p = filePath.replace(/\\/g, "/").toLowerCase();
    if (isTestPath(p))
        return false;
    return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|cs|kt|swift)$/.test(p);
}
export function resolveRepoRoot(input) {
    const fromEnv = process.env.SURGERY_REPO_ROOT;
    if (fromEnv)
        return fromEnv;
    if (input.cwd)
        return findRepoRoot(input.cwd);
    return findRepoRoot(process.cwd());
}
//# sourceMappingURL=_lib.js.map