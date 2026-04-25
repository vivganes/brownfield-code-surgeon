import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Vitals } from "./Vitals.js";
import type { Vitals as VitalsT } from "../types.js";

describe("Vitals", () => {
  const createVitals = (overrides?: Partial<VitalsT>): VitalsT => ({
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
      { path: "plan.md", lastUpdated: "" },
      { path: "seams.md", lastUpdated: "" },
    ],
    ...overrides,
  });

  it("renders waiting message when vitals is null", () => {
    render(<Vitals vitals={null} />);
    expect(screen.getByText("Waiting for vitals.json…")).toBeInTheDocument();
  });

  it("displays current phase", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("cover")).toBeInTheDocument();
  });

  it("displays idle phase when phase is null", () => {
    render(<Vitals vitals={createVitals({ currentPhase: null })} />);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("displays test counts", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("95 / 100")).toBeInTheDocument();
  });

  it("displays failing test count", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("5 failing")).toBeInTheDocument();
  });

  it("displays 'all green' when no failing tests", () => {
    render(
      <Vitals
        vitals={createVitals({
          tests: { total: 100, passing: 100, failing: 0 },
        })}
      />,
    );
    expect(screen.getByText("all green")).toBeInTheDocument();
  });

  it("displays coverage percentage", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("75.5%")).toBeInTheDocument();
  });

  it("displays coverage delta when baseline and current exist", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("Δ 5.3%")).toBeInTheDocument();
  });

  it("displays '—' when no coverage data", () => {
    render(<Vitals vitals={createVitals({ coverage: {} })} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("displays 'no baseline' when no baseline coverage", () => {
    render(
      <Vitals
        vitals={createVitals({
          coverage: { current: { statements: 75.5 } },
        })}
      />,
    );
    expect(screen.getByText("no baseline")).toBeInTheDocument();
  });

  it("displays seams found", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("displays broken dependencies", () => {
    render(<Vitals vitals={createVitals()} />);
    const ones = screen.getAllByText("1");
    expect(ones.length).toBeGreaterThan(0);
  });

  it("displays artifact count", () => {
    render(<Vitals vitals={createVitals()} />);
    const twos = screen.getAllByText("2");
    expect(twos.length).toBeGreaterThan(0);
  });

  it("displays all card labels", () => {
    render(<Vitals vitals={createVitals()} />);
    expect(screen.getByText("Current phase")).toBeInTheDocument();
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("Coverage")).toBeInTheDocument();
    expect(screen.getByText("Seams found")).toBeInTheDocument();
    expect(screen.getByText("Dependencies broken")).toBeInTheDocument();
    expect(screen.getByText("Artifacts")).toBeInTheDocument();
  });

  it("handles negative coverage delta", () => {
    render(
      <Vitals
        vitals={createVitals({
          coverage: {
            current: { statements: 65.0 },
            baseline: { statements: 70.2 },
          },
        })}
      />,
    );
    expect(screen.getByText("Δ -5.2%")).toBeInTheDocument();
  });

  it("displays zero seams found", () => {
    const { rerender } = render(
      <Vitals vitals={createVitals({ seamsFound: 0 })} />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();

    rerender(
      <Vitals vitals={createVitals({ seamsFound: 5 })} />,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("displays all passing tests", () => {
    render(
      <Vitals
        vitals={createVitals({
          tests: { total: 50, passing: 50, failing: 0 },
        })}
      />,
    );
    expect(screen.getByText("50 / 50")).toBeInTheDocument();
    expect(screen.getByText("all green")).toBeInTheDocument();
  });

  it("handles large artifact counts", () => {
    const artifacts = Array.from({ length: 50 }, (_, i) => ({
      path: `artifact-${i}.md`,
      lastUpdated: "",
    }));

    render(<Vitals vitals={createVitals({ artifacts })} />);
    expect(screen.getByText("50")).toBeInTheDocument();
  });
});
