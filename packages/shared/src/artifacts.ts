import path from "node:path";
import { PhaseSchema, type Phase } from "./phases.js";
import { z } from "zod";

export const ARTIFACT_PATHS = {
  plan: "plan/plan.md",
  seams: "plan/seams-and-dependencies.md",
  approvalsDir: "plan/.approvals",
  surgeryDir: ".surgery",
  events: ".surgery/events.jsonl",
  vitals: ".surgery/vitals.json",
  designDocsDir: "docs",
} as const;

export function approvalFile(repoRoot: string, phase: Phase): string {
  return path.join(repoRoot, ARTIFACT_PATHS.approvalsDir, `${phase}.ok`);
}

export function eventsFile(repoRoot: string): string {
  return path.join(repoRoot, ARTIFACT_PATHS.events);
}

export function vitalsFile(repoRoot: string): string {
  return path.join(repoRoot, ARTIFACT_PATHS.vitals);
}

export function planFile(repoRoot: string): string {
  return path.join(repoRoot, ARTIFACT_PATHS.plan);
}

export function seamsFile(repoRoot: string): string {
  return path.join(repoRoot, ARTIFACT_PATHS.seams);
}

export const ApprovalTokenSchema = z.object({
  phase: PhaseSchema,
  approvedAt: z.string().datetime(),
  approvedBy: z.string().default("human"),
  note: z.string().optional(),
});
export type ApprovalToken = z.infer<typeof ApprovalTokenSchema>;
