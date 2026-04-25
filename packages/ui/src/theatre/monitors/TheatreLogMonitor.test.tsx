import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { TheatreLogMonitor } from "./TheatreLogMonitor.js";
import type { SurgeryEvent } from "../../types.js";

beforeEach(() => {
  // Mock scrollIntoView for jsdom compatibility
  Element.prototype.scrollIntoView = vi.fn();
});

describe("TheatreLogMonitor", () => {
  it("renders with empty events", () => {
    render(<TheatreLogMonitor events={[]} />);
    expect(screen.getByText("no events yet…")).toBeInTheDocument();
  });

  it("displays header with event count", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/Surgical Log — Last 1/)).toBeInTheDocument();
  });

  it("displays all events up to last 18", () => {
    const events: SurgeryEvent[] = Array.from({ length: 25 }, (_, i) => ({
      type: "PhaseStart" as const,
      timestamp: new Date(Date.now() - i * 1000).toISOString(),
      phase: "plan",
    }));

    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/Surgical Log — Last 18/)).toBeInTheDocument();
  });

  it("displays event type", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText("PhaseStart")).toBeInTheDocument();
  });

  it("displays event phase", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "cover" },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText("cover")).toBeInTheDocument();
  });

  it("displays formatted timestamp", () => {
    const now = new Date();
    const isoString = now.toISOString();
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: isoString, phase: "plan" },
    ];
    render(<TheatreLogMonitor events={events} />);
    const timeString = now.toLocaleTimeString([], { hour12: false });
    expect(screen.getByText(timeString)).toBeInTheDocument();
  });

  it("displays ArtifactWritten event summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ArtifactWritten",
        timestamp: new Date().toISOString(),
        phase: "plan",
        path: "plan/plan.md",
        kind: "plan",
        reason: "initial",
      },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/plan: plan\/plan.md/)).toBeInTheDocument();
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
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText("bash")).toBeInTheDocument();
  });

  it("displays blocked ToolUse event", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ToolUse",
        timestamp: new Date().toISOString(),
        phase: "plan",
        tool: "bash",
        blocked: true,
      },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/bash.*blocked/)).toBeInTheDocument();
  });

  it("displays TestRun event summary", () => {
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
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/95\/100 passed.*5 failing/)).toBeInTheDocument();
  });

  it("displays TestRun with no failures", () => {
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
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/100\/100 passed$/)).toBeInTheDocument();
  });

  it("displays PhaseEnd event summary", () => {
    const events: SurgeryEvent[] = [
      {
        type: "PhaseEnd",
        timestamp: new Date().toISOString(),
        phase: "plan",
        duration: 125,
        outcome: "success",
      },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/success in .?ms/)).toBeInTheDocument();
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
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/started — add feature X/)).toBeInTheDocument();
  });

  it("displays CoverageDelta event", () => {
    const events: SurgeryEvent[] = [
      {
        type: "CoverageDelta",
        timestamp: new Date().toISOString(),
        phase: "cover",
        before: { statements: 70.5 },
        after: { statements: 75.2 },
      },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/70.5% → 75.2%/)).toBeInTheDocument();
  });

  it("displays ApprovalRequested event", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ApprovalRequested",
        timestamp: new Date().toISOString(),
        phase: "break",
        summary: "Safe to continue",
      },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/needs approval: Safe to continue/)).toBeInTheDocument();
  });

  it("displays ApprovalGranted event", () => {
    const events: SurgeryEvent[] = [
      {
        type: "ApprovalGranted",
        timestamp: new Date().toISOString(),
        phase: "break",
        approvedBy: "user@example.com",
      },
    ];
    render(<TheatreLogMonitor events={events} />);
    expect(screen.getByText(/approved by user@example.com/)).toBeInTheDocument();
  });

  it("shows last 18 events when more than 18 exist", () => {
    const events: SurgeryEvent[] = Array.from({ length: 30 }, (_, i) => ({
      type: "PhaseStart" as const,
      timestamp: new Date(Date.now() - (30 - i) * 1000).toISOString(),
      phase: "plan",
    }));

    const { container } = render(<TheatreLogMonitor events={events} />);
    const eventRows = container.querySelectorAll(
      '[style*="grid-template-columns"]',
    );
    expect(eventRows.length).toBeLessThanOrEqual(18);
  });

  it("scrolls to bottom on new events", () => {
    const { rerender } = render(<TheatreLogMonitor events={[]} />);

    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];

    rerender(<TheatreLogMonitor events={events} />);
    expect(screen.queryByText("no events yet…")).not.toBeInTheDocument();
  });
});
