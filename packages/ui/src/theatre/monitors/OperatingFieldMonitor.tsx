import { useEffect, useRef, useState } from "react";

type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

interface ChangedFile {
  status: ChangeStatus;
  path: string;
  fromPath?: string;
}

interface ChangesResult {
  available: boolean;
  baseline: string | null;
  files: ChangedFile[];
  reason?: string;
}

const STATUS_GLYPH: Record<ChangeStatus, string> = {
  added: "+",
  modified: "~",
  deleted: "−",
  renamed: "→",
  untracked: "?",
};

const STATUS_COLOR: Record<ChangeStatus, string> = {
  added: "#22c55e",
  modified: "#f59e0b",
  deleted: "#ef4444",
  renamed: "#a78bfa",
  untracked: "#60a5fa",
};

const POLL_MS = 5000;

export function OperatingFieldMonitor(): JSX.Element {
  const [data, setData] = useState<ChangesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async (): Promise<void> => {
      try {
        const res = await fetch("/api/changes");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ChangesResult;
        if (!cancelled) {
          setData(body);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    };
    void fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const files = data?.files ?? [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          fontSize: 11,
          letterSpacing: "0.22em",
          color: "#64718f",
          padding: "14px 16px",
          textTransform: "uppercase",
          fontWeight: 700,
          background: "#05070e",
          borderBottom: "1px solid #1b2540",
        }}
      >
        Operating Field — {files.length} {files.length === 1 ? "file" : "files"}
      </div>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 13,
        }}
      >
        {error && (
          <div style={{ color: "#ef4444", fontStyle: "italic", fontSize: 14 }}>
            {error}
          </div>
        )}
        {!error && data && !data.available && (
          <div style={{ color: "#64718f", fontStyle: "italic", fontSize: 14 }}>
            {data.reason ?? "no baseline"}
          </div>
        )}
        {!error && data && data.available && files.length === 0 && (
          <div style={{ color: "#64718f", fontStyle: "italic", fontSize: 14 }}>
            no incisions yet…
          </div>
        )}
        {files.map((f, i) => (
          <div
            key={`${f.path}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 90px 1fr",
              gap: 8,
              padding: "5px 6px",
              borderBottom: "1px dashed #1b2540",
              alignItems: "start",
            }}
            title={f.fromPath ? `${f.fromPath} → ${f.path}` : f.path}
          >
            <span
              style={{
                color: STATUS_COLOR[f.status],
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {STATUS_GLYPH[f.status]}
            </span>
            <span
              style={{
                color: STATUS_COLOR[f.status],
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontWeight: 700,
              }}
            >
              {f.status}
            </span>
            <span
              style={{
                color: "#e6ecff",
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {f.fromPath ? `${f.fromPath} → ${f.path}` : f.path}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
