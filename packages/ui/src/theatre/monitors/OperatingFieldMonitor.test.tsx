import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { OperatingFieldMonitor } from "./OperatingFieldMonitor.js";

function mockFetch(body: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fn = vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    }),
  );
  (global as any).fetch = fn;
  return fn;
}

describe("OperatingFieldMonitor", () => {
  afterEach(() => {
    cleanup();
    delete (global as any).fetch;
  });

  it("shows the empty state when the API reports no baseline", async () => {
    mockFetch({ available: false, baseline: null, files: [], reason: "no baseline recorded" });
    render(<OperatingFieldMonitor />);
    await waitFor(() => {
      expect(screen.getByText(/no baseline recorded/i)).toBeInTheDocument();
    });
  });

  it("renders 'no incisions yet' when available but no files have changed", async () => {
    mockFetch({ available: true, baseline: "abc", files: [] });
    render(<OperatingFieldMonitor />);
    await waitFor(() => {
      expect(screen.getByText(/no incisions yet/i)).toBeInTheDocument();
    });
  });

  it("lists files with their status labels", async () => {
    mockFetch({
      available: true,
      baseline: "abc",
      files: [
        { status: "added", path: "src/new.ts" },
        { status: "modified", path: "src/old.ts" },
        { status: "deleted", path: "src/gone.ts" },
        { status: "untracked", path: "tmp.log" },
      ],
    });
    render(<OperatingFieldMonitor />);
    await waitFor(() => {
      expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    });
    expect(screen.getByText("src/old.ts")).toBeInTheDocument();
    expect(screen.getByText("src/gone.ts")).toBeInTheDocument();
    expect(screen.getByText("tmp.log")).toBeInTheDocument();
    expect(screen.getByText(/operating field — 4 files/i)).toBeInTheDocument();
  });

  it("renders renamed files with arrow notation", async () => {
    mockFetch({
      available: true,
      baseline: "abc",
      files: [{ status: "renamed", path: "src/new.ts", fromPath: "src/old.ts" }],
    });
    render(<OperatingFieldMonitor />);
    await waitFor(() => {
      expect(screen.getByText(/src\/old\.ts → src\/new\.ts/)).toBeInTheDocument();
    });
  });

  it("displays an error banner when the fetch fails", async () => {
    (global as any).fetch = vi.fn(() => Promise.reject(new Error("network down")));
    render(<OperatingFieldMonitor />);
    await waitFor(() => {
      expect(screen.getByText(/network down/i)).toBeInTheDocument();
    });
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("polls /api/changes every 5 seconds", async () => {
      const fetchMock = mockFetch({ available: true, baseline: "abc", files: [] });
      render(<OperatingFieldMonitor />);
      // Allow the initial useEffect fetch to settle.
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      await vi.advanceTimersByTimeAsync(5000);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      await vi.advanceTimersByTimeAsync(5000);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    });
  });
});
