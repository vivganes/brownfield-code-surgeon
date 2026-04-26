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
    expect(screen.getByText("⚕ New Surgery")).toBeInTheDocument();
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

    fireEvent.click(screen.getByText("⚕ New Surgery"));
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

    fireEvent.click(screen.getByText("⚕ New Surgery"));
    const startBtn = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
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

    fireEvent.click(screen.getByText("⚕ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/absolute path/i), {
      target: { value: "/repo" },
    });
    const textarea = screen.getByPlaceholderText(/add a \/comments endpoint/i);
    fireEvent.change(textarea, { target: { value: "do something" } });
    const startBtn = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    expect(startBtn).not.toBeDisabled();
  });

  it("Cancel closes the modal", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByText("⚕ New Surgery"));
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

    fireEvent.click(screen.getByText("⚕ New Surgery"));
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

    fireEvent.click(screen.getByText("⚕ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/absolute path/i), {
      target: { value: "/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "build a thing" },
    });
    const startBtn = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    fireEvent.click(startBtn);

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
    fireEvent.click(screen.getByText("⚕ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/absolute path/i), {
      target: { value: "/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "   build a thing   " },
    });
    const startBtn = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    fireEvent.click(startBtn);

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
    fireEvent.click(screen.getByText("⚕ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/absolute path/i), {
      target: { value: "/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "x" },
    });
    const startBtn = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    fireEvent.click(startBtn);

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
    fireEvent.click(screen.getByText("⚕ New Surgery"));
    const checkbox = screen.getByRole("checkbox", { name: /auto-approve/i });
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
    fireEvent.click(screen.getByText("⚕ New Surgery"));
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
    fireEvent.click(screen.getByText("⚕ New Surgery"));
    await waitFor(() => expect(screen.getByText(/^Off$/, { selector: "button" })).toBeInTheDocument());
    expect(screen.getByText(/^Low$/, { selector: "button" })).toBeInTheDocument();
    expect(screen.getByText(/^Medium$/, { selector: "button" })).toBeInTheDocument();
    expect(screen.getByText(/^High$/, { selector: "button" })).toBeInTheDocument();
  });

  it("shows the gear (Settings) button when not running", async () => {
    (globalThis as any).fetch = mockFetchSequence([
      () => jsonResponse({ running: false, state: null }),
    ]);
    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByLabelText("Settings")).toBeInTheDocument();
  });

  it("does not include managed payload when checkbox is unchecked", async () => {
    let capturedBody: string | undefined;
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      if (input === "/api/run/status") {
        return jsonResponse({ running: false, state: null });
      }
      if (input === "/api/run/start") {
        capturedBody = init?.body;
        return jsonResponse({
          state: { engine: "sdk", runId: "x", startedAt: "y" },
        });
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("⚕ New Surgery"));
    fireEvent.change(screen.getByPlaceholderText(/absolute path/i), {
      target: { value: "/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "do" },
    });
    const startBtn1 = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    fireEvent.click(startBtn1);
    await waitFor(() => expect(capturedBody).toBeDefined());
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.engine).toBe("sdk");
    expect(parsed.managed).toBeUndefined();
  });

  it("ticking managed-Finish without configured settings disables Start and shows Configure", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      if (input === "/api/run/status") {
        return jsonResponse({ running: false, state: null });
      }
      if (input === "/api/settings") {
        return jsonResponse({ githubTokenSet: false, agentEnvId: null });
      }
      if (input === "/api/repo/origin") {
        return jsonResponse({ repoUrl: "https://x/y.git", baseBranch: "main" });
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByText("⚕ New Surgery"));
    await waitFor(() => screen.getByText(/Run Finish Phase on Managed Agent/i));

    const managedCheckbox = screen.getByRole("checkbox", {
      name: /run finish phase on managed agent/i,
    });
    fireEvent.click(managedCheckbox);
    expect(managedCheckbox).toBeChecked();

    // Start button should be disabled.
    const startBtn = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    expect(startBtn).toBeDisabled();
    // Configure ⚙ button surfaced inline.
    expect(screen.getByText(/Configure/i)).toBeInTheDocument();
  });

  it("ticking managed-Finish with configured settings POSTs engine=managed with the managed payload", async () => {
    let capturedBody: string | undefined;
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      if (input === "/api/run/status") {
        return jsonResponse({ running: false, state: null });
      }
      if (input === "/api/settings") {
        return jsonResponse({ githubTokenSet: true, agentEnvId: "env_abc" });
      }
      if (input === "/api/repo/origin") {
        return jsonResponse({
          repoUrl: "https://github.com/x/y.git",
          baseBranch: "main",
        });
      }
      if (input === "/api/run/start") {
        capturedBody = init?.body;
        return jsonResponse({
          state: { engine: "managed", runId: "r-1", startedAt: "now" },
        });
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    render(<RunControls />);
    await act(async () => {
      await Promise.resolve();
    });
    // settings fetch resolves on mount; wait for it
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/settings"),
    );

    fireEvent.click(screen.getByText("⚕ New Surgery"));
    await waitFor(() => screen.getByText(/Run Finish Phase on Managed Agent/i));

    fireEvent.change(screen.getByPlaceholderText(/absolute path/i), {
      target: { value: "/repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add a \/comments endpoint/i), {
      target: { value: "build a thing" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /run finish phase on managed agent/i }),
    );

    // Wait for repo/origin pre-fill.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/repo/origin"),
    );

    const startBtn2 = await screen.findByRole("button", { name: /INITIATE SURGERY/i });
    fireEvent.click(startBtn2);
    await waitFor(() => expect(capturedBody).toBeDefined());
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.engine).toBe("managed");
    expect(parsed.managed).toMatchObject({
      repoUrl: "https://github.com/x/y.git",
      baseBranch: "main",
      agentEnvId: "env_abc",
    });
  });

  it("polls every 2 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse({ running: false, state: null }));
    (globalThis as any).fetch = fetchMock;

    const statusCallCount = (): number =>
      fetchMock.mock.calls.filter((c) => (c as any[])[0] === "/api/run/status").length;

    render(<RunControls />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(statusCallCount()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(statusCallCount()).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(statusCallCount()).toBe(3);
  });
});
