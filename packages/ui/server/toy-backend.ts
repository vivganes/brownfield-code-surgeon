/**
 * Toy backend: simulates a real sdk-runner / plugin engine by progressively
 * writing events.jsonl, vitals.json, plan.md and seams-and-dependencies.md
 * into a toy repo directory. Lets the UI be tested end-to-end without any
 * real Claude API calls or plugin execution.
 *
 * Run: `tsx server/toy-backend.ts`
 * Env:
 *   TOY_REPO_ROOT  directory to write artifacts into (default: ./.toy-repo)
 *   TOY_TICK_MS    delay between simulated events (default: 800)
 *   TOY_LOOP       "1" to restart the simulation after finishing (default: 1)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  ARTIFACT_PATHS,
  PHASES,
  appendEvent,
  ensureSurgeryDir,
  emptyVitals,
  eventsFile,
  planFile,
  readHeadSha,
  seamsFile,
  vitalsFile,
  writeVitals,
  type Phase,
  type SurgeryEvent,
  type Vitals,
} from "@brownfield-surgeon/shared";

const REPO_ROOT = path.resolve(process.env.TOY_REPO_ROOT ?? path.join(process.cwd(), ".toy-repo"));
const TICK_MS = Number(process.env.TOY_TICK_MS ?? 800);
const LOOP = (process.env.TOY_LOOP ?? "1") !== "0";
const ENGINE = "sdk" as const;

function log(msg: string): void {
  console.log(`[toy-backend] ${msg}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function newRunId(): string {
  return `toy-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

// Baseline source files committed at toy-repo init. The phase scripts later
// write to some of these (→ "modified") and add brand-new files (→ "untracked")
// so the Operating Field monitor shows a realistic mix of statuses.
const BASELINE_AUTH_SERVICE = `// Pre-surgery AuthService — single-factor only.
export class AuthService {
  verify(token: string): boolean {
    return token.length > 0;
  }
}
`;

const BASELINE_CHARGES = `export function chargeUser(userId: string, amountCents: number): void {
  // existing billing logic
  void userId;
  void amountCents;
}
`;

const BASELINE_README = `# Demo Patient

A toy repo used to exercise the brownfield surgeon UI end-to-end without
calling Claude. Pre-surgery files live in \`src/\` and \`docs/\`.
`;

function gitToy(...args: string[]): void {
  execFileSync("git", ["-C", REPO_ROOT, ...args], { stdio: "ignore" });
}

async function resetRepo(): Promise<void> {
  // Nuke everything from a previous toy run, including the .git dir, so each
  // run starts from an identical baseline commit.
  await fsp.rm(REPO_ROOT, { recursive: true, force: true });
  fs.mkdirSync(REPO_ROOT, { recursive: true });
  await ensureSurgeryDir(REPO_ROOT);
  await fsp.writeFile(eventsFile(REPO_ROOT), "", "utf8");

  // Pre-surgery source the toy will later edit.
  fs.mkdirSync(path.join(REPO_ROOT, "src", "auth"), { recursive: true });
  fs.mkdirSync(path.join(REPO_ROOT, "src", "billing"), { recursive: true });
  fs.mkdirSync(path.join(REPO_ROOT, "docs"), { recursive: true });
  await fsp.writeFile(path.join(REPO_ROOT, "README.md"), BASELINE_README, "utf8");
  await fsp.writeFile(
    path.join(REPO_ROOT, "src", "auth", "AuthService.ts"),
    BASELINE_AUTH_SERVICE,
    "utf8",
  );
  await fsp.writeFile(
    path.join(REPO_ROOT, "src", "billing", "Charges.ts"),
    BASELINE_CHARGES,
    "utf8",
  );
  // Don't commit anything inside .surgery or plan/ — those are the surgical
  // outputs, and we want them visible as "untracked" in the diff.
  await fsp.writeFile(
    path.join(REPO_ROOT, ".gitignore"),
    `${ARTIFACT_PATHS.surgeryDir}/\n`,
    "utf8",
  );

  try {
    gitToy("init", "-q", "-b", "main");
    gitToy("config", "user.email", "toy@example.com");
    gitToy("config", "user.name", "toy-backend");
    gitToy("add", ".");
    gitToy("commit", "-q", "-m", "baseline: pre-surgery patient");
  } catch (err) {
    log(`warning: git baseline setup failed (${(err as Error).message})`);
  }
}

async function emit(event: SurgeryEvent, vitals: Vitals): Promise<void> {
  vitals.lastUpdated = new Date().toISOString();
  await appendEvent(REPO_ROOT, event);
  await writeVitals(REPO_ROOT, vitals);
}

interface PhaseScript {
  toolUses: Array<{ tool: string; summary: string }>;
  artifacts: Array<{ path: string; bytes: number; kind: "plan" | "seams" | "test" | "source" | "doc" | "approval" | "other" }>;
  testRun?: { passed: number; failed: number; skipped?: number };
  coverage?: { before: number; after: number };
}

const SCRIPTS: Record<Phase, PhaseScript> = {
  plan: {
    toolUses: [
      { tool: "Read", summary: "Inspecting repo structure" },
      { tool: "Grep", summary: "Searching for entry points" },
      { tool: "Write", summary: "Drafting surgical plan" },
    ],
    artifacts: [{ path: ARTIFACT_PATHS.plan, bytes: 1840, kind: "plan" }],
  },
  map: {
    toolUses: [
      { tool: "Grep", summary: "Mapping module boundaries" },
      { tool: "Read", summary: "Tracing dependency graph" },
      { tool: "Write", summary: "Writing seams report" },
    ],
    artifacts: [{ path: ARTIFACT_PATHS.seams, bytes: 2210, kind: "seams" }],
  },
  break: {
    toolUses: [
      { tool: "Edit", summary: "Introducing seam: extract interface" },
      { tool: "Edit", summary: "Decoupling auth module" },
    ],
    artifacts: [{ path: "src/auth/AuthService.ts", bytes: 980, kind: "source" }],
  },
  cover: {
    toolUses: [
      { tool: "Write", summary: "Adding characterization tests" },
      { tool: "Bash", summary: "Running test suite" },
    ],
    artifacts: [
      { path: "src/auth/AuthService.test.ts", bytes: 1340, kind: "test" },
      { path: "src/billing/Charges.test.ts", bytes: 1102, kind: "test" },
    ],
    testRun: { passed: 18, failed: 0 },
    coverage: { before: 41.2, after: 73.8 },
  },
  implement: {
    toolUses: [
      { tool: "Edit", summary: "Implementing requested change" },
      { tool: "Edit", summary: "Wiring new behavior into AuthService" },
      { tool: "Bash", summary: "Re-running test suite" },
    ],
    artifacts: [{ path: "src/auth/AuthService.ts", bytes: 1212, kind: "source" }],
    testRun: { passed: 24, failed: 0 },
  },
  refactor: {
    toolUses: [
      { tool: "Edit", summary: "Extracting helper" },
      { tool: "Edit", summary: "Renaming for clarity" },
    ],
    artifacts: [{ path: "src/auth/AuthService.ts", bytes: 1180, kind: "source" }],
    testRun: { passed: 24, failed: 0 },
  },
  finish: {
    toolUses: [
      { tool: "Write", summary: "Updating docs" },
      { tool: "Bash", summary: "Final verification run" },
    ],
    artifacts: [{ path: "docs/CHANGES.md", bytes: 540, kind: "doc" }],
    testRun: { passed: 24, failed: 0 },
  },
};

const PLAN_MD = `# Surgical Plan

## Patient
Demo repo (toy backend simulation).

## Request
"Add MFA support to authentication, preserving existing session semantics."

## Phases
1. **plan** — sketch approach
2. **map** — identify seams & dependencies
3. **break** — introduce seams
4. **cover** — add characterization tests
5. **implement** — apply change
6. **refactor** — clean up
7. **finish** — docs & verify

## Risks
- Auth touches every request path
- Session token format must remain backwards-compatible
`;

const SEAMS_MD = `# Seams & Dependencies

## Seams identified
- \`AuthService.verify()\` — extract interface to allow MFA strategy injection
- \`SessionStore\` — already abstract, no changes needed
- \`UserRepository\` — leak through concrete class; introduce port

## External dependencies
- \`bcrypt\` (3.x) — hashing
- \`jsonwebtoken\` — token signing

## Test surface
- 18 existing unit tests
- 0 integration tests touching auth — coverage gap
`;

function simulatedContent(filePath: string, kind: string, phase: Phase): string {
  const stamp = `// toy-backend: written during phase=${phase} at ${new Date().toISOString()}\n`;
  if (kind === "test") {
    return (
      stamp +
      `import { describe, it, expect } from "vitest";\n\n` +
      `describe("${path.basename(filePath, path.extname(filePath))}", () => {\n` +
      `  it("placeholder characterization", () => {\n` +
      `    expect(1 + 1).toBe(2);\n` +
      `  });\n` +
      `});\n`
    );
  }
  if (kind === "doc") {
    return (
      `# ${path.basename(filePath)}\n\n` +
      `Auto-generated by the toy backend during phase \`${phase}\`.\n\n` +
      `This file is part of the simulated surgical output.\n`
    );
  }
  if (filePath.endsWith("AuthService.ts")) {
    return (
      stamp +
      `// Post-surgery AuthService — adds MFA strategy seam.\n` +
      `export interface MfaStrategy { challenge(token: string): boolean; }\n` +
      `export class AuthService {\n` +
      `  constructor(private readonly mfa?: MfaStrategy) {}\n` +
      `  verify(token: string): boolean {\n` +
      `    if (!token) return false;\n` +
      `    return this.mfa ? this.mfa.challenge(token) : true;\n` +
      `  }\n` +
      `}\n`
    );
  }
  return stamp + `// stub source for ${filePath}\n`;
}

async function runPhase(
  phase: Phase,
  vitals: Vitals,
  runId: string,
): Promise<void> {
  const script = SCRIPTS[phase];
  const phaseStartedAt = Date.now();
  vitals.currentPhase = phase;
  vitals.phaseStatus[phase] = "running";

  await emit(
    {
      type: "PhaseStart",
      timestamp: new Date().toISOString(),
      phase,
      engine: ENGINE,
      runId,
      request: "Add MFA support to authentication",
    },
    vitals,
  );
  await sleep(TICK_MS);

  for (const t of script.toolUses) {
    await emit(
      {
        type: "ToolUse",
        timestamp: new Date().toISOString(),
        phase,
        engine: ENGINE,
        runId,
        tool: t.tool,
        summary: t.summary,
        blocked: false,
      },
      vitals,
    );
    await sleep(TICK_MS);
  }

  for (const a of script.artifacts) {
    // Write the actual file so the UI's plan/seams endpoints can serve it,
    // and so the git working tree reflects the surgical changes the
    // Operating Field monitor visualizes.
    if (a.kind === "plan") {
      await fsp.mkdir(path.dirname(planFile(REPO_ROOT)), { recursive: true });
      await fsp.writeFile(planFile(REPO_ROOT), PLAN_MD, "utf8");
    } else if (a.kind === "seams") {
      await fsp.mkdir(path.dirname(seamsFile(REPO_ROOT)), { recursive: true });
      await fsp.writeFile(seamsFile(REPO_ROOT), SEAMS_MD, "utf8");
      vitals.seamsFound = 3;
      vitals.dependenciesBroken = 1;
    } else {
      const abs = path.join(REPO_ROOT, a.path);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, simulatedContent(a.path, a.kind, phase), "utf8");
    }
    if (!vitals.artifacts.includes(a.path)) vitals.artifacts.push(a.path);
    await emit(
      {
        type: "ArtifactWritten",
        timestamp: new Date().toISOString(),
        phase,
        engine: ENGINE,
        runId,
        path: a.path,
        bytes: a.bytes,
        kind: a.kind,
      },
      vitals,
    );
    await sleep(TICK_MS);
  }

  if (script.testRun) {
    const total = script.testRun.passed + script.testRun.failed + (script.testRun.skipped ?? 0);
    vitals.tests = {
      total,
      passing: script.testRun.passed,
      failing: script.testRun.failed,
      skipped: script.testRun.skipped ?? 0,
    };
    await emit(
      {
        type: "TestRun",
        timestamp: new Date().toISOString(),
        phase,
        engine: ENGINE,
        runId,
        passed: script.testRun.passed,
        failed: script.testRun.failed,
        skipped: script.testRun.skipped ?? 0,
        total,
        durationMs: 1234,
      },
      vitals,
    );
    await sleep(TICK_MS);
  }

  if (script.coverage) {
    const before = { statements: script.coverage.before };
    const after = { statements: script.coverage.after };
    vitals.coverage = {
      baseline: vitals.coverage.baseline ?? before,
      current: after,
    };
    await emit(
      {
        type: "CoverageDelta",
        timestamp: new Date().toISOString(),
        phase,
        engine: ENGINE,
        runId,
        before,
        after,
      },
      vitals,
    );
    await sleep(TICK_MS);
  }

  // Approval gate: auto-grant after a brief pause so the UI shows the state.
  vitals.phaseStatus[phase] = "awaiting-approval";
  await emit(
    {
      type: "ApprovalRequested",
      timestamp: new Date().toISOString(),
      phase,
      engine: ENGINE,
      runId,
      artifacts: script.artifacts.map((a) => a.path),
      summary: `Phase ${phase} ready for review`,
    },
    vitals,
  );
  await sleep(TICK_MS * 2);
  await emit(
    {
      type: "ApprovalGranted",
      timestamp: new Date().toISOString(),
      phase,
      engine: ENGINE,
      runId,
      approvedBy: "toy-backend",
      note: "auto-approved",
    },
    vitals,
  );
  await sleep(TICK_MS);

  vitals.phaseStatus[phase] = "completed";
  await emit(
    {
      type: "PhaseEnd",
      timestamp: new Date().toISOString(),
      phase,
      engine: ENGINE,
      runId,
      outcome: "completed",
      durationMs: Date.now() - phaseStartedAt,
    },
    vitals,
  );
}

async function runOnce(): Promise<void> {
  await resetRepo();
  const runId = newRunId();
  log(`starting simulated run ${runId} in ${REPO_ROOT}`);
  const vitals = emptyVitals({ runId, repoRoot: REPO_ROOT, engine: ENGINE });
  vitals.baselineRef = readHeadSha(REPO_ROOT);
  if (vitals.baselineRef) {
    log(`baseline commit: ${vitals.baselineRef.slice(0, 8)}`);
  } else {
    log("baseline: none (git not available — Operating Field will be empty)");
  }
  await writeVitals(REPO_ROOT, vitals);
  for (const phase of PHASES) {
    await runPhase(phase, vitals, runId);
  }
  vitals.currentPhase = null;
  await writeVitals(REPO_ROOT, vitals);
  log(`run ${runId} complete`);
}

const RESTART_SIGNAL = path.join(REPO_ROOT, ARTIFACT_PATHS.surgeryDir, "restart.signal");

async function waitForRestartSignal(): Promise<void> {
  log(`waiting for restart signal at ${RESTART_SIGNAL} ...`);
  // Poll for the marker file. UI POST /api/restart writes it; we delete on read.
  while (true) {
    try {
      await fsp.stat(RESTART_SIGNAL);
      await fsp.unlink(RESTART_SIGNAL).catch(() => {});
      log("restart signal received");
      return;
    } catch {
      // not yet
    }
    await sleep(500);
  }
}

async function main(): Promise<void> {
  log(`repo root: ${REPO_ROOT}`);
  log(`tick:      ${TICK_MS}ms`);
  log(`loop:      ${LOOP}`);
  // Clear any stale signal from a previous process.
  await fsp.unlink(RESTART_SIGNAL).catch(() => {});
  do {
    await runOnce();
    if (LOOP) {
      await waitForRestartSignal();
    }
  } while (LOOP);
}

main().catch((err) => {
  console.error("[toy-backend] fatal:", err);
  process.exit(1);
});
