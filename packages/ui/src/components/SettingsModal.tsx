import { useEffect, useState } from "react";

export interface SettingsState {
  githubTokenSet: boolean;
  agentEnvId: string | null;
}

interface ManagedEnvironment {
  id: string;
  name: string;
}

export function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (s: SettingsState) => void;
}): JSX.Element {
  const [tokenInput, setTokenInput] = useState("");
  const [revealToken, setRevealToken] = useState(false);
  const [envs, setEnvs] = useState<ManagedEnvironment[] | null>(null);
  const [envsError, setEnvsError] = useState<string | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState("");
  const [current, setCurrent] = useState<SettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const j = (await res.json()) as SettingsState;
          setCurrent(j);
          if (j.agentEnvId) setSelectedEnvId(j.agentEnvId);
        }
      } catch {
        // ignore — UI degrades gracefully
      }
    })();
    void refreshEnvironments();
  }, []);

  const refreshEnvironments = async (): Promise<void> => {
    setEnvsError(null);
    setEnvs(null);
    try {
      const res = await fetch("/api/managed/environments");
      if (res.ok) {
        const j = await res.json();
        setEnvs(Array.isArray(j.environments) ? j.environments : []);
      } else {
        const j = await res.json().catch(() => ({}));
        setEnvsError(j.error ?? `error ${res.status}`);
      }
    } catch (e) {
      setEnvsError(String(e));
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (tokenInput.trim().length > 0) body.githubToken = tokenInput.trim();
      if (selectedEnvId.trim().length > 0) body.agentEnvId = selectedEnvId.trim();
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `error ${res.status}`);
        setSaving(false);
        return;
      }
      const j = (await res.json()) as { ok: boolean } & SettingsState;
      onSaved({ githubTokenSet: j.githubTokenSet, agentEnvId: j.agentEnvId });
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div
      onClick={() => !saving && onClose()}
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
          width: "min(560px, 100%)",
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
            Settings
          </h3>
          <button onClick={onClose} disabled={saving} style={closeBtn} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={label}>
            <span>
              GitHub token{current?.githubTokenSet ? " (configured)" : ""}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type={revealToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={
                  current?.githubTokenSet
                    ? "leave blank to keep existing token"
                    : "ghp_… (used to clone + push from the cloud container)"
                }
                spellCheck={false}
                style={{ ...input, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setRevealToken((v) => !v)}
                style={secondaryBtn}
              >
                {revealToken ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label style={label}>
            <span>Managed-Agents environment</span>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={selectedEnvId}
                onChange={(e) => setSelectedEnvId(e.target.value)}
                style={{ ...select, flex: 1 }}
                disabled={envs === null || envs.length === 0}
              >
                {envs === null && <option value="">loading…</option>}
                {envs !== null && envs.length === 0 && (
                  <option value="">no environments found</option>
                )}
                {envs !== null &&
                  envs.length > 0 && [
                    <option key="__none" value="">
                      — select an environment —
                    </option>,
                    ...envs.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.id})
                      </option>
                    )),
                  ]}
              </select>
              <button
                type="button"
                onClick={() => void refreshEnvironments()}
                style={secondaryBtn}
              >
                Refresh
              </button>
            </div>
            {envsError && (
              <div style={{ fontSize: 11, color: "var(--err)", marginTop: 4 }}>
                {envsError}
              </div>
            )}
            {envs !== null && envs.length === 0 && !envsError && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                None found.{" "}
                <a
                  href="https://docs.anthropic.com/en/docs/managed-agents/environments"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  Create one in your Anthropic account →
                </a>
              </div>
            )}
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
          <button onClick={onClose} disabled={saving} style={secondaryBtn}>
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            style={{
              ...primaryBtn,
              opacity: saving ? 0.5 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "saving…" : "Save"}
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
