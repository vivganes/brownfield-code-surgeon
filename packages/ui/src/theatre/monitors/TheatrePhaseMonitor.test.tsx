import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { TheatrePhaseMonitor } from "./TheatrePhaseMonitor.js";
import type { Vitals } from "../../types.js";

describe("TheatrePhaseMonitor", () => {
  const createVitals = (overrides?: Partial<Vitals>): Vitals => ({
    runId: "test-run",
    engine: "sdk",
    currentPhase: "plan",
    repoRoot: "/repo",
    lastUpdated: new Date().toISOString(),
    phaseStatus: {
      plan: "pending",
      map: "pending",
      break: "pending",
      cover: "pending",
      implement: "pending",
      refactor: "pending",
      finish: "pending",
    },
    ...overrides,
  });

  it("renders the protocol title", () => {
    render(<TheatrePhaseMonitor vitals={createVitals()} />);
    expect(screen.getByText("Seven-Phase Protocol")).toBeInTheDocument();
  });

  it("renders null vitals gracefully", () => {
    render(<TheatrePhaseMonitor vitals={null} />);
    expect(screen.getByText("Seven-Phase Protocol")).toBeInTheDocument();
  });

  it("renders all seven phases in order", () => {
    render(<TheatrePhaseMonitor vitals={createVitals()} />);

    expect(screen.getByText("plan")).toBeInTheDocument();
    expect(screen.getByText("map")).toBeInTheDocument();
    expect(screen.getByText("break")).toBeInTheDocument();
    expect(screen.getByText("cover")).toBeInTheDocument();
    expect(screen.getByText("implement")).toBeInTheDocument();
    expect(screen.getByText("refactor")).toBeInTheDocument();
    expect(screen.getByText("finish")).toBeInTheDocument();
  });

  it("displays phase indices 01-07", () => {
    render(<TheatrePhaseMonitor vitals={createVitals()} />);

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("07")).toBeInTheDocument();
  });

  it("shows 'pending' status for pending phases", () => {
    render(
      <TheatrePhaseMonitor
        vitals={createVitals({
          phaseStatus: {
            plan: "pending",
            map: "pending",
            break: "pending",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
      />,
    );

    const pendingElements = screen.getAllByText("pending");
    expect(pendingElements.length).toBeGreaterThan(0);
  });

  it("shows 'APPROVE' instead of 'awaiting-approval' status", () => {
    render(
      <TheatrePhaseMonitor
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "awaiting-approval",
            break: "pending",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
      />,
    );

    expect(screen.getByText("APPROVE")).toBeInTheDocument();
  });

  it("displays completed status", () => {
    render(
      <TheatrePhaseMonitor
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "pending",
            break: "pending",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
      />,
    );

    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("displays failed status", () => {
    render(
      <TheatrePhaseMonitor
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
      />,
    );

    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("displays running status", () => {
    render(
      <TheatrePhaseMonitor
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "running",
            break: "pending",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
      />,
    );

    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows pending as default when vitals is null", () => {
    render(<TheatrePhaseMonitor vitals={null} />);

    const pendingElements = screen.getAllByText("pending");
    expect(pendingElements.length).toBe(7);
  });

  it("properly handles mixed phase statuses", () => {
    render(
      <TheatrePhaseMonitor
        vitals={createVitals({
          phaseStatus: {
            plan: "completed",
            map: "completed",
            break: "running",
            cover: "pending",
            implement: "pending",
            refactor: "pending",
            finish: "pending",
          },
        })}
      />,
    );

    const completedElements = screen.getAllByText("completed");
    expect(completedElements).toHaveLength(2);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});
