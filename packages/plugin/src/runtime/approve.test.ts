import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./approve.js";
import { emptyVitals, writeVitals, readVitals, eventsFile } from "../hooks/_lib.js";

function mkTmp(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "approve-test-"));
  fs.writeFileSync(path.join(tmp, "package.json"), "{}"); // mark as repo root
  return tmp;
}

function events(tmp: string) {
  if (!fs.existsSync(eventsFile(tmp))) return [];
  return fs
    .readFileSync(eventsFile(tmp), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("approve run()", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("rejects unknown phases with exit code 1", () => {
    const r = run({ argv: ["nope"], cwd: tmp });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/Usage: approve.js/);
  });

  it("rejects when phase arg is missing", () => {
    const r = run({ argv: [], cwd: tmp });
    expect(r.exitCode).toBe(1);
  });

  it("writes an approval token, updates vitals, emits ApprovalGranted", () => {
    writeVitals(tmp, emptyVitals(tmp));

    const r = run({
      argv: ["plan", "looks", "good"],
      cwd: tmp,
      env: { USER: "alice" },
      now: () => new Date("2026-01-15T00:00:00Z"),
    });

    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("Phase plan approved.\n");

    const token = JSON.parse(
      fs.readFileSync(path.join(tmp, "plan", ".approvals", "plan.ok"), "utf8"),
    );
    expect(token).toEqual({
      phase: "plan",
      approvedAt: "2026-01-15T00:00:00.000Z",
      approvedBy: "alice",
      note: "looks good",
    });

    const vitals = readVitals(tmp)!;
    expect(vitals.phaseStatus.plan).toBe("completed");
    // Not the last phase, so currentPhase untouched.
    expect(vitals.currentPhase).toBeNull();

    const granted = events(tmp).find((e) => e.type === "ApprovalGranted");
    expect(granted.approvedBy).toBe("alice");
    expect(granted.note).toBe("looks good");
  });

  it("clears currentPhase after approving the last phase", () => {
    const v = emptyVitals(tmp);
    v.currentPhase = "finish";
    writeVitals(tmp, v);

    run({ argv: ["finish"], cwd: tmp, env: { USER: "bob" } });
    expect(readVitals(tmp)!.currentPhase).toBeNull();
  });

  it("omits the note when none is provided", () => {
    run({ argv: ["cover"], cwd: tmp, env: { USER: "carol" } });
    const token = JSON.parse(
      fs.readFileSync(path.join(tmp, "plan", ".approvals", "cover.ok"), "utf8"),
    );
    expect(token.note).toBeUndefined();
  });

  it("falls back through USER → USERNAME → 'human'", () => {
    run({ argv: ["plan"], cwd: tmp, env: {} });
    const token = JSON.parse(
      fs.readFileSync(path.join(tmp, "plan", ".approvals", "plan.ok"), "utf8"),
    );
    expect(token.approvedBy).toBe("human");
  });

  it("works even when vitals don't exist yet (approval token still written)", () => {
    const r = run({ argv: ["plan"], cwd: tmp, env: { USER: "x" } });
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(path.join(tmp, "plan", ".approvals", "plan.ok"))).toBe(
      true,
    );
  });
});
