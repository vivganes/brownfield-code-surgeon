import { describe, it, expect } from "vitest";
import { SurgeryEventSchema, type SurgeryEvent } from "./events.js";

const base = {
  timestamp: "2026-04-22T09:00:00.000Z",
  phase: "cover" as const,
  engine: "sdk" as const,
  runId: "run-1",
};

describe("SurgeryEventSchema", () => {
  it("accepts a well-formed PhaseStart", () => {
    const evt: SurgeryEvent = { ...base, type: "PhaseStart", request: "add X" };
    expect(SurgeryEventSchema.parse(evt)).toEqual(evt);
  });

  it("accepts a well-formed PhaseEnd", () => {
    const evt: SurgeryEvent = {
      ...base,
      type: "PhaseEnd",
      outcome: "completed",
      durationMs: 1234,
    };
    expect(SurgeryEventSchema.parse(evt)).toEqual(evt);
  });

  it("accepts ToolUse with blocked=true and a reason", () => {
    const evt: SurgeryEvent = {
      ...base,
      type: "ToolUse",
      tool: "Edit",
      blocked: true,
      reason: "plan phase is read-only",
    };
    expect(SurgeryEventSchema.parse(evt)).toEqual(evt);
  });

  it("defaults ToolUse.blocked to false when omitted", () => {
    const parsed = SurgeryEventSchema.parse({
      ...base,
      type: "ToolUse",
      tool: "Read",
    });
    expect(parsed).toMatchObject({ type: "ToolUse", blocked: false });
  });

  it("accepts CoverageDelta with only statements", () => {
    const evt: SurgeryEvent = {
      ...base,
      type: "CoverageDelta",
      before: { statements: 0.85 },
      after: { statements: 16.78 },
    };
    expect(SurgeryEventSchema.parse(evt)).toEqual(evt);
  });

  it("rejects events with an unknown type", () => {
    expect(() =>
      SurgeryEventSchema.parse({ ...base, type: "Mystery" }),
    ).toThrow();
  });

  it("rejects events with an unknown phase", () => {
    expect(() =>
      SurgeryEventSchema.parse({ ...base, phase: "deploy", type: "PhaseStart" }),
    ).toThrow();
  });

  it("rejects events missing runId", () => {
    const { runId: _drop, ...rest } = base;
    void _drop;
    expect(() =>
      SurgeryEventSchema.parse({ ...rest, type: "PhaseStart" }),
    ).toThrow();
  });

  it("rejects events with empty runId", () => {
    expect(() =>
      SurgeryEventSchema.parse({ ...base, runId: "", type: "PhaseStart" }),
    ).toThrow();
  });

  it("rejects non-ISO timestamps", () => {
    expect(() =>
      SurgeryEventSchema.parse({
        ...base,
        timestamp: "yesterday",
        type: "PhaseStart",
      }),
    ).toThrow();
  });

  it("rejects PhaseEnd with a negative durationMs", () => {
    expect(() =>
      SurgeryEventSchema.parse({
        ...base,
        type: "PhaseEnd",
        outcome: "completed",
        durationMs: -1,
      }),
    ).toThrow();
  });

  it("rejects PhaseEnd with an unknown outcome", () => {
    expect(() =>
      SurgeryEventSchema.parse({
        ...base,
        type: "PhaseEnd",
        outcome: "partial",
        durationMs: 1,
      }),
    ).toThrow();
  });

  it("rejects ArtifactWritten with an unknown kind", () => {
    expect(() =>
      SurgeryEventSchema.parse({
        ...base,
        type: "ArtifactWritten",
        path: "plan/plan.md",
        bytes: 100,
        kind: "manifesto",
      }),
    ).toThrow();
  });
});
