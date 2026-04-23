import { useMemo } from "react";
import type { Phase, SurgeryEvent, Vitals } from "../types";
import { PHASES } from "../types";

export type GlyphState =
  | "dormant"
  | "active"
  | "awaiting-approval"
  | "complete"
  | "failed";

export type TheatreState = {
  glyphs: Record<Phase, GlyphState>;
  activePhase: Phase | null;
  lastArtifactTs: number;
  lastTestFailTs: number;
  finishedTs: number;
};

const EMPTY: Record<Phase, GlyphState> = PHASES.reduce(
  (acc, p) => ({ ...acc, [p]: "dormant" as GlyphState }),
  {} as Record<Phase, GlyphState>,
);

export function deriveTheatreState(
  vitals: Vitals | null,
  events: SurgeryEvent[],
): TheatreState {
  const glyphs: Record<Phase, GlyphState> = { ...EMPTY };
  if (vitals) {
    for (const p of PHASES) {
      const s = vitals.phaseStatus[p];
      glyphs[p] =
        s === "running"
          ? "active"
          : s === "awaiting-approval"
            ? "awaiting-approval"
            : s === "completed"
              ? "complete"
              : s === "failed"
                ? "failed"
                : "dormant";
    }
  }

  let lastArtifactTs = 0;
  let lastTestFailTs = 0;
  let finishedTs = 0;
  for (const ev of events) {
    const t = Date.parse(ev.timestamp);
    if (Number.isNaN(t)) continue;
    if (ev.type === "ArtifactWritten" && t > lastArtifactTs) lastArtifactTs = t;
    if (ev.type === "TestRun") {
      const failed = (ev as { failed?: number }).failed ?? 0;
      if (failed > 0 && t > lastTestFailTs) lastTestFailTs = t;
    }
    if (
      ev.type === "PhaseEnd" &&
      ev.phase === "finish" &&
      t > finishedTs
    ) {
      finishedTs = t;
    }
  }

  return {
    glyphs,
    activePhase: vitals?.currentPhase ?? null,
    lastArtifactTs,
    lastTestFailTs,
    finishedTs,
  };
}

export function useTheatreState(
  vitals: Vitals | null,
  events: SurgeryEvent[],
): TheatreState {
  return useMemo(() => deriveTheatreState(vitals, events), [vitals, events]);
}
