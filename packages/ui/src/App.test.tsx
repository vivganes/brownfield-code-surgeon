import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock children that have heavy deps (cytoscape, fetch, etc.)
vi.mock("./components/SeamsGraph", () => ({
  SeamsGraph: () => <div data-testid="seams-graph" />,
}));
vi.mock("./components/RunControls", () => ({
  RunControls: () => <div data-testid="run-controls" />,
}));
vi.mock("./theatre/TheatreScene", () => ({
  TheatreScene: ({ engine }: { engine: string }) => (
    <div data-testid="theatre-scene">theatre {engine}</div>
  ),
}));

// Mock the stream hook so we control vitals/events directly.
const streamState: { connected: boolean; vitals: any; events: any[] } = {
  connected: false,
  vitals: null,
  events: [],
};
vi.mock("./useSurgeryStream", () => ({
  useSurgeryStream: () => streamState,
}));

import { App } from "./App";

beforeEach(() => {
  streamState.connected = false;
  streamState.vitals = null;
  streamState.events = [];
  (globalThis as any).fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
});

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe("App", () => {
  it("renders the topbar with title", () => {
    render(<App />);
    expect(screen.getByText(/Brownfield Code Surgeon/i)).toBeInTheDocument();
  });

  it("shows '—' for run id when vitals is null", () => {
    render(<App />);
    expect(screen.getByText(/run:/)).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the run id from vitals when present", () => {
    streamState.vitals = {
      runId: "run-xyz",
      engine: "sdk",
      currentPhase: null,
      repoRoot: "/r",
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
      coverage: {},
      tests: { total: 0, passing: 0, failing: 0 },
      seamsFound: 0,
      dependenciesBroken: 0,
      artifacts: [],
    };
    render(<App />);
    expect(screen.getByText("run:", { exact: false })).toHaveTextContent(
      "run-xyz",
    );
    expect(screen.getByText("engine:", { exact: false })).toHaveTextContent(
      "sdk",
    );
  });

  it("shows 'offline' when stream is disconnected", () => {
    render(<App />);
    expect(screen.getByText(/offline/)).toBeInTheDocument();
  });

  it("shows 'live' when stream is connected", () => {
    streamState.connected = true;
    render(<App />);
    expect(screen.getByText(/live/)).toBeInTheDocument();
  });

  it("renders all four panels", () => {
    render(<App />);
    expect(screen.getByText("Vitals")).toBeInTheDocument();
    expect(screen.getByText("Phase Timeline")).toBeInTheDocument();
    expect(screen.getByText(/Seams.*Dependencies/)).toBeInTheDocument();
    expect(screen.getByText("Surgical Log")).toBeInTheDocument();
  });

  it("renders RunControls and TheatreToggle", () => {
    render(<App />);
    expect(screen.getByTestId("run-controls")).toBeInTheDocument();
    expect(screen.getByText(/theatre/i)).toBeInTheDocument();
  });

  it("toggles theatre mode visibility on click", async () => {
    render(<App />);
    const toggle = screen.getByText(/theatre/i);
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByTestId("theatre-scene")).toBeInTheDocument();
    });
  });

  it("hides the dashboard grid when theatre is active", async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByText(/theatre/i));
    await waitFor(() => screen.getByTestId("theatre-scene"));
    const main = container.querySelector("main.grid") as HTMLElement;
    expect(main.style.visibility).toBe("hidden");
  });

  it("passes the engine prop into TheatreScene", async () => {
    streamState.vitals = {
      runId: "r",
      engine: "sdk",
      currentPhase: null,
      repoRoot: "/r",
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
      coverage: {},
      tests: { total: 0, passing: 0, failing: 0 },
      seamsFound: 0,
      dependenciesBroken: 0,
      artifacts: [],
    };
    render(<App />);
    fireEvent.click(screen.getByText(/theatre/i));
    await waitFor(() => screen.getByTestId("theatre-scene"));
    expect(screen.getByTestId("theatre-scene")).toHaveTextContent("theatre sdk");
  });

});
