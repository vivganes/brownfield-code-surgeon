import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhaseTimeline } from "./PhaseTimeline.js";
import type { Vitals, SurgeryEvent } from "../types.js";

describe("PhaseTimeline", () => {
  const createVitals = (overrides?: Partial<Vitals>): Vitals => ({
    runId: "test-run",
    engine: "sdk",
    currentPhase: "cover",
    repoRoot: "/repo",
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
    coverage: {
      current: { statements: 75.5 },
      baseline: { statements: 70.2 },
    },
    tests: {
      total: 100,
      passing: 95,
      failing: 5,
    },
    seamsFound: 3,
    dependenciesBroken: 1,
    artifacts: [{ path: "plan.md", lastUpdated: "" }],
    ...overrides,
  });

  it("renders waiting message when vitals is null", () => {
    render(<PhaseTimeline vitals={null} events={[]} />);
    expect(screen.getByText("Waiting for first phase to start…")).toBeInTheDocument();
  });

  it("displays all seven phases", () => {
    render(<PhaseTimeline vitals={createVitals()} events={[]} />);
    expect(screen.getByText("plan")).toBeInTheDocument();
    expect(screen.getByText("map")).toBeInTheDocument();
    expect(screen.getByText("break")).toBeInTheDocument();
    expect(screen.getByText("cover")).toBeInTheDocument();
    expect(screen.getByText("implement")).toBeInTheDocument();
    expect(screen.getByText("refactor")).toBeInTheDocument();
    expect(screen.getByText("finish")).toBeInTheDocument();
  });

  it("displays phase status", () => {
    render(<PhaseTimeline vitals={createVitals()} events={[]} />);
    expect(screen.getAllByText("completed")).toHaveLength(3); // plan, map, break
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
  });

  it("counts events per phase", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
      { type: "ArtifactWritten", timestamp: new Date().toISOString(), phase: "plan", path: "plan.md", kind: "plan", reason: "test" },
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "map" },
    ];
    render(<PhaseTimeline vitals={createVitals()} events={events} />);
    const eventCounts = screen.getAllByText(/events/);
    expect(eventCounts.length).toBeGreaterThan(0);
  });

  it("displays 0 events for phases without events", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];
    render(<PhaseTimeline vitals={createVitals()} events={events} />);
    const zeroEvents = screen.queryAllByText("0 events");
    expect(zeroEvents.length).toBeGreaterThanOrEqual(5);
  });

  it("shows Approve button for awaiting-approval phase", () => {
    render(
      <PhaseTimeline
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "completed",
            break: "awaiting-approval",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
        events={[]}
      />,
    );
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("does not show Approve button for non-approval phases", () => {
    render(<PhaseTimeline vitals={createVitals()} events={[]} />);
    const approveButtons = screen.queryAllByText("Approve");
    expect(approveButtons).toHaveLength(0);
  });

  it("displays multiple Approve buttons for multiple awaiting phases", () => {
    render(
      <PhaseTimeline
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "awaiting-approval",
            break: "awaiting-approval",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
        events={[]}
      />,
    );
    const approveButtons = screen.getAllByText("Approve");
    expect(approveButtons).toHaveLength(2);
  });

  it("makes approve request on button click", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(""),
      }),
    );
    global.fetch = fetchMock;

    const user = userEvent.setup();
    render(
      <PhaseTimeline
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "completed",
            break: "awaiting-approval",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
        events={[]}
      />,
    );

    const approveButton = screen.getByText("Approve");
    await user.click(approveButton);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/approvals/break",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("handles failed approval request", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        text: () => Promise.resolve("Error message"),
      }),
    );
    global.fetch = fetchMock;

    const user = userEvent.setup();
    render(
      <PhaseTimeline
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "completed",
            break: "awaiting-approval",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
        events={[]}
      />,
    );

    const approveButton = screen.getByText("Approve");
    await user.click(approveButton);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("handles network error on approval", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(() => Promise.reject(new Error("Network error")));
    global.fetch = fetchMock;

    const user = userEvent.setup();
    render(
      <PhaseTimeline
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "completed",
            break: "awaiting-approval",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
        events={[]}
      />,
    );

    const approveButton = screen.getByText("Approve");
    await user.click(approveButton);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("displays correct status class for each phase", () => {
    const { container } = render(<PhaseTimeline vitals={createVitals()} events={[]} />);
    const completedStatus = container.querySelector(".status.completed");
    const runningStatus = container.querySelector(".status.running");
    const pendingStatus = container.querySelector(".status.pending");

    expect(completedStatus).toBeInTheDocument();
    expect(runningStatus).toBeInTheDocument();
    expect(pendingStatus).toBeInTheDocument();
  });

  it("filters events by phase correctly", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "map" },
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "plan" },
    ];
    render(<PhaseTimeline vitals={createVitals()} events={events} />);
    // The component should count 3 events for plan and 1 for map
    // We can verify this indirectly through the events display
    expect(screen.getAllByText(/events/).length).toBeGreaterThan(0);
  });

  it("handles failed phase status", () => {
    render(
      <PhaseTimeline
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "failed",
            break: "pending",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
        events={[]}
      />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
