import { useEffect, useRef } from "react";
import type { SurgeryEvent } from "../../types";
import { getSoundEngine } from "./SoundEngine";

// Each event type gets a distinct tick pitch so the listener feels texture
// without any single sound dominating. Frequencies are kept high + short to
// stay out of the way of ambient hum and speech.
const TICK_FREQ: Record<string, number> = {
  ToolUse: 2600,
  ArtifactWritten: 2000,
  PhaseStart: 3200,
  PhaseEnd: 1800,
  TestRun: 2400,
  CoverageDelta: 2800,
  ApprovalRequested: 3000,
  ApprovalGranted: 3400,
};

export function useEventCues(events: SurgeryEvent[], enabled: boolean): void {
  const lastIndex = useRef(0);
  const approvalsOpen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const engine = getSoundEngine();
    for (let i = lastIndex.current; i < events.length; i++) {
      const ev = events[i];
      if (!ev) continue;

      // Subtle per-event tick, pitched by type.
      engine.tick(TICK_FREQ[ev.type] ?? 2500);

      switch (ev.type) {
        case "PhaseStart":
          engine.phaseStart();
          break;
        case "ArtifactWritten":
          engine.artifactThunk();
          break;
        case "ApprovalRequested":
          approvalsOpen.current.add(ev.phase);
          engine.startApprovalPing();
          break;
        case "ApprovalGranted":
          approvalsOpen.current.delete(ev.phase);
          if (approvalsOpen.current.size === 0) engine.stopApprovalPing();
          engine.approvalConfirm();
          break;
        case "TestRun": {
          const failed = (ev as { failed?: number }).failed ?? 0;
          if (failed > 0) engine.testFailAlarm();
          break;
        }
        case "PhaseEnd":
          if (ev.phase === "finish") {
            engine.meow();
            engine.finishChord();
          }
          break;
      }
    }
    lastIndex.current = events.length;
  }, [events, enabled]);
}
