import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { RunControls } from "./RunControls";

function mockFetchSequence(handlers: Array<(input: any, init?: any) => any>) {
  let i = 0;
  return vi.fn(async (input: any, init?: any) => {
    const handler = handlers[Math.min(i, handlers.length - 1)]!;
    i += 1;
    return handler(input, init);
  });
}

function jsonResponse(body: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).fetch;
});

describe("RunControls", () => {
  it("polls /api/run/status on mount", async () => {
    const fetchMock = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/run/status");
  });

  it("shows the New Surgery button when not running", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("+ New Surgery")).toBeInTheDocument();
  });

  it("shows running pill and Abort button when running", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () =>
        jsonResponse({
          running: true,
          state: { engine: "sdk", runId: "abc-123", startedAt: "now" },
        }),
    ]);
    render(<RunControls />);
    await waitFor(() => {
      expect(screen.getByText(/abc-123/)).toBeInTheDocument();
    });
    expect(screen.getByText("Abort")).toBeInTheDocument();
  });

  it("Abort posts to /api/run/abort", async () => {
    const fetchMock = mockFetchSequence([
      () =>
        jsonResponse({
          running: true,
          state: { engine: "sdk", runId: "abc", startedAt: "now" },
        }),
      () => jsonResponse({}),
    ]);
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await waitFor(() => screen.getByText("Abort"));

    fireEvent.click(screen.getByText("Abort"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/run/abort", { method: "POST" });
    });
  });

  it("opens the New Surgery modal", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("+ New Surgery"));
    expect(screen.getByText("New Surgery")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add a \/comments endpoint/i)).toBeInTheDocument();
  });

  it("modal Start button is disabled when request is empty", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("+ New Surgery"));
    const startBtn = screen.getByText("Start Surgery using Claude SDK");
    expect(startBtn).toBeDisabled();
  });

  it("modal Start button enables once request is non-empty", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("+ New Surgery"));
    const textarea = screen.getByPlaceholderText(/add a \/comments endpoint/i);
    fireEvent.change(textarea, { target: { value: "do something" } });
    expect(screen.getByText("Start Surgery using Claude SDK")).not.toBeDisabled();
  });

  it("Cancel closes the modal", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("+ New Surgery"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("Escape key closes the modal", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("+ New Surgery"));
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("Start posts the form payload to /api/run/start", async () => {
    let capturedBody: string | undefined;
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      if (input === "/api/run/status") {
        return jsonResponse({ running: false, state: null });
      }
      if (input === "/api/run/start") {
        capturedBody = init?.body;
        return jsonResponse({
          state: { engine: "sdk", runId: "new-run", startedAt: "now" },
        });
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("+ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "build a thing" },
    });
    fireEvent.click(screen.getByText("Start Surgery using Claude SDK"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/run/start",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toMatchObject({
      request: "build a thing",
      engine: "sdk",
      thinking: "medium",
      autoApprove: false,
    });
    expect(parsed.model).toBe("claude-opus-4-7");
  });

  it("Start trims the request before submitting", async () => {
    let capturedBody: string | undefined;
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      if (input === "/api/run/status") {
        return jsonResponse({ running: false, state: null });
      }
      capturedBody = init?.body;
      return jsonResponse({ state: { engine: "sdk", runId: "x", startedAt: "y" } });
    });
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("+ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "   build a thing   " },
    });
    fireEvent.click(screen.getByText("Start Surgery using Claude SDK"));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(JSON.parse(capturedBody!).request).toBe("build a thing");
  });

  it("shows error when start endpoint returns non-ok", async () => {
    (globalThis as any).fetch = vi.fn(async (input: any) => {
      if (input === "/api/run/status") {
        return jsonResponse({ running: false, state: null });
      }
      return jsonResponse({ error: "engine busy" }, false, 409);
    });

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("+ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByText("Start Surgery using Claude SDK"));

    await waitFor(() => {
      expect(screen.getByText("engine busy")).toBeInTheDocument();
    });
  });

  it("toggles auto-approve checkbox", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("+ New Surgery"));
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("offers all three model options", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("+ New Surgery"));
    expect(screen.getByText(/Claude Opus 4.7/)).toBeInTheDocument();
    expect(screen.getByText(/Claude Sonnet 4.6/)).toBeInTheDocument();
    expect(screen.getByText(/Claude Haiku 4.5/)).toBeInTheDocument();
  });

  it("offers all four thinking levels", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("+ New Surgery"));
    expect(screen.getByText(/Off — fastest/)).toBeInTheDocument();
    expect(screen.getByText(/Low — ~2k/)).toBeInTheDocument();
    expect(screen.getByText(/Medium — ~5k/)).toBeInTheDocument();
    expect(screen.getByText(/High — ~12k/)).toBeInTheDocument();
  });

  it("polls every 2 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse({ running: false, state: null }));
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
