import { useEffect, useRef } from "react";
import type { SurgeryEvent } from "../types";

export function SurgicalLog({ events }: { events: SurgeryEvent[] }): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events.length]);

  if (events.length === 0) {
    return <p className="empty">No events yet. Run the plugin or SDK runner.</p>;
  }
  return (
    <div className="log">
      {events.map((ev, i) => (
        <div className="line" key={`${ev.timestamp}-${i}`}>
          <span className="t">{formatTime(ev.timestamp)}</span>
          <span className="type">{ev.type}</span>
          <span className="phase">{ev.phase}</span>
          <span>{summarize(ev)}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour12: false });
  } catch {
    return ts;
  }
}

function summarize(ev: SurgeryEvent): string {
  switch (ev.type) {
    case "ToolUse":
      return `${(ev as any).tool}${(ev as any).blocked ? " (blocked)" : ""}${(ev as any).summary ? ` — ${(ev as any).summary}` : ""}`;
    case "ArtifactWritten":
      return `${(ev as any).kind}: ${(ev as any).path} (${(ev as any).bytes}B)`;
    case "PhaseStart":
      return `started${(ev as any).request ? ` — ${(ev as any).request}` : ""}`;
    case "PhaseEnd":
      return `${(ev as any).outcome} in ${(ev as any).durationMs}ms`;
    case "TestRun": {
      const e = ev as any;
      return `${e.passed}/${e.total} passed${e.failed ? ` (${e.failed} failing)` : ""}`;
    }
    case "CoverageDelta": {
      const e = ev as any;
      return `stmts ${e.before.statements.toFixed(1)}% → ${e.after.statements.toFixed(1)}%`;
    }
    case "ApprovalRequested":
      return `approval needed: ${(ev as any).summary ?? ""}`;
    case "ApprovalGranted":
      return `approved by ${(ev as any).approvedBy}`;
    default:
      return "";
  }
}
