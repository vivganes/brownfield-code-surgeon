import { useEffect, useState } from "react";
import { playClose, playOpen } from "../sounds.js";

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

  useEffect(() => { playOpen(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !saving) { playClose(); onClose(); }
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
      onClick={() => { if (!saving) { playClose(); onClose(); } }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3,5,14,0.85)",
        backdropFilter: "blur(6px)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.05) 3px, rgba(0,0,0,0.05) 4px)",
        zIndex: 1,
      }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="surgery-modal-dialog"
        style={{
          background: "var(--panel)",
          border: "1px solid rgba(94,234,212,0.28)",
          borderRadius: 10,
          width: "min(520px, 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(94,234,212,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(167,139,250,0.12), rgba(94,234,212,0.06), rgba(94,234,212,0))",
            position: "relative",
          }}
        >
          <div className="hud-corner tl" />
          <div className="hud-corner tr" />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: "rgba(167,139,250,0.6)", fontWeight: 700, fontFamily: "'Orbitron', sans-serif" }}>
              ◈ Brownfield Code Surgeon &nbsp;·&nbsp; System Config
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--accent-2)",
                fontWeight: 800,
                textShadow: "0 0 20px rgba(167,139,250,0.5)",
                fontFamily: "'Orbitron', sans-serif",
              }}
            >
              ⚙ CONFIG
            </h3>
          </div>
          <button onClick={() => { playClose(); onClose(); }} disabled={saving} style={closeBtn} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="surgery-section-bar" style={{ color: "rgba(167,139,250,0.55)", "--bar-color": "rgba(167,139,250,0.25)" } as React.CSSProperties}>Managed Agents Credentials</div>
          <label style={label}>
            <span>
              GitHub token{current?.githubTokenSet ? " ✓ configured" : ""}
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
            padding: "14px 20px",
            borderTop: "1px solid rgba(94,234,212,0.15)",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 10,
            background: "linear-gradient(90deg, rgba(94,234,212,0), rgba(167,139,250,0.04))",
          }}
        >
          <button onClick={() => { playClose(); onClose(); }} disabled={saving} style={{ ...secondaryBtn, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="start-surgery-btn"
            style={{
              background: saving ? undefined : "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
              boxShadow: saving ? undefined : "0 0 16px rgba(167,139,250,0.35), 0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            {saving ? "⏳ SAVING…" : "💾 SAVE CONFIG"}
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
  fontSize: 9,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--muted)",
  fontWeight: 700,
  fontFamily: "'Orbitron', ui-sans-serif, sans-serif",
};

const input: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "'Share Tech Mono', ui-monospace, monospace",
};

const select: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "8px 12px",
  fontSize: 12,
  fontFamily: "'Orbitron', ui-sans-serif, sans-serif",
};

const secondaryBtn: React.CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--fg)",
  border: "1px solid #22284a",
  borderRadius: 4,
  padding: "8px 14px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "'Orbitron', ui-sans-serif, sans-serif",
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--muted)",
  border: "none",
  fontSize: 16,
  cursor: "pointer",
  padding: 4,
};
