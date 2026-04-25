#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  readStdin,
  resolveRepoRoot,
  readVitals,
  writeVitals,
  emptyVitals,
  ensureSurgeryDir,
  appendEvent,
  baseEvent,
  type HookInput,
} from "./_lib.js";

const GITIGNORE_ENTRIES = ["plan/", ".surgery/"];

export function ensureGitignoreEntries(repoRoot: string): void {
  const file = path.join(repoRoot, ".gitignore");
  let body = "";
  try {
    body = fs.readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return;
  }
  const lines = body.split(/\r?\n/);
  const present = new Set(lines.map((l) => l.trim()).filter(Boolean));
  const missing = GITIGNORE_ENTRIES.filter((e) => !present.has(e));
  if (missing.length === 0) return;

  const needsLeadingNewline = body.length > 0 && !body.endsWith("\n");
  const block =
    (needsLeadingNewline ? "\n" : "") +
    (body.length > 0 ? "# brownfield-code-surgeon scaffolding\n" : "") +
    missing.join("\n") +
    "\n";
  try {
    fs.appendFileSync(file, block, "utf8");
  } catch {
    // best-effort; never block session start on this
  }
}

export interface RunOptions {
  input?: HookInput;
  env?: NodeJS.ProcessEnv;
}

export interface RunResult {
  stdout: string;
  exitCode: number;
}

export function run(opts: RunOptions = {}): RunResult {
  const input = opts.input ?? {};
  const env = opts.env ?? process.env;
  const repoRoot = resolveRepoRoot(input, env);
  ensureSurgeryDir(repoRoot);
  ensureGitignoreEntries(repoRoot);

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
