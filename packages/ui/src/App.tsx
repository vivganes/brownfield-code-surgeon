import { Suspense, lazy, useState } from "react";
import { useSurgeryStream } from "./useSurgeryStream";
import { Vitals } from "./components/Vitals";
import { PhaseTimeline } from "./components/PhaseTimeline";
import { SeamsGraph } from "./components/SeamsGraph";
import { SurgicalLog } from "./components/SurgicalLog";
import { RunControls } from "./components/RunControls";
import { TheatreToggle } from "./theatre/TheatreToggle";
import type { Phase } from "./types";

const TheatreScene = lazy(() =>
  import("./theatre/TheatreScene").then((m) => ({ default: m.TheatreScene })),
);

export function App(): JSX.Element {
  const { connected, vitals, events } = useSurgeryStream();
  const [theatre, setTheatre] = useState(false);

  const approve = async (phase: Phase): Promise<void> => {
    try {
      await fetch(`/api/approvals/${phase}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvedBy: "ui-theatre", note: "approved from theatre" }),
      });
    } catch (err) {
      console.error("[theatre approve] error:", err);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span className="dot">●</span>
          Brownfield Code Surgeon — Operating Theater
        </h1>
        <div className="meta" style={{ gap: 12, alignItems: "center" }}>
          <RunControls />
          <TheatreToggle active={theatre} onToggle={() => setTheatre((t) => !t)} />
          <span>run: {vitals?.runId ?? "—"}</span>
          <span>engine: {vitals?.engine ?? "—"}</span>
          <span className={`connection ${connected ? "live" : ""}`}>
            <span className="dot" /> {connected ? "live" : "offline"}
          </span>
        </div>
      </header>
      <main className="grid" style={theatre ? { visibility: "hidden" } : undefined}>
        <section className="panel" style={{ gridColumn: "1 / 2", gridRow: "1 / 2" }}>
          <h2>
            Vitals
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {vitals ? new Date(vitals.lastUpdated).toLocaleTimeString() : ""}
            </span>
          </h2>
          <div className="body">
            <Vitals vitals={vitals} />
          </div>
        </section>
        <section className="panel" style={{ gridColumn: "2 / 3", gridRow: "1 / 2" }}>
          <h2>Phase Timeline</h2>
          <div className="body">
            <PhaseTimeline vitals={vitals} events={events} />
          </div>
        </section>
        <section className="panel" style={{ gridColumn: "1 / 2", gridRow: "2 / 3" }}>
          <h2>Seams &amp; Dependencies</h2>
          <div className="body" style={{ padding: 0 }}>
            <SeamsGraph />
          </div>
        </section>
        <section className="panel" style={{ gridColumn: "2 / 3", gridRow: "2 / 3" }}>
          <h2>Surgical Log</h2>
          <div className="body">
            <SurgicalLog events={events} />
          </div>
        </section>
      </main>
      {theatre && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            top: 48,
            zIndex: 100,
            background: "#05070e",
          }}
        >
          <Suspense
            fallback={
              <div
                style={{
                  color: "#8892b8",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  padding: 20,
                }}
              >
                loading theatre…
              </div>
            }
          >
            <TheatreScene
              vitals={vitals}
              events={events}
              engine={vitals?.engine ?? "sdk"}
              onApprove={approve}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
