import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { PatientStatusMonitor } from "./PatientStatusMonitor.js";
import type { Vitals, SurgeryEvent } from "../../types.js";

// Mock canvas API for jsdom compatibility
beforeEach(() => {
  const canvas = document.createElement("canvas") as HTMLCanvasElement;
  canvas.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: vi.fn(),
    strokeStyle: "",
    lineWidth: 1,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    lineJoin: "round",
    lineCap: "round",
    shadowColor: "",
    shadowBlur: 0,
    clearRect: vi.fn(),
  })) as any;

  // Mock HTMLCanvasElement.prototype.getContext for jsdom
  if (!HTMLCanvasElement.prototype.getContext) {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillStyle: "",
      fillRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 1,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      lineJoin: "round",
      lineCap: "round",
      shadowColor: "",
      shadowBlur: 0,
      clearRect: vi.fn(),
    })) as any;
  }
});

describe("PatientStatusMonitor", () => {
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
    artifacts: [
      { path: "plan/plan.md", lastUpdated: "" },
      { path: "plan/seams.md", lastUpdated: "" },
    ],
    ...overrides,
  });

  it("renders with null vitals", () => {
    render(<PatientStatusMonitor vitals={null} events={[]} />);
    expect(screen.getByText("PHASE")).toBeInTheDocument();
  });

  it("displays current phase", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("COVER")).toBeInTheDocument();
  });

  it("displays idle phase when vitals is null", () => {
    render(<PatientStatusMonitor vitals={null} events={[]} />);
    expect(screen.getByText("IDLE")).toBeInTheDocument();
  });

  it("displays test counts", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("95/100")).toBeInTheDocument();
  });

  it("displays failing tests count", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("5 FAILING")).toBeInTheDocument();
  });

  it("displays 'ALL GREEN' when tests have no failures", () => {
    render(
      <PatientStatusMonitor
        vitals={createVitals({
          tests: { total: 100, passing: 100, failing: 0 },
        })}
        events={[]}
      />,
    );
    expect(screen.getByText("ALL GREEN")).toBeInTheDocument();
  });

  it("displays coverage percentage", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("75.5%")).toBeInTheDocument();
  });

  it("displays coverage delta when baseline and current exist", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("Δ +5.3%")).toBeInTheDocument();
  });

  it("displays baseline coverage when no current coverage", () => {
    render(
      <PatientStatusMonitor
        vitals={createVitals({
          coverage: { baseline: { statements: 70.2 } },
        })}
        events={[]}
      />,
    );
    expect(screen.getByText("base 70.2%")).toBeInTheDocument();
  });

  it("displays 'NO BASELINE' when no coverage data", () => {
    render(
      <PatientStatusMonitor vitals={createVitals({ coverage: undefined })} events={[]} />,
    );
    expect(screen.getByText("NO BASELINE")).toBeInTheDocument();
  });

  it("displays seams count", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("displays broken dependencies count", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    const miniStats = screen.getAllByText("1");
    expect(miniStats.length).toBeGreaterThan(0);
  });

  it("displays artifact count", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    const twos = screen.getAllByText("2");
    expect(twos.length).toBeGreaterThan(0);
  });

  it("displays event count", () => {
    const events: SurgeryEvent[] = [
      { type: "PhaseStart", timestamp: new Date().toISOString(), phase: "cover" },
      { type: "PhaseEnd", timestamp: new Date().toISOString(), phase: "cover", duration: 100 },
    ];
    render(<PatientStatusMonitor vitals={createVitals()} events={events} />);
    const twos = screen.getAllByText("2");
    expect(twos.length).toBeGreaterThan(0);
  });

  it("shows '--/--' tests when vitals is null", () => {
    render(<PatientStatusMonitor vitals={null} events={[]} />);
    expect(screen.getByText("--/--")).toBeInTheDocument();
  });


  it("displays negative coverage delta correctly", () => {
    render(
      <PatientStatusMonitor
        vitals={createVitals({
          coverage: {
            current: { statements: 65.0 },
            baseline: { statements: 70.2 },
          },
        })}
        events={[]}
      />,
    );
    expect(screen.getByText("Δ -5.2%")).toBeInTheDocument();
  });

  it("renders canvas element for ECG trace", () => {
    const { container } = render(
      <PatientStatusMonitor vitals={createVitals()} events={[]} />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute("width", "900");
    expect(canvas).toHaveAttribute("height", "120");
  });

  it("displays 'EVENT PULSE' label", () => {
    render(<PatientStatusMonitor vitals={createVitals()} events={[]} />);
    expect(screen.getByText("EVENT PULSE")).toBeInTheDocument();
  });
});
