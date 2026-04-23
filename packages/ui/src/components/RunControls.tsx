import { useEffect, useState } from "react";

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
      )}
      {error && <span style={{ fontSize: 11, color: "var(--err)" }}>{error}</span>}
      {modalOpen && (
        <NewSurgeryModal
          onClose={() => setModalOpen(false)}
          onStarted={(state) => {
            setStatus({ running: true, state });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewSurgeryModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: (state: RunStatus["state"]) => void;
}): JSX.Element {
  const [request, setRequest] = useState("");
  const [model, setModel] = useState(MODELS[0]!.id);
  const [thinking, setThinking] = useState<ThinkingLevel>("medium");
  const [autoApprove, setAutoApprove] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const start = async () => {
    const trimmed = request.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/run/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: trimmed, engine: "sdk", model, thinking, autoApprove }),
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
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
            />
            auto-approve each phase (skip the hand-off gates)
          </label>

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
            disabled={submitting || !request.trim()}
            style={{
              ...primaryBtn,
              opacity: submitting || !request.trim() ? 0.5 : 1,
              cursor: submitting || !request.trim() ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "starting…" : "Start Surgery using Claude SDK"}
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
