import {
  emptyVitals,
  readVitals,
  writeVitals,
  type Phase,
  type PhaseStatus,
  type Vitals,
} from "@brownfield-surgeon/shared";

export async function loadOrInitVitals(
  repoRoot: string,
  runId: string,
): Promise<Vitals> {
  const existing = await readVitals(repoRoot);
  if (existing) return existing;
  const fresh = emptyVitals({ runId, repoRoot, engine: "sdk" });
  await writeVitals(repoRoot, fresh);
  return fresh;
}

export async function setPhaseStatus(
  repoRoot: string,
  phase: Phase,
  status: PhaseStatus,
): Promise<Vitals> {
  const vitals = (await readVitals(repoRoot)) ?? emptyVitals({
    runId: `run-${Date.now().toString(36)}`,
    repoRoot,
    engine: "sdk",
  });
  vitals.phaseStatus[phase] = status;
  vitals.currentPhase = status === "running" ? phase : vitals.currentPhase;
  if (status === "completed" || status === "failed" || status === "skipped") {
    if (vitals.currentPhase === phase) vitals.currentPhase = null;
  }
  vitals.lastUpdated = new Date().toISOString();
  await writeVitals(repoRoot, vitals);
  return vitals;
}
