import { describe, it, expect, vi } from "vitest";
import { pullScratchOnce, startHeartbeat } from "./heartbeat.js";

describe("pullScratchOnce", () => {
  it("runs git fetch then git merge --ff-only with the scratch branch", () => {
    const calls: string[] = [];
    const exec = vi.fn((cmd: string, _cwd: string) => {
      calls.push(cmd);
      return "";
    });
    const r = pullScratchOnce("/repo", "surgery/r-1/finish", exec);
    expect(r).toEqual({
      ok: true,
      fetched: true,
      merged: true,
      message: "fast-forwarded",
    });
    expect(calls[0]).toBe("git fetch origin surgery/r-1/finish");
    expect(calls[1]).toBe("git merge --ff-only FETCH_HEAD");
  });

  it("reports fetched=false when fetch fails", () => {
    const exec = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("network down");
      });
    const r = pullScratchOnce("/repo", "surgery/r-1/finish", exec);
    expect(r.ok).toBe(false);
    expect(r.fetched).toBe(false);
    expect(r.merged).toBe(false);
  });

  it("treats a failed merge as a non-error tick (already up-to-date)", () => {
    const exec = vi
      .fn()
      .mockImplementationOnce(() => "")
      .mockImplementationOnce(() => {
        throw new Error("Already up to date.");
      });
    const r = pullScratchOnce("/repo", "surgery/r-1/finish", exec);
    expect(r.ok).toBe(true);
    expect(r.fetched).toBe(true);
    expect(r.merged).toBe(false);
  });

  it("rejects unsafe branch names without invoking exec", () => {
    const exec = vi.fn();
    expect(() =>
      pullScratchOnce("/repo", "surgery/r-1/finish; rm -rf /", exec),
    ).toThrow(/unsafe branch name/);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("startHeartbeat", () => {
  it("invokes exec on the configured interval and stops cleanly", async () => {
    vi.useFakeTimers();
    const exec = vi.fn(() => "");
    const ticks: number[] = [];
    const h = startHeartbeat({
      repoRoot: "/repo",
      scratchBranch: "surgery/r-1/finish",
      intervalMs: 1000,
      onTick: () => ticks.push(Date.now()),
      exec,
    });
    vi.advanceTimersByTime(3500);
    expect(ticks.length).toBe(3);
    h.stop();
    vi.advanceTimersByTime(2000);
    expect(ticks.length).toBe(3);
    vi.useRealTimers();
  });
});
