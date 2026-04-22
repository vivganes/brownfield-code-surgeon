import { describe, it, expect } from "vitest";
import { PHASES, PHASE_ORDER, PhaseSchema, nextPhase } from "./phases.js";

describe("phases", () => {
  it("exposes all seven phases in surgical order", () => {
    expect(PHASES).toEqual([
      "plan",
      "map",
      "break",
      "cover",
      "implement",
      "refactor",
      "finish",
    ]);
  });

  it("PHASE_ORDER is 1..7 matching PHASES", () => {
    PHASES.forEach((p, i) => {
      expect(PHASE_ORDER[p]).toBe(i + 1);
    });
  });

  it("PhaseSchema accepts every known phase", () => {
    for (const p of PHASES) expect(PhaseSchema.parse(p)).toBe(p);
  });

  it("PhaseSchema rejects unknown phases", () => {
    expect(() => PhaseSchema.parse("deploy")).toThrow();
    expect(() => PhaseSchema.parse("")).toThrow();
  });

  it("nextPhase advances through the pipeline", () => {
    expect(nextPhase("plan")).toBe("map");
    expect(nextPhase("map")).toBe("break");
    expect(nextPhase("cover")).toBe("implement");
    expect(nextPhase("refactor")).toBe("finish");
  });

  it("nextPhase returns null after finish", () => {
    expect(nextPhase("finish")).toBeNull();
  });
});
