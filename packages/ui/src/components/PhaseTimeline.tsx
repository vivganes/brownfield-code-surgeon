import { PHASES, type Phase, type SurgeryEvent, type Vitals } from "../types";

export function PhaseTimeline({
  vitals,
  events,
}: {
  vitals: Vitals | null;
  events: SurgeryEvent[];
}): JSX.Element {
  if (!vitals) {
    return <p className="empty">Waiting for first phase to start…</p>;
  }
  return (
    <div>
      {PHASES.map((phase) => {
        const status = vitals.phaseStatus[phase];
        const awaiting = status === "awaiting-approval";
        return (
          <div key={phase} className="phase-row">
            <div>
              <span className="name">{phase}</span>
              <span style={{ color: "var(--muted)", marginLeft: 10, fontSize: 11 }}>
                {phaseEventCount(events, phase)} events
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`status ${status}`}>{status}</span>
              {awaiting && <ApproveButton phase={phase} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function phaseEventCount(events: SurgeryEvent[], phase: Phase): number {
  return events.filter((e) => e.phase === phase).length;
}

function ApproveButton({ phase }: { phase: Phase }): JSX.Element {
  const onClick = async () => {
    try {
      const res = await fetch(`/api/approvals/${phase}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvedBy: "ui", note: "approved from UI" }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[approve] failed:", body);
      }
    } catch (err) {
      console.error("[approve] error:", err);
    }
  };
  return <button onClick={onClick}>Approve incision</button>;
}
