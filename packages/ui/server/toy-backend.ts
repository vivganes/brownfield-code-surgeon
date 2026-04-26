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
  clearApproval,
  ensureSurgeryDir,
  emptyVitals,
  eventsFile,
  planFile,
  readHeadSha,
  seamsFile,
  vitalsFile,
  waitForApproval,
  writeVitals,
  type Phase,
  type SurgeryEvent,
  type Vitals,
} from "@brownfield-surgeon/shared";

const REPO_ROOT = path.resolve(process.env.TOY_REPO_ROOT ?? path.join(process.cwd(), ".toy-repo"));
const TICK_MS = Number(process.env.TOY_TICK_MS ?? 800);
const LOOP = (process.env.TOY_LOOP ?? "1") !== "0";
const AUTO_APPROVE = process.argv.includes("--auto-approve");
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
  // Delete the plan/ directory first so the UI server detects its absence and
  // resets the plan-ready flag before the new run writes a fresh plan.md.
  await fsp.rm(path.join(REPO_ROOT, "plan"), { recursive: true, force: true });
  // Nuke everything else from a previous toy run, including the .git dir, so
  // each run starts from an identical baseline commit.
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
      { tool: "Glob", summary: "Scanning file tree for entry points" },
      { tool: "Grep", summary: "Searching for entry points" },
      { tool: "Read", summary: "Reading package.json dependencies" },
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

const PLAN_MD = `# Surgical Plan — MFA for AuthService

**Repo:** demo-patient
**Request:** Add multi-factor authentication to the auth layer, preserving existing session token semantics and all current call-sites.
**Surgeon:** Brownfield Code Surgeon v0.1 (sdk)
**Baseline commit:** pre-surgery baseline

---

## 1. Codebase Snapshot

Scanned 3 source files, 1 config, 1 README.

| File | Lines | Role |
|---|---|---|
| \`src/auth/AuthService.ts\` | 6 | Single-factor token verifier — the primary patient |
| \`src/billing/Charges.ts\` | 7 | Billing stub — calls nothing in auth, safe to ignore |
| \`README.md\` | 7 | Documentation only |

\`AuthService.verify(token)\` is the single entry point for authentication. It currently accepts any non-empty string as valid, which is the seam we will exploit.

---

## 2. Change Request Analysis

The request is to introduce **MFA (multi-factor authentication)** as an opt-in second factor, without breaking the current single-factor contract. Callers that do not supply an MFA strategy must continue to work identically.

**Approach — Strategy Pattern injection:**

\`\`\`
Before:  AuthService.verify(token) → boolean
After:   AuthService(mfa?: MfaStrategy).verify(token) → boolean
\`\`\`

The \`MfaStrategy\` interface is a seam: the constructor accepts an optional strategy object. When no strategy is provided, behaviour is identical to today. When one is provided, \`verify()\` delegates the second-factor challenge before returning.

This is a *conservative* change — no call-site needs to be modified unless it wants MFA.

---

## 3. Phase-by-Phase Plan

### Phase 1 — plan *(this document)*
Analyse codebase, identify seams, produce this plan. Gate: human approval.

### Phase 2 — map
Trace all call-sites of \`AuthService\` and \`chargeUser\`. Confirm no hidden coupling between auth and billing. Produce \`seams-and-dependencies.md\`. Gate: human approval.

### Phase 3 — break
Introduce the \`MfaStrategy\` interface and make \`AuthService\` accept it via constructor injection. **No behaviour change yet** — strategy is optional and defaults to \`undefined\`, so \`verify()\` still returns \`token.length > 0\`.

Files touched:
- \`src/auth/AuthService.ts\` — add interface + constructor parameter

### Phase 4 — cover
Write characterization tests that pin the *current* behaviour before we change it:
- \`verify('')\` → \`false\`
- \`verify('any-token')\` → \`true\` (no MFA strategy)
- \`verify('token', totp)\` → delegates to strategy (stub)

Files created:
- \`src/auth/AuthService.test.ts\`
- \`src/billing/Charges.test.ts\` (baseline coverage for billing, no changes expected)

Target: statement coverage ≥ 80 % on \`AuthService.ts\`. Gate: human approval + green tests.

### Phase 5 — implement
Activate the MFA path:
- When \`this.mfa\` is set, call \`this.mfa.challenge(token)\` and AND the result with the first-factor check.
- Guard: return \`false\` immediately on empty token regardless of strategy.

Files touched:
- \`src/auth/AuthService.ts\`

All existing tests must remain green. Gate: human approval + green tests.

### Phase 6 — refactor
Clean up:
- Rename internal \`mfa\` field to \`_secondFactor\` to signal it is private-by-convention.
- Extract the empty-token guard into a named private method \`#isEmpty(token)\` for readability.
- No functional changes — tests must stay green.

### Phase 7 — finish
- Update \`README.md\` with usage example for the new MFA constructor parameter.
- Run full suite one final time and record result in \`docs/CHANGES.md\`.

---

## 4. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hidden call-sites that pass no token and rely on truthy return | Low | Phase 2 grep will surface them; Phase 4 tests will catch regressions |
| \`MfaStrategy.challenge\` throwing instead of returning \`false\` | Medium | Wrap call in try/catch in Phase 5; return \`false\` on throw |
| Session token format changes breaking downstream | None | We are not touching token format — only the verification side |
| Billing accidentally coupled to auth | Unlikely | Phase 2 map will confirm; currently no imports cross the boundary |

---

## 5. Acceptance Criteria

- [ ] \`AuthService\` with no constructor arg behaves identically to today
- [ ] \`AuthService\` with a TOTP strategy fails on bad second-factor
- [ ] Statement coverage on \`src/auth/AuthService.ts\` ≥ 80 %
- [ ] Zero regressions in \`src/billing/\`
- [ ] \`README.md\` documents the new API
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

  // Approval gate: wait for a human (or auto-approve if --auto-approve flag was given).
  await clearApproval(REPO_ROOT, phase);
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

  if (AUTO_APPROVE) {
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
  } else {
    log(`[${phase}] awaiting approval — POST /api/approvals/${phase} to continue`);
    const token = await waitForApproval(REPO_ROOT, phase);
    log(`[${phase}] approval received from ${token.approvedBy}`);
    await emit(
      {
        type: "ApprovalGranted",
        timestamp: new Date().toISOString(),
        phase,
        engine: ENGINE,
        runId,
        approvedBy: token.approvedBy,
        note: token.note,
      },
      vitals,
    );
  }
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
  log(`repo root:    ${REPO_ROOT}`);
  log(`tick:         ${TICK_MS}ms`);
  log(`loop:         ${LOOP}`);
  log(`auto-approve: ${AUTO_APPROVE}`);
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
