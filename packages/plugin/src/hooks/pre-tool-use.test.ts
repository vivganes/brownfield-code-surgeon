import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluatePhase, run } from "./pre-tool-use.js";
import { emptyVitals, writeVitals, eventsFile } from "./_lib.js";

const write = (file_path: string) => ({ file_path });
const bash = (command: string) => ({ command });

describe("evaluatePhase — plan/map are read-only", () => {
  for (const phase of ["plan", "map"] as const) {
    it(`${phase}: blocks writes to production source`, () => {
      const d = evaluatePhase(phase, "Write", write("src/app.ts"));
      expect(d.block).toBe(true);
      expect(d.reason).toMatch(/forbids modifying production source/i);
    });

    it(`${phase}: blocks writes to tests`, () => {
      const d = evaluatePhase(phase, "Edit", write("src/app.test.ts"));
      expect(d.block).toBe(true);
      expect(d.reason).toMatch(/test files/i);
    });

    it(`${phase}: allows writes to plan/docs`, () => {
      expect(evaluatePhase(phase, "Write", write("plan/plan.md")).block).toBe(
        false,
      );
      expect(evaluatePhase(phase, "Write", write("README.md")).block).toBe(
        false,
      );
    });

    it(`${phase}: blocks running test suites via Bash`, () => {
      expect(evaluatePhase(phase, "Bash", bash("npm test")).block).toBe(true);
      expect(evaluatePhase(phase, "Bash", bash("pytest -k foo")).block).toBe(
        true,
      );
      expect(evaluatePhase(phase, "Bash", bash("vitest run")).block).toBe(true);
    });

    it(`${phase}: allows benign Bash`, () => {
      expect(evaluatePhase(phase, "Bash", bash("ls -la")).block).toBe(false);
      expect(evaluatePhase(phase, "Bash", bash("git status")).block).toBe(
        false,
      );
    });
  }
});

describe("evaluatePhase — break only allows refactors, not new code", () => {
  it("blocks source writes that smell like new files (.new. or /new/)", () => {
    expect(
      evaluatePhase("break", "Write", write("src/feature.new.ts")).block,
    ).toBe(true);
    expect(
      evaluatePhase("break", "Write", write("src/new/feature.ts")).block,
    ).toBe(true);
  });

  it("allows edits to existing source files", () => {
    expect(
      evaluatePhase("break", "Edit", write("src/existing.ts")).block,
    ).toBe(false);
  });
});

describe("evaluatePhase — cover forbids touching source", () => {
  it("blocks source writes", () => {
    const d = evaluatePhase("cover", "Write", write("src/app.ts"));
    expect(d.block).toBe(true);
    expect(d.reason).toMatch(/write tests first/i);
  });

  it("allows test writes", () => {
    expect(
      evaluatePhase("cover", "Write", write("src/app.test.ts")).block,
    ).toBe(false);
    expect(evaluatePhase("cover", "Write", write("tests/a.ts")).block).toBe(
      false,
    );
  });
});

describe("evaluatePhase — refactor must preserve test behavior", () => {
  it("blocks edits to test files", () => {
    const d = evaluatePhase("refactor", "Edit", write("src/a.test.ts"));
    expect(d.block).toBe(true);
    expect(d.reason).toMatch(/preserve behavior/i);
  });

  it("allows source edits", () => {
    expect(
      evaluatePhase("refactor", "Edit", write("src/a.ts")).block,
    ).toBe(false);
  });
});

describe("evaluatePhase — finish is docs-only", () => {
  it("blocks source writes", () => {
    const d = evaluatePhase("finish", "Write", write("src/a.ts"));
    expect(d.block).toBe(true);
    expect(d.reason).toMatch(/docs and cleanup/i);
  });

  it("allows doc writes", () => {
    expect(
      evaluatePhase("finish", "Write", write("CHANGELOG.md")).block,
    ).toBe(false);
  });
});

describe("evaluatePhase — destructive commands blocked in every phase", () => {
  const phases = [
    "plan",
    "map",
    "break",
    "cover",
    "implement",
    "refactor",
    "finish",
  ] as const;
  const destructive = [
    "rm -rf /tmp/foo",
    "git reset --hard HEAD~1",
    "git push --force origin main",
    "git clean -fd",
  ];
  for (const phase of phases) {
    for (const cmd of destructive) {
      it(`${phase}: blocks \`${cmd}\``, () => {
        const d = evaluatePhase(phase, "Bash", bash(cmd));
        expect(d.block).toBe(true);
      });
    }
  }
});

describe("evaluatePhase — implement is the permissive phase", () => {
  it("allows source writes", () => {
    expect(
      evaluatePhase("implement", "Write", write("src/a.ts")).block,
    ).toBe(false);
  });
  it("allows test writes", () => {
    expect(
      evaluatePhase("implement", "Write", write("src/a.test.ts")).block,
    ).toBe(false);
  });
  it("allows test runs", () => {
    expect(
      evaluatePhase("implement", "Bash", bash("npm test")).block,
    ).toBe(false);
  });
});

describe("evaluatePhase — ignores non-write tools for source/test checks", () => {
  it("Read never blocks regardless of path", () => {
    expect(evaluatePhase("plan", "Read", write("src/a.ts")).block).toBe(false);
    expect(evaluatePhase("cover", "Read", write("src/a.ts")).block).toBe(
      false,
    );
  });
});

describe("pre-tool-use run()", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pre-tool-use-test-"));
    env = { SURGERY_REPO_ROOT: tmp };
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("no-ops when no vitals exist (session never started)", () => {
    const result = run({
      input: { tool_name: "Write", tool_input: { file_path: "src/a.ts" } },
      env,
    });
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(eventsFile(tmp))).toBe(false);
  });

  it("no-ops when vitals exist but no currentPhase is set", () => {
    const v = emptyVitals(tmp);
    writeVitals(tmp, v);
    const result = run({
      input: { tool_name: "Write", tool_input: { file_path: "src/a.ts" } },
      env,
    });
    expect(result.stdout).toBe("");
  });

  it("returns a deny decision and logs a blocked ToolUse event when forbidden", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "cover";
    writeVitals(tmp, v);

    const result = run({
      input: {
        tool_name: "Write",
        tool_input: { file_path: "src/app.ts" },
      },
      env,
    });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(
      /write tests first/i,
    );

    const events = fs
      .readFileSync(eventsFile(tmp), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const blocked = events.find((e) => e.type === "ToolUse" && e.blocked);
    expect(blocked).toBeDefined();
    expect(blocked.phase).toBe("cover");
  });

  it("returns empty output when the tool use is allowed", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "implement";
    writeVitals(tmp, v);

    const result = run({
      input: {
        tool_name: "Write",
        tool_input: { file_path: "src/app.ts" },
      },
      env,
    });
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
    // No events emitted by PreToolUse when allowed (PostToolUse handles the success path).
    expect(fs.existsSync(eventsFile(tmp))).toBe(false);
  });
});
