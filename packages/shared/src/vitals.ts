import { z } from "zod";
import { PhaseSchema } from "./phases.js";

export const PhaseStatusSchema = z.enum([
  "pending",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "skipped",
]);
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

export const CoverageSnapshotSchema = z.object({
  statements: z.number(),
  branches: z.number().optional(),
  functions: z.number().optional(),
  lines: z.number().optional(),
});
export type CoverageSnapshot = z.infer<typeof CoverageSnapshotSchema>;

export const VitalsSchema = z.object({
  runId: z.string(),
  repoRoot: z.string(),
  engine: z.enum(["plugin", "sdk", "managed"]),
  startedAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  currentPhase: PhaseSchema.nullable(),
  phaseStatus: z.object({
    plan: PhaseStatusSchema,
    map: PhaseStatusSchema,
    break: PhaseStatusSchema,
    cover: PhaseStatusSchema,
    implement: PhaseStatusSchema,
    refactor: PhaseStatusSchema,
    finish: PhaseStatusSchema,
  }),
  tests: z.object({
    total: z.number().int().nonnegative(),
    passing: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative().default(0),
  }),
  coverage: z.object({
    baseline: CoverageSnapshotSchema.nullable(),
    current: CoverageSnapshotSchema.nullable(),
  }),
  seamsFound: z.number().int().nonnegative().default(0),
  dependenciesBroken: z.number().int().nonnegative().default(0),
  artifacts: z.array(z.string()).default([]),
  baselineRef: z.string().nullable().default(null),
  commitPerPhase: z.boolean().default(true),
});
export type Vitals = z.infer<typeof VitalsSchema>;

export function emptyVitals(args: {
  runId: string;
  repoRoot: string;
  engine: "plugin" | "sdk" | "managed";
}): Vitals {
  const now = new Date().toISOString();
  return {
    runId: args.runId,
    repoRoot: args.repoRoot,
    engine: args.engine,
    startedAt: now,
    lastUpdated: now,
    currentPhase: null,
    phaseStatus: {
      plan: "pending",
      map: "pending",
      break: "pending",
      cover: "pending",
      implement: "pending",
      refactor: "pending",
      finish: "pending",
    },
    tests: { total: 0, passing: 0, failing: 0, skipped: 0 },
    coverage: { baseline: null, current: null },
    seamsFound: 0,
    dependenciesBroken: 0,
    artifacts: [],
    baselineRef: null,
    commitPerPhase: true,
  };
}
