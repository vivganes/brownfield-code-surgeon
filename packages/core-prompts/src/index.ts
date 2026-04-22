import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Phase } from "@brownfield-surgeon/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts");

const FILE_BY_PHASE: Record<Phase, string> = {
  plan: "1-plan.agent.md",
  map: "2-map.agent.md",
  break: "3-break.agent.md",
  cover: "4-cover.agent.md",
  implement: "5-implement.agent.md",
  refactor: "6-refactor.agent.md",
  finish: "7-finish.agent.md",
};

export interface LoadedPrompt {
  phase: Phase;
  file: string;
  body: string;
}

export function promptPath(phase: Phase): string {
  return path.join(PROMPTS_DIR, FILE_BY_PHASE[phase]);
}

export function loadPrompt(phase: Phase): LoadedPrompt {
  const file = promptPath(phase);
  const body = fs.readFileSync(file, "utf8");
  return { phase, file, body };
}

export function loadAllPrompts(): Record<Phase, LoadedPrompt> {
  return {
    plan: loadPrompt("plan"),
    map: loadPrompt("map"),
    break: loadPrompt("break"),
    cover: loadPrompt("cover"),
    implement: loadPrompt("implement"),
    refactor: loadPrompt("refactor"),
    finish: loadPrompt("finish"),
  };
}

export { PROMPTS_DIR };
