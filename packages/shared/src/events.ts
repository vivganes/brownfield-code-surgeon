import { z } from "zod";
import { PhaseSchema } from "./phases.js";

export const EngineSchema = z.enum(["plugin", "sdk", "managed"]);
export type Engine = z.infer<typeof EngineSchema>;

const BaseEvent = z.object({
  timestamp: z.string().datetime(),
  phase: PhaseSchema,
  engine: EngineSchema,
  runId: z.string().min(1),
});

export const PhaseStartEvent = BaseEvent.extend({
  type: z.literal("PhaseStart"),
  request: z.string().optional(),
});

export const PhaseEndEvent = BaseEvent.extend({
  type: z.literal("PhaseEnd"),
  outcome: z.enum(["completed", "failed", "aborted"]),
  durationMs: z.number().int().nonnegative(),
  errorMessage: z.string().optional(),
});

export const ToolUseEvent = BaseEvent.extend({
  type: z.literal("ToolUse"),
  tool: z.string().min(1),
  summary: z.string().optional(),
  blocked: z.boolean().default(false),
  reason: z.string().optional(),
});

export const ArtifactWrittenEvent = BaseEvent.extend({
  type: z.literal("ArtifactWritten"),
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  kind: z.enum(["plan", "seams", "test", "source", "doc", "approval", "other"]),
});

export const TestRunEvent = BaseEvent.extend({
  type: z.literal("TestRun"),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const CoverageDeltaEvent = BaseEvent.extend({
  type: z.literal("CoverageDelta"),
  before: z.object({
    statements: z.number(),
    branches: z.number().optional(),
    functions: z.number().optional(),
    lines: z.number().optional(),
  }),
  after: z.object({
    statements: z.number(),
    branches: z.number().optional(),
    functions: z.number().optional(),
    lines: z.number().optional(),
  }),
});

export const ApprovalRequestedEvent = BaseEvent.extend({
  type: z.literal("ApprovalRequested"),
  artifacts: z.array(z.string()).default([]),
  summary: z.string().optional(),
});

export const ApprovalGrantedEvent = BaseEvent.extend({
  type: z.literal("ApprovalGranted"),
  approvedBy: z.string().default("human"),
  note: z.string().optional(),
});

export const SurgeryEventSchema = z.discriminatedUnion("type", [
  PhaseStartEvent,
  PhaseEndEvent,
  ToolUseEvent,
  ArtifactWrittenEvent,
  TestRunEvent,
  CoverageDeltaEvent,
  ApprovalRequestedEvent,
  ApprovalGrantedEvent,
]);

export type SurgeryEvent = z.infer<typeof SurgeryEventSchema>;
export type PhaseStart = z.infer<typeof PhaseStartEvent>;
export type PhaseEnd = z.infer<typeof PhaseEndEvent>;
export type ToolUse = z.infer<typeof ToolUseEvent>;
export type ArtifactWritten = z.infer<typeof ArtifactWrittenEvent>;
export type TestRun = z.infer<typeof TestRunEvent>;
export type CoverageDelta = z.infer<typeof CoverageDeltaEvent>;
export type ApprovalRequested = z.infer<typeof ApprovalRequestedEvent>;
export type ApprovalGranted = z.infer<typeof ApprovalGrantedEvent>;
