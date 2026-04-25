import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import type { SurgeryEvent } from "../../types";

// Mock the SoundEngine module so we can intercept all audio calls.
const engineMock = {
  tick: vi.fn(),
  phaseStart: vi.fn(),
  artifactThunk: vi.fn(),
  startApprovalPing: vi.fn(),
  stopApprovalPing: vi.fn(),
  approvalConfirm: vi.fn(),
  testFailAlarm: vi.fn(),
  finishChord: vi.fn(),
  meow: vi.fn(),
};

vi.mock("./SoundEngine", () => ({
  getSoundEngine: () => engineMock,
}));

import { useEventCues } from "./cues";

function Harness({
  events,
  enabled,
}: {
  events: SurgeryEvent[];
  enabled: boolean;
}): JSX.Element {
  useEventCues(events, enabled);
  return <div>cues</div>;
}

const ts = (n: number) => new Date(1700000000000 + n * 1000).toISOString();

describe("useEventCues", () => {
  beforeEach(() => {
    Object.values(engineMock).forEach((fn) => fn.mockClear());
  });

  it("does nothing when disabled", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: ts(0), phase: "plan" },
    ];
    render(<Harness events={events} enabled={false} />);
    expect(engineMock.tick).not.toHaveBeenCalled();
    expect(engineMock.phaseStart).not.toHaveBeenCalled();
  });

  it("ticks once per event", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: ts(0), phase: "plan" },
      { type: "PhaseEnd", timestamp: ts(1), phase: "plan", outcome: "completed", durationMs: 10 },
    ];
    render(<Harness events={events} enabled={true} />);
    expect(engineMock.tick).toHaveBeenCalledTimes(2);
  });

  it("calls phaseStart() for PhaseStart events", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: ts(0), phase: "plan" },
    ];
    render(<Harness events={events} enabled={true} />);
    expect(engineMock.phaseStart).toHaveBeenCalledTimes(1);
  });

  it("calls artifactThunk() for ArtifactWritten", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp: ts(0),
        phase: "plan",
        path: "plan.md",
        kind: "plan",
        reason: "x",
      } as SurgeryEvent,
    ];
    render(<Harness events={events} enabled={true} />);
    expect(engineMock.artifactThunk).toHaveBeenCalledTimes(1);
  });

  it("starts approval ping on ApprovalRequested and stops on matching ApprovalGranted", () => {
    function Stream() {
      const [events, setEvents] = React.useState<SurgeryEvent[]>([]);
      useEventCues(events, true);
      return (
        <div>
          <button
            onClick={() =>
              setEvents((p) => [
                ...p,
                {
                  type: "ApprovalRequested",
                  timestamp: ts(0),
                  phase: "plan",
                  summary: "x",
                  artifacts: [],
                } as SurgeryEvent,
              ])
            }
          >
            req
          </button>
          <button
            onClick={() =>
              setEvents((p) => [
                ...p,
                {
                  type: "ApprovalGranted",
                  timestamp: ts(1),
                  phase: "plan",
                  approvedBy: "human",
                } as SurgeryEvent,
              ])
            }
          >
            grant
          </button>
        </div>
      );
    }

    const { getByText } = render(<Stream />);
    fireEvent.click(getByText("req"));
    expect(engineMock.startApprovalPing).toHaveBeenCalledTimes(1);
    expect(engineMock.stopApprovalPing).not.toHaveBeenCalled();
    fireEvent.click(getByText("grant"));
    expect(engineMock.approvalConfirm).toHaveBeenCalledTimes(1);
    expect(engineMock.stopApprovalPing).toHaveBeenCalledTimes(1);
  });

  it("keeps the ping running while another phase is still awaiting approval", () => {
    function Stream() {
      const [events, setEvents] = React.useState<SurgeryEvent[]>([]);
      useEventCues(events, true);
      return (
        <div>
          <button
            onClick={() =>
              setEvents((p) => [
                ...p,
                {
                  type: "ApprovalRequested",
                  timestamp: ts(0),
                  phase: "plan",
                  summary: "x",
                  artifacts: [],
                } as SurgeryEvent,
                {
                  type: "ApprovalRequested",
                  timestamp: ts(1),
                  phase: "map",
                  summary: "x",
                  artifacts: [],
                } as SurgeryEvent,
              ])
            }
          >
            two
          </button>
          <button
            onClick={() =>
              setEvents((p) => [
                ...p,
                {
                  type: "ApprovalGranted",
                  timestamp: ts(2),
                  phase: "plan",
                  approvedBy: "human",
                } as SurgeryEvent,
              ])
            }
          >
            grant
          </button>
        </div>
      );
    }

    const { getByText } = render(<Stream />);
    fireEvent.click(getByText("two"));
    fireEvent.click(getByText("grant"));
    // plan was granted but map is still open → no stopApprovalPing yet.
    expect(engineMock.stopApprovalPing).not.toHaveBeenCalled();
    expect(engineMock.approvalConfirm).toHaveBeenCalledTimes(1);
  });

  it("triggers testFailAlarm only when failed > 0", () => {
    const events: SurgeryEvent[] = [
      {
        type: "TestRun",
        timestamp: ts(0),
        phase: "plan",
        passed: 5,
        failed: 0,
        skipped: 0,
        total: 5,
      } as SurgeryEvent,
      {
        type: "TestRun",
        timestamp: ts(1),
        phase: "plan",
        passed: 4,
        failed: 1,
        skipped: 0,
        total: 5,
      } as SurgeryEvent,
    ];
    render(<Harness events={events} enabled={true} />);
    expect(engineMock.testFailAlarm).toHaveBeenCalledTimes(1);
  });

  it("plays finishChord only on PhaseEnd of the finish phase", () => {
    const events: SurgeryEvent[] = [
      {
        type: "PhaseEnd",
        timestamp: ts(0),
        phase: "plan",
        outcome: "completed",
        durationMs: 1,
      } as SurgeryEvent,
      {
        type: "PhaseEnd",
        timestamp: ts(1),
        phase: "finish",
        outcome: "completed",
        durationMs: 1,
      } as SurgeryEvent,
    ];
    render(<Harness events={events} enabled={true} />);
    expect(engineMock.finishChord).toHaveBeenCalledTimes(1);
    expect(engineMock.meow).toHaveBeenCalledTimes(1);
  });

  it("only emits cues for newly added events between renders", () => {
    function Stream() {
      const [events, setEvents] = React.useState<SurgeryEvent[]>([
        { type: "PhaseStart", timestamp: ts(0), phase: "plan" },
      ]);
      useEventCues(events, true);
      return (
        <button
          onClick={() =>
            setEvents((p) => [
              ...p,
              { type: "PhaseStart", timestamp: ts(1), phase: "map" },
            ])
          }
        >
          add
        </button>
      );
    }
    const { getByText } = render(<Stream />);
    expect(engineMock.phaseStart).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText("add"));
    expect(engineMock.phaseStart).toHaveBeenCalledTimes(2);
  });

  it("uses the default tick frequency for unknown event types", () => {
    const events: SurgeryEvent[] = [
      // @ts-expect-error — intentionally unknown
      { type: "WeirdEvent", timestamp: ts(0), phase: "plan" },
    ];
    render(<Harness events={events} enabled={true} />);
    expect(engineMock.tick).toHaveBeenCalledWith(2500);
  });
});
