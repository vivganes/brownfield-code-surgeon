import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run, ensureGitignoreEntries } from "./session-start.js";
import {
  readVitals,
  eventsFile,
  vitalsFile,
  emptyVitals,
  writeVitals,
  surgeryDir,
} from "./_lib.js";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "session-start-test-"));
}

describe("session-start hook", () => {
  let tmp: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmp = mkTmp();
    env = { SURGERY_REPO_ROOT: tmp };
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("initializes vitals and emits SessionStart on first run", () => {
    const result = run({ input: { source: "startup" }, env });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(parsed.hookSpecificOutput.additionalContext).toMatch(
      /No run in progress/,
    );

    const v = readVitals(tmp);
    expect(v).not.toBeNull();
    expect(v!.currentPhase).toBeNull();
    expect(fs.existsSync(surgeryDir(tmp))).toBe(true);
    expect(fs.existsSync(vitalsFile(tmp))).toBe(true);

    const events = fs
      .readFileSync(eventsFile(tmp), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SessionStart");
    expect(events[0].source).toBe("startup");
  });

  it("reports the current phase when resuming an in-progress run", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "cover";
    writeVitals(tmp, v);

    const result = run({ env });
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.additionalContext).toMatch(
      /resumed.*cover/,
    );
  });

  it("does not re-initialize vitals or re-emit SessionStart on resume", () => {
    run({ env }); // first session
    const eventsBefore = fs.readFileSync(eventsFile(tmp), "utf8");
    const runIdBefore = readVitals(tmp)!.runId;

    run({ env }); // second session

    expect(fs.readFileSync(eventsFile(tmp), "utf8")).toBe(eventsBefore);
    expect(readVitals(tmp)!.runId).toBe(runIdBefore);
  });

  it("creates .gitignore with plan/ and .surgery/ when missing", () => {
    run({ env });
    const body = fs.readFileSync(path.join(tmp, ".gitignore"), "utf8");
    expect(body).toMatch(/^plan\/$/m);
    expect(body).toMatch(/^\.surgery\/$/m);
  });

  it("appends only the missing entries to an existing .gitignore", () => {
    fs.writeFileSync(path.join(tmp, ".gitignore"), "node_modules\nplan/\n");
    ensureGitignoreEntries(tmp);
    const body = fs.readFileSync(path.join(tmp, ".gitignore"), "utf8");
    expect(body.match(/^plan\/$/gm)?.length).toBe(1);
    expect(body).toMatch(/^\.surgery\/$/m);
    expect(body).toMatch(/^node_modules$/m);
  });

  it("is a no-op when both entries are already present", () => {
    const original = "plan/\n.surgery/\n";
    fs.writeFileSync(path.join(tmp, ".gitignore"), original);
    ensureGitignoreEntries(tmp);
    expect(fs.readFileSync(path.join(tmp, ".gitignore"), "utf8")).toBe(original);
  });

  it("adds a leading newline when the existing file lacks a trailing newline", () => {
    fs.writeFileSync(path.join(tmp, ".gitignore"), "node_modules");
    ensureGitignoreEntries(tmp);
    const body = fs.readFileSync(path.join(tmp, ".gitignore"), "utf8");
    expect(body.startsWith("node_modules\n")).toBe(true);
    expect(body).toMatch(/plan\//);
  });

  it("falls back to 'startup' when input.source is missing", () => {
    run({ env });
    const event = JSON.parse(
      fs.readFileSync(eventsFile(tmp), "utf8").split("\n")[0]!,
    );
    expect(event.source).toBe("startup");
  });
});
