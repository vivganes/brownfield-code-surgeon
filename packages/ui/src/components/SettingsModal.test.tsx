import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { SettingsModal } from "./SettingsModal";

function jsonResponse(body: any, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe("SettingsModal", () => {
  it("loads current settings + environment list on mount", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      if (input === "/api/settings") {
        return jsonResponse({ githubTokenSet: true, agentEnvId: "env_abc" });
      }
      if (input === "/api/managed/environments") {
        return jsonResponse({
          environments: [
            { id: "env_abc", name: "primary" },
            { id: "env_xyz", name: "secondary" },
          ],
        });
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    render(<SettingsModal onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/settings"),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/managed/environments"),
    );

    // The dropdown pre-selects the current env.
    await waitFor(() => screen.getByText(/primary/));
    expect(
      screen.getByPlaceholderText(/leave blank to keep existing token/i),
    ).toBeInTheDocument();
  });

  it("PUTs only fields the user filled in", async () => {
    let capturedBody: string | undefined;
    const fetchMock = vi.fn(async (input: any, init?: any) => {
      if (input === "/api/settings" && (!init || !init.method)) {
        return jsonResponse({ githubTokenSet: false, agentEnvId: null });
      }
      if (input === "/api/managed/environments") {
        return jsonResponse({
          environments: [{ id: "env_abc", name: "primary" }],
        });
      }
      if (input === "/api/settings" && init?.method === "PUT") {
        capturedBody = init.body;
        return jsonResponse({
          ok: true,
          githubTokenSet: true,
          agentEnvId: "env_abc",
        });
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    let saved: { githubTokenSet: boolean; agentEnvId: string | null } | null =
      null;
    render(
      <SettingsModal
        onClose={() => {}}
        onSaved={(s) => (saved = s)}
      />,
    );

    await waitFor(() => screen.getByText(/primary/));
    // Fill the token
    const tokenInput = screen.getByPlaceholderText(/ghp_/);
    fireEvent.change(tokenInput, { target: { value: "ghp_xyz" } });

    // Pick the environment
    const envSelect = screen.getByRole("combobox");
    fireEvent.change(envSelect, { target: { value: "env_abc" } });

    fireEvent.click(screen.getByText("💾 SAVE CONFIG"));
    await waitFor(() => expect(capturedBody).toBeDefined());
    const parsed = JSON.parse(capturedBody!);
    expect(parsed).toEqual({ githubToken: "ghp_xyz", agentEnvId: "env_abc" });
    await waitFor(() => expect(saved).not.toBeNull());
    expect(saved).toEqual({ githubTokenSet: true, agentEnvId: "env_abc" });
  });

  it("handles environments endpoint error and shows the message", async () => {
    const fetchMock = vi.fn(async (input: any) => {
      if (input === "/api/settings") {
        return jsonResponse({ githubTokenSet: false, agentEnvId: null });
      }
      if (input === "/api/managed/environments") {
        return jsonResponse({ error: "ANTHROPIC_API_KEY not set" }, false, 503);
      }
      return jsonResponse({});
    });
    (globalThis as any).fetch = fetchMock;

    render(<SettingsModal onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/ANTHROPIC_API_KEY not set/)).toBeInTheDocument(),
    );
  });

  it("Escape calls onClose", async () => {
    (globalThis as any).fetch = vi.fn(async () => jsonResponse({}));
    const onClose = vi.fn();
    render(<SettingsModal onClose={onClose} onSaved={() => {}} />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
