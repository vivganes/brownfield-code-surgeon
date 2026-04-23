#!/usr/bin/env node
import { parseArgs, HELP } from "./args.js";
import { runPipeline } from "./runner.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.request) {
    console.error("surgery-run: --request is required\n");
    console.error(HELP);
    process.exit(2);
  }
  console.log(`[sdk-runner] run=${args.runId} repo=${args.repoRoot}`);
  console.log(`[sdk-runner] phases=${args.phases.join(",")}`);
  console.log(`[sdk-runner] request=${args.request}`);
  await runPipeline(args);
  console.log(`[sdk-runner] done.`);
}

main().catch((err) => {
  console.error("[sdk-runner] fatal:", err);
  process.exit(1);
});
