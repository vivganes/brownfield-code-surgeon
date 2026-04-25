import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { useSurgeryStream } from "./useSurgeryStream";
import type { Vitals } from "./types";

type Listener = (ev: any) => void;

class MockEventSource {
  static lastInstance: MockEventSource | null = null;
  url: string;
  listeners: Map<string, Listener[]> = new Map();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.lastInstance = this;
  }

  addEventListener(name: string, handler: Listener): void {
    const arr = this.listeners.get(name) ?? [];
    arr.push(handler);
    this.listeners.set(name, arr);
  }

  emit(name: string, data?: unknown): void {
    const handlers = this.listeners.get(name) ?? [];
    const event = { data: data === undefined ? "" : JSON.stringify(data) };
    for (const h of handlers) h(event);
  }
}

beforeEach(() => {
  (globalThis as any).EventSource = MockEventSource;
  MockEventSource.lastInstance = null;
});

afterEach(() => {
  delete (globalThis as any).EventSource;
});

function Harness(): JSX.Element {
  const { connected, vitals, events } = useSurgeryStream();
  return (
    <div>
      <div data-testid="connected">{connected ? "yes" : "no"}</div>
      <div data-testid="run">{vitals?.runId ?? "none"}</div>
      <div data-testid="events">{events.length}</div>
    </div>
  );
}

const fullVitals = (overrides: Partial<Vitals> = {}): Vitals => ({
  runId: "run-1",
  engine: "sdk",
  currentPhase: null,
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

describe("useSurgeryStream", () => {
  it("opens an EventSource at /api/stream", () => {
    render(<Harness />);
    expect(MockEventSource.lastInstance).not.toBeNull();
    expect(MockEventSource.lastInstance!.url).toBe("/api/stream");
  });

  it("starts disconnected with null vitals and no events", () => {
    render(<Harness />);
    expect(screen.getByTestId("connected")).toHaveTextContent("no");
    expect(screen.getByTestId("run")).toHaveTextContent("none");
    expect(screen.getByTestId("events")).toHaveTextContent("0");
  });

  it("flips to connected on the hello event", () => {
    render(<Harness />);
    act(() => {
      MockEventSource.lastInstance!.emit("hello", { ok: true });
    });
    expect(screen.getByTestId("connected")).toHaveTextContent("yes");
  });

  it("flips to connected on onopen", () => {
    render(<Harness />);
    act(() => {
      MockEventSource.lastInstance!.onopen?.();
    });
    expect(screen.getByTestId("connected")).toHaveTextContent("yes");
  });

  it("flips back to disconnected on onerror", () => {
    render(<Harness />);
    act(() => {
      MockEventSource.lastInstance!.onopen?.();
    });
    act(() => {
      MockEventSource.lastInstance!.onerror?.();
    });
    expect(screen.getByTestId("connected")).toHaveTextContent("no");
  });

  it("parses and stores vitals payloads", () => {
    render(<Harness />);
    act(() => {
      MockEventSource.lastInstance!.emit("vitals", fullVitals({ runId: "run-42" }));
    });
    expect(screen.getByTestId("run")).toHaveTextContent("run-42");
  });

  it("ignores malformed vitals payloads", () => {
    render(<Harness />);
    act(() => {
      const handlers =
        MockEventSource.lastInstance!.listeners.get("vitals") ?? [];
      // Bypass the JSON.stringify in emit() to send a literal bad string.
      for (const h of handlers) h({ data: "{not-json" });
    });
    expect(screen.getByTestId("run")).toHaveTextContent("none");
  });

  it("appends event payloads in order", () => {
    render(<Harness />);
    act(() => {
      MockEventSource.lastInstance!.emit("event", {
        type: "PhaseStart",
        timestamp: new Date().toISOString(),
        phase: "plan",
      });
    });
    act(() => {
      MockEventSource.lastInstance!.emit("event", {
        type: "PhaseEnd",
        timestamp: new Date().toISOString(),
        phase: "plan",
        outcome: "completed",
        durationMs: 1,
      });
    });
    expect(screen.getByTestId("events")).toHaveTextContent("2");
  });

  it("ignores malformed event payloads", () => {
    render(<Harness />);
    act(() => {
      const handlers =
        MockEventSource.lastInstance!.listeners.get("event") ?? [];
      for (const h of handlers) h({ data: "{bad" });
    });
    expect(screen.getByTestId("events")).toHaveTextContent("0");
  });

  it("caps the event buffer at 500 entries", () => {
    render(<Harness />);
    act(() => {
      const handlers =
        MockEventSource.lastInstance!.listeners.get("event") ?? [];
      for (let i = 0; i < 600; i++) {
        const ev = {
          data: JSON.stringify({
            type: "PhaseStart",
            timestamp: new Date(i).toISOString(),
            phase: "plan",
          }),
        };
        for (const h of handlers) h(ev);
      }
    });
    expect(screen.getByTestId("events")).toHaveTextContent("500");
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = render(<Harness />);
    const es = MockEventSource.lastInstance!;
    unmount();
    expect(es.close).toHaveBeenCalled();
  });
});
