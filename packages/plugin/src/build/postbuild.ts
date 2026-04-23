#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllPrompts } from "@brownfield-surgeon/core-prompts";
import type { Phase } from "@brownfield-surgeon/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname at runtime = <plugin>/dist/build, so go up twice to plugin root.
const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const DIST_HOOKS = path.join(PLUGIN_ROOT, "dist", "hooks");
const DIST_RUNTIME = path.join(PLUGIN_ROOT, "dist", "runtime");
const HOOKS_OUT = path.join(PLUGIN_ROOT, "hooks");
const SCRIPTS_OUT = path.join(PLUGIN_ROOT, "scripts");
const AGENTS_OUT = path.join(PLUGIN_ROOT, "agents");

const AGENT_NAME: Record<Phase, string> = {
  plan: "surgery-plan",
  map: "surgery-map",
  break: "surgery-break",
  cover: "surgery-cover",
  implement: "surgery-implement",
  refactor: "surgery-refactor",
  finish: "surgery-finish",
};

// Filenames are numbered so their phase order is obvious on disk.
// The invocation name (frontmatter `name`) is unchanged.
const AGENT_FILENAME: Record<Phase, string> = {
  plan: "1-plan.md",
  map: "2-map.md",
  break: "3-break.md",
  cover: "4-cover.md",
  implement: "5-implement.md",
  refactor: "6-refactor.md",
  finish: "7-finish.md",
};

const AGENT_DESCRIPTION: Record<Phase, string> = {
  plan: "Plan phase of brownfield surgery: understand the requested change and write plan/plan.md. Does not modify source.",
  map: "Map phase: identify seams, test points, and dependencies; write plan/seams-and-dependencies.md.",
  break: "Break phase: break dependencies to enable testing. No new features, no new tests.",
  cover: "Cover phase: write characterization / pinning tests for existing behavior. Tests only, no source edits.",
  implement: "Implement phase: add the new behavior using TDD. Production code and tests both welcome.",
  refactor: "Refactor phase: improve structure without changing behavior. All tests must stay green.",
  finish: "Finish phase: update docs, changelog, and produce a PR-ready summary.",
};

const AGENT_TOOLS = "Read, Glob, Grep, Write, Edit, Bash";

function agentMarkdown(phase: Phase, body: string): string {
  const header = [
    "---",
    `name: ${AGENT_NAME[phase]}`,
    `description: ${AGENT_DESCRIPTION[phase]}`,
    `tools: ${AGENT_TOOLS}`,
    "---",
    "",
    `# ${AGENT_NAME[phase]} (phase: ${phase})`,
    "",
    "> Part of the Brownfield Code Surgeon. Forbidden moves for this phase are",
    "> enforced automatically by the plugin's PreToolUse hook. Write artifacts",
    "> to the conventional locations (`plan/plan.md`, `plan/seams-and-dependencies.md`, etc).",
    "",
  ].join("\n");
  return header + body.trimEnd() + "\n";
}

async function rimraf(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}

async function copyJsOnly(src: string, dest: string): Promise<number> {
  if (!fs.existsSync(src)) {
    throw new Error(`Expected compiled output at ${src} — run tsc first.`);
  }
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".js")) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    await fsp.copyFile(s, d);
    count++;
  }
  return count;
}

async function writeAgents(): Promise<number> {
  await fsp.mkdir(AGENTS_OUT, { recursive: true });
  const prompts = loadAllPrompts();
  let count = 0;
  for (const phase of Object.keys(prompts) as Phase[]) {
    const file = path.join(AGENTS_OUT, AGENT_FILENAME[phase]);
    await fsp.writeFile(file, agentMarkdown(phase, prompts[phase].body), "utf8");
    count++;
  }
  return count;
}

async function clearJsFiles(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) return;
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.endsWith(".js"))
      .map((e) => fsp.unlink(path.join(dir, e.name))),
  );
}

async function main() {
  // Agents: regenerate from core-prompts (single source of truth)
  await rimraf(AGENTS_OUT);
  const agentCount = await writeAgents();

  // Hooks: replace only .js files; hooks.json is committed alongside.
  await clearJsFiles(HOOKS_OUT);
  const hookCount = await copyJsOnly(DIST_HOOKS, HOOKS_OUT);

  // Runtime helpers used by slash commands -> `scripts/` at plugin root.
  await clearJsFiles(SCRIPTS_OUT);
  const scriptCount = await copyJsOnly(DIST_RUNTIME, SCRIPTS_OUT);

  process.stdout.write(
    [
      `postbuild: generated ${agentCount} agents, ${hookCount} hook scripts, ${scriptCount} runtime scripts`,
      `  agents: ${AGENTS_OUT}`,
      `  hooks:  ${HOOKS_OUT}`,
      `  scripts:${SCRIPTS_OUT}`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  process.stderr.write(`postbuild failed: ${String(err)}\n`);
  process.exit(1);
});
