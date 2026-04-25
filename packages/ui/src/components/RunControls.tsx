import { useEffect, useState } from "react";
import { SettingsModal, type SettingsState } from "./SettingsModal.js";

type RunStatus = {
  running: boolean;
  state: { engine: string; runId: string | null; startedAt: string } | null;
};

type ModelOption = { id: string; label: string; tag?: string };

const MODELS: ModelOption[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", tag: "most capable" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", tag: "balanced" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", tag: "fastest" },
];

type ThinkingLevel = "off" | "low" | "medium" | "high";
const THINKING_LEVELS: Array<{ id: ThinkingLevel; label: string; tag: string }> = [
  { id: "off", label: "Off", tag: "fastest, no extended thinking" },
  { id: "low", label: "Low", tag: "~2k thinking tokens" },
  { id: "medium", label: "Medium", tag: "~5k thinking tokens" },
  { id: "high", label: "High", tag: "~12k thinking tokens, deepest" },
];

export function RunControls(): JSX.Element {
  const [status, setStatus] = useState<RunStatus>({ running: false, state: null });
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/run/status");
        if (res.ok) setStatus(await res.json());
      } catch {
        // ignore
      }
    };
    void poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) setSettings(await res.json());
      } catch {
        // ignore
      }
    })();
  }, []);

  const abort = async () => {
    setError(null);
    try {
      await fetch("/api/run/abort", { method: "POST" });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="controls">
      {status.running ? (
        <>
          <span style={{ fontSize: 11, color: "var(--accent)" }}>
            ● running ({status.state?.runId ?? "?"})
          </span>
          <button onClick={abort}>Abort</button>
        </>
      ) : (
        <>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              background: "var(--accent)",
              color: "#07142c",
              border: "none",
              borderRadius: 4,
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            + New Surgery
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            aria-label="Settings"
            style={{
              background: "transparent",
              border: "1px solid #22284a",
              color: "var(--muted)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ⚙
          </button>
        </>
      )}
      {error && <span style={{ fontSize: 11, color: "var(--err)" }}>{error}</span>}
      {modalOpen && (
        <NewSurgeryModal
          settings={settings}
          onOpenSettings={() => {
            setModalOpen(false);
            setSettingsOpen(true);
          }}
          onClose={() => setModalOpen(false)}
          onStarted={(state) => {
            setStatus({ running: true, state });
            setModalOpen(false);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewSurgeryModal({
  settings,
  onOpenSettings,
  onClose,
  onStarted,
}: {
  settings: SettingsState | null;
  onOpenSettings: () => void;
  onClose: () => void;
  onStarted: (state: RunStatus["state"]) => void;
}): JSX.Element {
  const [request, setRequest] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [model, setModel] = useState(MODELS[0]!.id);
  const [thinking, setThinking] = useState<ThinkingLevel>("medium");
  const [autoApprove, setAutoApprove] = useState(false);
  const [managedFinish, setManagedFinish] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const j = await res.json();
          if (typeof j.repoRoot === "string") setWorkspace(j.repoRoot);
        }
      } catch {
        // ignore
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/repo/origin");
        if (res.ok) {
          const j = await res.json();
          if (typeof j.repoUrl === "string") setRepoUrl(j.repoUrl);
          if (typeof j.baseBranch === "string") setBaseBranch(j.baseBranch);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const managedReady =
    !managedFinish ||
    (Boolean(settings?.githubTokenSet) && Boolean(settings?.agentEnvId));
  const start = async () => {
    const trimmed = request.trim();
    if (!trimmed || submitting) return;
    if (!managedReady) {
      setError(
        "Managed Finish needs a GitHub token and a Managed-Agents environment. Click ⚙ to configure.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        request: trimmed,
        engine: managedFinish ? "managed" : "sdk",
        model,
        thinking,
        autoApprove,
        workspace: workspace.trim() || undefined,
      };
      if (managedFinish) {
        payload.managed = {
          repoUrl: repoUrl.trim() || undefined,
          baseBranch: baseBranch.trim() || undefined,
          agentEnvId: settings?.agentEnvId ?? undefined,
        };
      }
      const res = await fetch("/api/run/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `error ${res.status}`);
        setSubmitting(false);
        return;
      }
      const r = await res.json();
      onStarted(r.state);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={() => !submitting && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5,7,16,0.72)",
        backdropFilter: "blur(4px)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid #22284a",
          borderRadius: 10,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          width: "min(640px, 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #22284a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background:
              "linear-gradient(90deg, rgba(94,234,212,0.10), rgba(94,234,212,0))",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--accent)",
            }}
          >
            New Surgery
          </h3>
          <button
            onClick={onClose}
            disabled={submitting}
            style={closeBtn}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={label}>
            <span>Workspace folder</span>
            <input
              type="text"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="absolute path to the repo this surgery will run in"
              spellCheck={false}
              style={input}
            />
          </label>

          <label style={label}>
            <span>Describe the change</span>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="e.g. add a /comments endpoint that supports pagination and auth"
              rows={5}
              autoFocus
              style={textarea}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={label}>
              <span>Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={select}
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.tag ? ` — ${m.tag}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label style={label}>
              <span>Thinking</span>
              <select
                value={thinking}
                onChange={(e) => setThinking(e.target.value as ThinkingLevel)}
                style={select}
              >
                {THINKING_LEVELS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {t.tag}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <input
              type="checkbox"
              aria-label="auto-approve each phase"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
            />
            auto-approve each phase (skip the hand-off gates)
          </label>

          <div
            style={{
              borderTop: "1px solid #1a1f3a",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <input
                type="checkbox"
                aria-label="run finish on managed runner"
                checked={managedFinish}
                onChange={(e) => setManagedFinish(e.target.checked)}
              />
              <span>
                Run on Managed Agents (cloud)
                <span style={{ display: "block", fontSize: 11, opacity: 0.7 }}>
                  Spawns the run inside an Anthropic Managed-Agents environment instead of the local SDK runner.
                </span>
              </span>
            </label>

            {managedFinish && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: "10px 12px",
                  background: "rgba(94,234,212,0.04)",
                  border: "1px solid rgba(94,234,212,0.2)",
                  borderRadius: 4,
                }}
              >
                <label style={label}>
                  <span>Repo URL</span>
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo.git"
                    spellCheck={false}
                    style={input}
                  />
                </label>
                <label style={label}>
                  <span>Base branch</span>
                  <input
                    type="text"
                    value={baseBranch}
                    onChange={(e) => setBaseBranch(e.target.value)}
                    placeholder="main"
                    spellCheck={false}
                    style={input}
                  />
                </label>
                {!managedReady && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--err)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>
                      Missing{" "}
                      {!settings?.githubTokenSet && "GitHub token"}
                      {!settings?.githubTokenSet && !settings?.agentEnvId && " and "}
                      {!settings?.agentEnvId && "Managed-Agents environment"}.
                    </span>
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      style={{
                        background: "var(--panel-2)",
                        color: "var(--accent)",
                        border: "1px solid #22284a",
                        borderRadius: 4,
                        padding: "4px 10px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Configure ⚙
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                color: "var(--err)",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 4,
                padding: "8px 10px",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #22284a",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button onClick={onClose} disabled={submitting} style={secondaryBtn}>
            Cancel
          </button>
          <button
            onClick={start}
            disabled={submitting || !request.trim() || !managedReady}
            style={{
              ...primaryBtn,
              opacity:
                submitting || !request.trim() || !managedReady ? 0.5 : 1,
              cursor:
                submitting || !request.trim() || !managedReady
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {submitting
              ? "starting…"
              : managedFinish
                ? "Start Surgery on Managed Agents"
                : "Start Surgery using Claude SDK"}
          </button>
        </div>
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
  fontWeight: 600,
};

const textarea: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  resize: "vertical",
  lineHeight: 1.4,
};

const input: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

const select: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "8px 12px",
  fontSize: 13,
};

const primaryBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#07142c",
  border: "none",
  borderRadius: 4,
  padding: "8px 18px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "8px 14px",
  fontSize: 12,
  cursor: "pointer",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--muted)",
  border: "none",
  fontSize: 16,
  cursor: "pointer",
  padding: 4,
};
