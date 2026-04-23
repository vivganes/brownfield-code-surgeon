import { useEffect, useState } from "react";

type RunStatus = {
  running: boolean;
  state: { engine: string; runId: string | null; startedAt: string } | null;
};

export function RunControls(): JSX.Element {
  const [request, setRequest] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [status, setStatus] = useState<RunStatus>({ running: false, state: null });
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

  const start = async () => {
    setError(null);
    try {
      const res = await fetch("/api/run/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, engine: "sdk", autoApprove }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `error ${res.status}`);
        return;
      }
      setStatus(await res.json().then((r) => ({ running: true, state: r.state })));
    } catch (e) {
      setError(String(e));
    }
  };

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
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="what should the surgery accomplish?"
            style={{
              background: "var(--panel-2)",
              color: "var(--fg)",
              border: "1px solid #22284a",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 11,
              width: 320,
            }}
          />
          <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
            />
            auto-approve
          </label>
          <button onClick={start} disabled={!request.trim()}>
            Start (SDK)
          </button>
        </>
      )}
      {error && <span style={{ fontSize: 11, color: "var(--err)" }}>{error}</span>}
    </div>
  );
}
