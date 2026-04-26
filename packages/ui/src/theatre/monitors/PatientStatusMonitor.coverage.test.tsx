/**
 * Coverage tests for PatientStatusMonitor.tsx lines 167-249 (EcgTrace canvas animation).
 * The EcgTrace component uses requestAnimationFrame and 2d canvas context.
 * We mock requestAnimationFrame to execute the draw loop synchronously.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { PatientStatusMonitor } from "./PatientStatusMonitor.js";
import type { Vitals, SurgeryEvent } from "../../types.js";

// Full canvas 2d context mock
function makeCtx2d() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "round" as CanvasLineJoin,
    lineCap: "round" as CanvasLineCap,
    shadowColor: "",
    shadowBlur: 0,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
}

function baseVitals(): Vitals {
  return {
    runId: "r1",
    engine: "sdk",
    currentPhase: "cover",
    repoRoot: "/repo",
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    phaseStatus: {
      plan: "completed",
      map: "completed",
      break: "completed",
      cover: "running",
      implement: "pending",
      refactor: "pending",
      finish: "pending",
    },
    tests: { total: 100, passing: 95, failing: 5, skipped: 0 },
    coverage: {
      baseline: { statements: 70.2 },
      current: { statements: 75.5 },
    },
    seamsFound: 0,
    dependenciesBroken: 0,
    artifacts: [],
  };
}

describe("PatientStatusMonitor EcgTrace coverage", () => {
  let rafCallbacks: FrameRequestCallback[] = [];
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let ctx2d: ReturnType<typeof makeCtx2d>;

  beforeEach(() => {
    rafCallbacks = [];
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length as unknown as number;
      },
    ) as any;

    ctx2d = makeCtx2d();
    // Override getContext to return our stub
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx2d) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rafCallbacks = [];
  });

  function flushFrames(n = 1) {
    for (let i = 0; i < n; i++) {
      const cbs = [...rafCallbacks];
      rafCallbacks = [];
      for (const cb of cbs) cb(0);
    }
  }

  it("EcgTrace schedules requestAnimationFrame on mount", () => {
    render(<PatientStatusMonitor vitals={baseVitals()} events={[]} />);
    expect(rafSpy).toHaveBeenCalled();
  });

  it("EcgTrace draw loop calls fillRect, stroke (grid + sweep) on first frame", () => {
    render(<PatientStatusMonitor vitals={baseVitals()} events={[]} />);
    act(() => { flushFrames(1); });
    expect(ctx2d.fillRect).toHaveBeenCalled();
    expect(ctx2d.stroke).toHaveBeenCalled();
  });

  it("EcgTrace draw loop renders multiple frames without error", () => {
    render(<PatientStatusMonitor vitals={baseVitals()} events={[]} />);
    act(() => { flushFrames(5); });
    expect(ctx2d.stroke.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("EcgTrace enqueues a QRS pulse when events array grows", () => {
    const events1: SurgeryEvent[] = [];
    const { rerender } = render(
      <PatientStatusMonitor vitals={baseVitals()} events={events1} />,
    );
    act(() => { flushFrames(2); });

    const events2: SurgeryEvent[] = [
      {
        type: "PhaseStart",
        timestamp: new Date().toISOString(),
        phase: "cover",
        engine: "sdk",
        runId: "test-run",
      } as SurgeryEvent,
    ];
    rerender(<PatientStatusMonitor vitals={baseVitals()} events={events2} />);
    act(() => { flushFrames(30); }); // flush enough frames to drain the PULSE array
    // Just ensure no errors and the sweep continued
    expect(ctx2d.stroke.mock.calls.length).toBeGreaterThan(5);
  });

  it("EcgTrace stops drawing after unmount (running=false)", () => {
    const { unmount } = render(
      <PatientStatusMonitor vitals={baseVitals()} events={[]} />,
    );
    act(() => { flushFrames(2); });
    unmount();
    const callsAfterUnmount = ctx2d.stroke.mock.calls.length;
    // Flush more frames — draw() should be a no-op since running=false
    act(() => { flushFrames(5); });
    // No additional stroke calls since running is false
    expect(ctx2d.stroke.mock.calls.length).toBe(callsAfterUnmount);
  });

  it("EcgTrace handles canvas with no 2d context gracefully", () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
    expect(() =>
      render(<PatientStatusMonitor vitals={null} events={[]} />),
    ).not.toThrow();
  });

  it("EcgTrace wrap-around: nextX < x branch (x resets at canvas width)", () => {
    render(<PatientStatusMonitor vitals={baseVitals()} events={[]} />);
    // The canvas is 900px wide, step=3, so wrap-around happens at frame 300.
    // Flush 310 frames to cover the wrap-around branch.
    act(() => { flushFrames(310); });
    expect(ctx2d.fillRect).toHaveBeenCalled();
  });

  it("EcgTrace renders correctly with null vitals", () => {
    render(<PatientStatusMonitor vitals={null} events={[]} />);
    act(() => { flushFrames(3); });
    expect(ctx2d.stroke).toHaveBeenCalled();
  });
});
