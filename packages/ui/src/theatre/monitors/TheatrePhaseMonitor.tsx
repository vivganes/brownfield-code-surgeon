import { PHASES, type Vitals } from "../../types";

const COLOR: Record<string, string> = {
  pending: "#9aa8cc",
  running: "#5eead4",
  "awaiting-approval": "#f59e0b",
  completed: "#60a5fa",
  failed: "#ef4444",
  skipped: "#9aa8cc",
};

export function TheatrePhaseMonitor({ vitals }: { vitals: Vitals | null }): JSX.Element {
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
        Seven-Phase Protocol
      </div>
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {PHASES.map((p, i) => {
          const status = vitals?.phaseStatus[p] ?? "pending";
          const color = COLOR[status] ?? "#64718f";
          const active = status === "running" || status === "awaiting-approval";
          return (
            <div
              key={p}
              style={{
                display: "grid",
                gridTemplateColumns: "34px 1fr auto",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: active ? "#142046" : "#070b1c",
                border: `1px solid ${active ? color : "#1b2540"}`,
                borderRadius: 6,
                boxShadow: active ? `0 0 16px ${color}40` : "none",
              }}
            >
              <div style={{ color: "#6c7aa0", fontSize: 16, fontWeight: 800 }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#e6ecff",
                }}
              >
                {p}
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  color,
                  textTransform: "uppercase",
                  fontWeight: 800,
                }}
              >
                {status === "awaiting-approval" ? "APPROVE" : status}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
