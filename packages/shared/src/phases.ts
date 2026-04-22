import { z } from "zod";

export const PHASES = [
  "plan",
  "map",
  "break",
  "cover",
  "implement",
  "refactor",
  "finish",
] as const;

export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

export const PHASE_ORDER: Record<Phase, number> = {
  plan: 1,
  map: 2,
  break: 3,
  cover: 4,
  implement: 5,
  refactor: 6,
  finish: 7,
};

export function nextPhase(current: Phase): Phase | null {
  const idx = PHASES.indexOf(current);
  if (idx === -1 || idx === PHASES.length - 1) return null;
  return PHASES[idx + 1] ?? null;
}
