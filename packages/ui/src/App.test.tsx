import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("./components/RunControls", () => ({
  RunControls: () => <div data-testid="run-controls" />,
}));
vi.mock("./theatre/TheatreScene", () => ({
  TheatreScene: ({ engine }: { engine: string }) => (
    <div data-testid="theatre-scene">theatre {engine}</div>
  ),
}));

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

function vitalsFixture(overrides: Partial<any> = {}): any {
  return {
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
    ...overrides,
  };
}

describe("App", () => {
  it("renders the topbar with title", () => {
    render(<App />);
    expect(screen.getByText(/Brownfield Code Surgeon/i)).toBeInTheDocument();
  });

  it("renders the RunControls in the topbar", () => {
    render(<App />);
    expect(screen.getByTestId("run-controls")).toBeInTheDocument();
  });

  it("shows '—' for run id when vitals is null", () => {
    render(<App />);
    expect(screen.getByText(/Run ID/)).toBeInTheDocument();
    expect(screen.getAllByText(/—/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the run id and engine from vitals when present", () => {
    streamState.vitals = vitalsFixture({ runId: "run-xyz", engine: "sdk" });
    render(<App />);
    expect(screen.getByText(/Run ID/).closest(".hud-readout")).toHaveTextContent("run-xyz");
    expect(screen.getByText(/Engine/).closest(".hud-readout")).toHaveTextContent("sdk");
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

  it("always renders the TheatreScene (no toggle)", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("theatre-scene")).toBeInTheDocument();
    });
  });

  it("passes the engine prop into TheatreScene", async () => {
    streamState.vitals = vitalsFixture({ engine: "sdk" });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("theatre-scene")).toHaveTextContent("theatre sdk");
    });
  });

  it("falls back to 'sdk' engine when vitals is null", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("theatre-scene")).toHaveTextContent("theatre sdk");
    });
  });
});
