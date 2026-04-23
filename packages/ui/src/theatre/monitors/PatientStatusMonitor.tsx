import { useEffect, useRef } from "react";
import type { SurgeryEvent, Vitals } from "../../types";

export function PatientStatusMonitor({
  vitals,
  events,
}: {
  vitals: Vitals | null;
  events: SurgeryEvent[];
}): JSX.Element {
  const cov = vitals?.coverage;
  const covNow = cov?.current ? cov.current.statements.toFixed(1) : "--.-";
  const covBase = cov?.baseline?.statements;
  const covDelta =
    cov?.baseline && cov?.current
      ? cov.current.statements - cov.baseline.statements
      : null;
  const tests = vitals?.tests;
  const testsBad = tests ? tests.failing > 0 : false;
  const phase = vitals?.currentPhase ?? "idle";

  return (
    <div style={wrap}>
      <div style={headerRow}>
        <StatusBlock label="PHASE" value={phase.toUpperCase()} color="#5eead4" />
        <StatusBlock
          label="TESTS"
          value={tests ? `${tests.passing}/${tests.total}` : "--/--"}
          color={testsBad ? "#ef4444" : "#22c55e"}
          sub={testsBad ? `${tests?.failing} FAILING` : "ALL GREEN"}
        />
        <StatusBlock
          label="COVERAGE"
          value={`${covNow}%`}
          color="#a78bfa"
          sub={
            covDelta != null
              ? `Δ ${covDelta >= 0 ? "+" : ""}${covDelta.toFixed(1)}%`
              : covBase != null
                ? `base ${covBase.toFixed(1)}%`
                : "NO BASELINE"
          }
        />
      </div>

      <EcgTrace events={events} />

      <div style={footRow}>
        <MiniStat label="SEAMS" value={String(vitals?.seamsFound ?? 0)} />
        <MiniStat label="BROKEN DEPS" value={String(vitals?.dependenciesBroken ?? 0)} />
        <MiniStat label="ARTIFACTS" value={String(vitals?.artifacts.length ?? 0)} />
        <MiniStat label="EVENTS" value={String(events.length)} />
      </div>
    </div>
  );
}

function StatusBlock({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}): JSX.Element {
  return (
    <div
      style={{
        background: "#070b1c",
        border: "1px solid #1b2540",
        borderRadius: 8,
        padding: "12px 14px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={bigLabel}>{label}</div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          fontFamily: "ui-monospace, monospace",
          color,
          lineHeight: 1.0,
          marginTop: 6,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "#8892b8",
            marginTop: 6,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div
      style={{
        background: "#070b1c",
        border: "1px solid #1b2540",
        borderRadius: 6,
        padding: "8px 12px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ ...bigLabel, fontSize: 9 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "#e6ecff",
          fontFamily: "ui-monospace, monospace",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// QRS pulse — offsets in px from baseline (negative = up on canvas).
// P-wave bump, flat PR segment, Q dip, tall R spike, S dip, flat ST, T-wave.
const PULSE: number[] = [
  -2, -4, -5, -3, 0,
  0, 0,
  4, 8,
  -46, -52, -40,
  10, 12, 5,
  0, 0,
  -3, -6, -8, -6, -3, 0,
];

function EcgTrace({ events }: { events: SurgeryEvent[] }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const eventCountRef = useRef(events.length);

  useEffect(() => {
    eventCountRef.current = events.length;
  }, [events.length]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const baseline = h / 2;
    let running = true;
    let x = 0;
    let prevX = 0;
    let prevY = baseline;
    let lastSeen = eventCountRef.current;
    const pending: number[] = [];

    const draw = (): void => {
      if (!running) return;

      // Fade background.
      ctx.fillStyle = "rgba(5,7,16,0.10)";
      ctx.fillRect(0, 0, w, h);

      // Grid.
      ctx.strokeStyle = "rgba(94,234,212,0.08)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 40) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 40) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      // Enqueue a QRS pulse when a new event arrives.
      const current = eventCountRef.current;
      if (current !== lastSeen) {
        lastSeen = current;
        pending.push(...PULSE);
      }

      // Advance the sweep head.
      const step = 3;
      const nextX = (x + step) % w;

      // y for this frame.
      let y: number;
      if (pending.length > 0) {
        y = baseline + (pending.shift() ?? 0);
      } else {
        y = baseline + Math.sin(nextX * 0.06) * 1.5 + Math.sin(nextX * 0.19) * 1.0;
      }

      // Handle wrap-around: don't connect across the right edge.
      if (nextX < x) {
        prevX = nextX;
        prevY = y;
      }

      ctx.strokeStyle = "#5eead4";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = "#5eead4";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(nextX, y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Wipe cursor just ahead to keep the sweep visual clean.
      ctx.fillStyle = "#05070e";
      ctx.fillRect((nextX + 4) % w, 0, 22, h);

      prevX = nextX;
      prevY = y;
      x = nextX;
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return () => {
      running = false;
    };
  }, []);

  return (
    <div
      style={{
        background: "#05070e",
        border: "1px solid #1b2540",
        borderRadius: 6,
        padding: 10,
      }}
    >
      <div style={{ ...bigLabel, marginBottom: 6 }}>EVENT PULSE</div>
      <canvas
        ref={ref}
        width={900}
        height={120}
        style={{ width: "100%", height: 120, display: "block" }}
      />
    </div>
  );
}

const wrap = {
  padding: 20,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
  fontFamily: "ui-monospace, monospace",
};

const headerRow = {
  display: "flex",
  gap: 10,
};

const footRow = {
  display: "flex",
  gap: 8,
};

const bigLabel = {
  fontSize: 11,
  letterSpacing: "0.2em",
  color: "#64718f",
  fontFamily: "ui-monospace, monospace",
  textTransform: "uppercase" as const,
  fontWeight: 700,
};
