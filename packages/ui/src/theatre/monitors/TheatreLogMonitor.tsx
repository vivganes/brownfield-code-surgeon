import { useEffect, useRef } from "react";
import type { SurgeryEvent } from "../../types";

const TYPE_COLOR: Record<string, string> = {
  PhaseStart: "#5eead4",
  PhaseEnd: "#60a5fa",
  ArtifactWritten: "#a78bfa",
  ToolUse: "#8892b8",
  TestRun: "#f59e0b",
  CoverageDelta: "#22c55e",
  ApprovalRequested: "#f59e0b",
  ApprovalGranted: "#22c55e",
};

export function TheatreLogMonitor({ events }: { events: SurgeryEvent[] }): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  const tail = events.slice(-18);

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
        Surgical Log — Last {tail.length}
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
        {tail.length === 0 && (
          <div style={{ color: "#64718f", fontStyle: "italic", fontSize: 14 }}>
            no events yet…
          </div>
        )}
        {tail.map((ev, i) => (
          <div
            key={`${ev.timestamp}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "80px 120px 70px 1fr",
              gap: 8,
              padding: "5px 6px",
              borderBottom: "1px dashed #1b2540",
              alignItems: "start",
            }}
          >
            <span style={{ color: "#64718f" }}>{formatTime(ev.timestamp)}</span>
            <span
              style={{
                color: TYPE_COLOR[ev.type] ?? "#e6ecff",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {ev.type}
            </span>
            <span style={{ color: "#a78bfa", textTransform: "uppercase" }}>{ev.phase}</span>
            <span
              style={{
                color: "#e6ecff",
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {summarize(ev)}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false });
  } catch {
    return ts;
  }
}

function summarize(ev: SurgeryEvent): string {
  const e = ev as Record<string, unknown>;
  switch (ev.type) {
    case "ToolUse":
      return `${e.tool ?? ""}${e.blocked ? " (blocked)" : ""}${e.summary ? ` — ${e.summary}` : ""}`;
    case "ArtifactWritten":
      return `${e.kind ?? ""}: ${e.path ?? ""}${e.bytes != null ? ` (${e.bytes}B)` : ""}`;
    case "PhaseStart":
      return `started${e.request ? ` — ${e.request}` : ""}`;
    case "PhaseEnd":
      return `${e.outcome ?? ""} in ${e.durationMs ?? "?"}ms`;
    case "TestRun":
      return `${e.passed ?? 0}/${e.total ?? 0} passed${e.failed ? ` (${e.failed} failing)` : ""}`;
    case "CoverageDelta": {
      const before = (e.before as { statements?: number } | undefined)?.statements;
      const after = (e.after as { statements?: number } | undefined)?.statements;
      return `stmts ${before?.toFixed(1) ?? "?"}% → ${after?.toFixed(1) ?? "?"}%`;
    }
    case "ApprovalRequested":
      return `approval needed: ${e.summary ?? ""}`;
    case "ApprovalGranted":
      return `approved by ${e.approvedBy ?? ""}`;
    default:
      return "";
  }
}
