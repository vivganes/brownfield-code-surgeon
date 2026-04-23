import type { Vitals as VitalsT } from "../types";

export function Vitals({ vitals }: { vitals: VitalsT | null }): JSX.Element {
  if (!vitals) {
    return <p className="empty">Waiting for vitals.json…</p>;
  }
  const cov = vitals.coverage;
  const covDelta =
    cov.baseline && cov.current
      ? (cov.current.statements - cov.baseline.statements).toFixed(1)
      : "—";
  return (
    <div className="vitals">
      <Card label="Current phase" value={vitals.currentPhase ?? "idle"} />
      <Card
        label="Tests"
        value={`${vitals.tests.passing} / ${vitals.tests.total}`}
        subtitle={vitals.tests.failing > 0 ? `${vitals.tests.failing} failing` : "all green"}
      />
      <Card
        label="Coverage"
        value={cov.current ? `${cov.current.statements.toFixed(1)}%` : "—"}
        subtitle={cov.baseline ? `Δ ${covDelta}%` : "no baseline"}
      />
      <Card label="Seams found" value={String(vitals.seamsFound)} />
      <Card label="Dependencies broken" value={String(vitals.dependenciesBroken)} />
      <Card label="Artifacts" value={String(vitals.artifacts.length)} />
    </div>
  );
}

function Card({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}): JSX.Element {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {subtitle && <div className="label" style={{ marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}
