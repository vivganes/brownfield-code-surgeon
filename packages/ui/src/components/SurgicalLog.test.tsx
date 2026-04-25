import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { SurgicalLog } from "./SurgicalLog.js";
import type { SurgeryEvent } from "../types.js";

beforeEach(() => {
  // Mock scrollIntoView for jsdom
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SurgicalLog", () => {
  it("renders empty state when no events", () => {
    render(<SurgicalLog events={[]} />);
    expect(
      screen.getByText("No events yet. Run the plugin or SDK runner."),
    ).toBeInTheDocument();
  });

  it("renders events in order", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date(Date.now() - 10000).toISOString(), phase: "plan" },
      { type: "PhaseEnd", timestamp: new Date().toISOString(), phase: "plan", duration: 10000 },
    ];

    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/PhaseStart/)).toBeInTheDocument();
    expect(screen.getByText(/PhaseEnd/)).toBeInTheDocument();
  });

  it("displays event type", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText("PhaseStart")).toBeInTheDocument();
  });

  it("displays event phase", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "cover" },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText("cover")).toBeInTheDocument();
  });

  it("displays formatted timestamp", () => {
    const now = new Date();
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: now.toISOString(), phase: "plan" },
    ];
    render(<SurgicalLog events={events} />);
    const timeString = now.toLocaleTimeString([], { hour12: false });
    expect(screen.getByText(timeString)).toBeInTheDocument();
  });

  it("displays ToolUse event summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ToolUse",
        timestamp: new Date().toISOString(),
        phase: "implement",
        tool: "bash",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/bash/)).toBeInTheDocument();
  });

  it("displays blocked tool notation", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ToolUse",
        timestamp: new Date().toISOString(),
        phase: "plan",
        tool: "bash",
        blocked: true,
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/bash.*blocked/)).toBeInTheDocument();
  });

  it("displays ArtifactWritten summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp: new Date().toISOString(),
        phase: "plan",
        path: "plan.md",
        kind: "plan",
        reason: "initial",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/plan: plan.md/)).toBeInTheDocument();
  });

  it("displays TestRun summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "TestRun",
        timestamp: new Date().toISOString(),
        phase: "cover",
        passed: 95,
        total: 100,
        failed: 5,
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/95\/100 passed.*5 failing/)).toBeInTheDocument();
  });

  it("displays TestRun with all passing", () => {
    const events: SurgeryEvent[] = [
      {
        type: "TestRun",
        timestamp: new Date().toISOString(),
        phase: "cover",
        passed: 100,
        total: 100,
        failed: 0,
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/100\/100 passed/)).toBeInTheDocument();
  });

  it("displays PhaseEnd summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "PhaseEnd",
        timestamp: new Date().toISOString(),
        phase: "plan",
        duration: 125,
        outcome: "success",
      },
    ];
    render(<SurgicalLog events={events} />);
    // Note: the component uses durationMs field, not duration
    expect(screen.getByText(/success in/)).toBeInTheDocument();
  });

  it("displays PhaseStart with request", () => {
    const events: SurgeryEvent[] = [
      {
        type: "PhaseStart",
        timestamp: new Date().toISOString(),
        phase: "plan",
        request: "add feature X",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/started — add feature X/)).toBeInTheDocument();
  });

  it("displays CoverageDelta summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "CoverageDelta",
        timestamp: new Date().toISOString(),
        phase: "cover",
        before: { statements: 70.5 },
        after: { statements: 75.2 },
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/stmts 70.5% → 75.2%/)).toBeInTheDocument();
  });

  it("displays ApprovalRequested summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ApprovalRequested",
        timestamp: new Date().toISOString(),
        phase: "break",
        summary: "Safe to continue",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/approval needed: Safe to continue/)).toBeInTheDocument();
  });

  it("displays ApprovalGranted summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ApprovalGranted",
        timestamp: new Date().toISOString(),
        phase: "break",
        approvedBy: "user@example.com",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/approved by user@example.com/)).toBeInTheDocument();
  });

  it("handles many events", () => {
    const events: SurgeryEvent[] = Array.from({ length: 100 }, (_, i) => ({
      type: "PhaseStart" as const,
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      phase: "plan" as const,
    }));

    const { container } = render(<SurgicalLog events={events} />);
    const lines = container.querySelectorAll(".line");
    expect(lines).toHaveLength(100);
  });

  it("scrolls to bottom on new events", () => {
    const { rerender } = render(<SurgicalLog events={[]} />);

    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];

    rerender(<SurgicalLog events={events} />);
    expect(screen.queryByText("No events yet")).not.toBeInTheDocument();
  });

  it("handles tool summary with description", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ToolUse",
        timestamp: new Date().toISOString(),
        phase: "implement",
        tool: "bash",
        summary: "installed dependencies",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/bash.*installed dependencies/)).toBeInTheDocument();
  });

  it("displays artifact size", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp: new Date().toISOString(),
        phase: "plan",
        path: "plan.md",
        kind: "plan",
        reason: "initial",
      },
    ];
    render(<SurgicalLog events={events} />);
    expect(screen.getByText(/plan.md.*B/)).toBeInTheDocument();
  });
});
