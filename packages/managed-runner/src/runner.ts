import {
  appendEventDedupedSync,
  type SurgeryEvent,
} from "@brownfield-surgeon/shared";
import { applyArtifactWrite } from "./artifact-sync.js";
import {
  pullScratchOnce,
  startHeartbeat,
  type HeartbeatHandle,
} from "./heartbeat.js";
import {
  translateEvent,
  type ManagedEvent,
  type StreamControl,
} from "./sse-translator.js";

export interface DrainArgs {
  /** Async iterable of session events, e.g. `await client.beta.sessions.events.stream(id)`. */
  stream: AsyncIterable<ManagedEvent>;
  repoRoot: string;
  runId: string;
  scratchBranch: string;
  /** Pull cadence in ms; 0 disables the periodic pull (manual only). */
  heartbeatMs?: number;
  /** Hook for tests + CLI logging. */
  onLog?: (line: string) => void;
}

export interface DrainResult {
  control: StreamControl;
  eventsAppended: number;
  artifactsWritten: number;
  duplicatesSkipped: number;
}

/**
 * Drains a Managed-Agents session event stream:
 *   - dedupes by SDK event id (in-memory + on-disk via appendEventDedupedSync)
 *   - translates each event to local SurgeryEvents and artifact writes
 *   - applies artifact writes under plan/ and .surgery/ to repoRoot
 *   - ticks a heartbeat that fast-forwards the local scratch branch
 *   - exits when control transitions to completed / failed / aborted
 */
export async function drainSessionStream(args: DrainArgs): Promise<DrainResult> {
  const log = args.onLog ?? (() => {});
  const seenIds = new Set<string>();
  let eventsAppended = 0;
  let artifactsWritten = 0;
  let duplicatesSkipped = 0;
  let finalControl: StreamControl = { kind: "continue" };

  let heartbeat: HeartbeatHandle | null = null;
  if (args.heartbeatMs && args.heartbeatMs > 0) {
    heartbeat = startHeartbeat({
      repoRoot: args.repoRoot,
      scratchBranch: args.scratchBranch,
      intervalMs: args.heartbeatMs,
      onTick: (r) => {
        if (r.merged) log(`[heartbeat] pulled ${args.scratchBranch}`);
      },
    });
  }

  try {
    for await (const event of args.stream) {
      if (event.id && seenIds.has(event.id)) {
        duplicatesSkipped += 1;
        continue;
      }
      if (event.id) seenIds.add(event.id);

      const r = translateEvent(event, { runId: args.runId, phase: "finish" });

      for (const se of r.surgeryEvents) {
        const appended = appendSurgeryEvent(args.repoRoot, se, event.id);
        if (appended) eventsAppended += 1;
        else duplicatesSkipped += 1;
      }

      for (const w of r.artifactWrites) {
        const ar = applyArtifactWrite(args.repoRoot, w);
        if (ar.applied) {
          artifactsWritten += 1;
          log(`[artifact] ${w.kind} ${w.path}`);
        } else if (ar.reason) {
          log(`[artifact-skip] ${w.path} (${ar.reason})`);
        }
      }

      if (r.control.kind !== "continue") {
        finalControl = r.control;
        break;
      }
    }

    // Final fast-forward so we definitely have whatever the agent pushed last.
    try {
      const last = pullScratchOnce(args.repoRoot, args.scratchBranch);
      if (last.merged) log(`[heartbeat] final pull merged`);
    } catch (err) {
      log(`[heartbeat] final pull failed: ${String(err)}`);
    }
  } finally {
    heartbeat?.stop();
  }

  return {
    control: finalControl,
    eventsAppended,
    artifactsWritten,
    duplicatesSkipped,
  };
}

function appendSurgeryEvent(
  repoRoot: string,
  event: SurgeryEvent,
  upstreamId?: string,
): boolean {
  // We carry the upstream SDK id into the SurgeryEvent's seq derivation by
  // letting appendEventDedupedSync handle (runId,type,phase,timestamp). The
  // upstream `id` is captured in the in-memory seenIds gate above; the
  // on-disk dedup is the cross-process safety net.
  void upstreamId;
  return appendEventDedupedSync(repoRoot, event);
}
