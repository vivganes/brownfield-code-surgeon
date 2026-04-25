import { Suspense, lazy } from "react";
import { useSurgeryStream } from "./useSurgeryStream";
import { RunControls } from "./components/RunControls";
import type { Phase } from "./types";

const TheatreScene = lazy(() =>
  import("./theatre/TheatreScene").then((m) => ({ default: m.TheatreScene })),
);

export function App(): JSX.Element {
  const { connected, vitals, events } = useSurgeryStream();

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
          <span>run: {vitals?.runId ?? "—"}</span>
          <span>engine: {vitals?.engine ?? "—"}</span>
          <span className={`connection ${connected ? "live" : ""}`}>
            <span className="dot" /> {connected ? "live" : "offline"}
          </span>
        </div>
      </header>
      <div
        style={{
          position: "fixed",
          inset: 0,
          top: 48,
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
    </div>
  );
}
