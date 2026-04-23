export type Phase =
  | "plan"
  | "map"
  | "break"
  | "cover"
  | "implement"
  | "refactor"
  | "finish";

export const PHASES: Phase[] = [
  "plan",
  "map",
  "break",
  "cover",
  "implement",
  "refactor",
  "finish",
];

export type PhaseStatus =
  | "pending"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "skipped";

export type Vitals = {
  runId: string;
  repoRoot: string;
  engine: "plugin" | "sdk" | "managed";
  startedAt: string;
  lastUpdated: string;
  currentPhase: Phase | null;
  phaseStatus: Record<Phase, PhaseStatus>;
  tests: { total: number; passing: number; failing: number; skipped: number };
  coverage: {
    baseline: { statements: number } | null;
    current: { statements: number } | null;
  };
  seamsFound: number;
  dependenciesBroken: number;
  artifacts: string[];
};

export type SurgeryEvent = {
  timestamp: string;
  phase: Phase;
  engine: "plugin" | "sdk" | "managed";
  runId: string;
  type: string;
  [k: string]: unknown;
};
