import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PHASES } from "@brownfield-surgeon/shared";
import { loadAllPrompts, loadPrompt, promptPath, PROMPTS_DIR } from "./index.js";

describe("core-prompts loader", () => {
  it("exposes a readable prompts directory", () => {
    expect(fs.existsSync(PROMPTS_DIR)).toBe(true);
  });

  it("loads every phase with a non-empty body", () => {
    for (const phase of PHASES) {
      const p = loadPrompt(phase);
      expect(p.phase).toBe(phase);
      expect(p.body.trim().length).toBeGreaterThan(100);
      expect(fs.existsSync(p.file)).toBe(true);
    }
  });

  it("prompt bodies contain their phase heading", () => {
    const headings: Record<string, RegExp> = {
      plan: /STEP\s*1:\s*PLAN/i,
      map: /STEP\s*2:\s*MAP/i,
      break: /STEP\s*3:\s*BREAK/i,
      cover: /STEP\s*4:\s*COVER/i,
      implement: /STEP\s*5:\s*IMPLEMENT/i,
      refactor: /STEP\s*6:\s*REFACTOR/i,
      finish: /STEP\s*7:\s*FINISH/i,
    };
    for (const phase of PHASES) {
      const p = loadPrompt(phase);
      expect(p.body).toMatch(headings[phase]!);
    }
  });

  it("prompt bodies have no residual YAML frontmatter block", () => {
    for (const phase of PHASES) {
      const p = loadPrompt(phase);
      expect(p.body.startsWith("---")).toBe(false);
      expect(p.body).not.toMatch(/^tools:\s*\[/m);
    }
  });

  it("loadAllPrompts returns entries for exactly the seven phases", () => {
    const all = loadAllPrompts();
    expect(Object.keys(all).sort()).toEqual([...PHASES].sort());
  });

  it("promptPath points to an existing file for every phase", () => {
    for (const phase of PHASES) {
      expect(fs.existsSync(promptPath(phase))).toBe(true);
    }
  });
});
