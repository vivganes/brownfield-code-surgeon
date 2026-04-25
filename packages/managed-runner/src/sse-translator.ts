import type { SurgeryEvent } from "@brownfield-surgeon/shared";

/**
 * Subset of the BetaManagedAgentsSessionEvent union that we care about.
 * Re-declared here so the translator's tests don't need the live SDK installed.
 */
export type ManagedEvent =
  | {
      type: "agent.tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      processed_at: string;
    }
  | {
      type: "agent.mcp_tool_use";
      id: string;
      name: string;
      mcp_server_name: string;
      input: Record<string, unknown>;
      processed_at: string;
    }
  | { type: "agent.tool_result"; id: string; processed_at: string; is_error?: boolean | null }
  | { type: "agent.message"; id: string; processed_at: string; content?: unknown }
  | { type: "agent.thinking"; id: string; processed_at: string }
  | { type: "agent.thread_context_compacted"; id: string; processed_at: string }
  | {
      type: "session.status_running";
      id: string;
      processed_at: string;
    }
  | {
      type: "session.status_idle";
      id: string;
      processed_at: string;
      stop_reason: { type: "end_turn" | "requires_action" | "retries_exhausted" };
    }
  | { type: "session.status_terminated"; id: string; processed_at: string }
  | {
      type: "session.error";
      id: string;
      processed_at: string;
      error: { message: string };
    }
  | { type: "session.deleted"; id: string; processed_at: string }
  // Catch-all for events we don't translate; runner should ignore.
  | { type: string; id: string; processed_at: string; [k: string]: unknown };

export interface TranslateContext {
  runId: string;
  phase: "finish";
  /** Optional starting sequence number (for tests / resume). */
  baseSeq?: number;
}

export interface ArtifactWrite {
  /** Repo-relative path under plan/ or .surgery/. */
  path: string;
  kind: "write" | "edit";
  /** For "write": the full new file content. */
  content?: string;
  /** For "edit": the old/new strings as supplied by the SDK edit tool. */
  oldString?: string;
  newString?: string;
}

export type StreamControl =
  | { kind: "continue" }
  | { kind: "completed" }
  | { kind: "failed"; reason: string }
  | { kind: "aborted"; reason: string };

export interface TranslateResult {
  surgeryEvents: SurgeryEvent[];
  artifactWrites: ArtifactWrite[];
  control: StreamControl;
}

/**
 * Translates a single Managed-Agents session event into:
 *   - zero or more SurgeryEvents for our local events.jsonl
 *   - zero or more artifact writes targeted at plan/ or .surgery/ paths
 *   - a control signal telling the runner whether to continue, complete, or stop
 *
 * Pure function. No I/O. The caller decides what to do with the outputs.
 */
export function translateEvent(
  event: ManagedEvent,
  ctx: TranslateContext,
): TranslateResult {
  const base = {
    timestamp: event.processed_at,
    phase: ctx.phase,
    engine: "managed" as const,
    runId: ctx.runId,
  };

  switch (event.type) {
    case "session.status_running":
      return {
        surgeryEvents: [{ ...base, type: "PhaseStart", request: undefined }],
        artifactWrites: [],
        control: { kind: "continue" },
      };

    case "session.status_idle": {
      const ev = event as Extract<ManagedEvent, { type: "session.status_idle" }>;
      if (ev.stop_reason.type === "end_turn") {
        return {
          surgeryEvents: [
            { ...base, type: "PhaseEnd", outcome: "completed", durationMs: 0 },
          ],
          artifactWrites: [],
          control: { kind: "completed" },
        };
      }
      if (ev.stop_reason.type === "retries_exhausted") {
        return {
          surgeryEvents: [
            {
              ...base,
              type: "PhaseEnd",
              outcome: "failed",
              durationMs: 0,
              errorMessage: "retries_exhausted",
            },
          ],
          artifactWrites: [],
          control: { kind: "failed", reason: "retries_exhausted" },
        };
      }
      // requires_action — agent is waiting on tool confirmation; we configured
      // always_allow on built-in tools so this should be rare. Continue.
      return { surgeryEvents: [], artifactWrites: [], control: { kind: "continue" } };
    }

    case "session.status_terminated":
      return {
        surgeryEvents: [
          { ...base, type: "PhaseEnd", outcome: "aborted", durationMs: 0 },
        ],
        artifactWrites: [],
        control: { kind: "aborted", reason: "session terminated" },
      };

    case "session.error": {
      const ev = event as Extract<ManagedEvent, { type: "session.error" }>;
      return {
        surgeryEvents: [
          {
            ...base,
            type: "PhaseEnd",
            outcome: "failed",
            durationMs: 0,
            errorMessage: ev.error.message,
          },
        ],
        artifactWrites: [],
        control: { kind: "failed", reason: ev.error.message },
      };
    }

    case "session.deleted":
      return {
        surgeryEvents: [],
        artifactWrites: [],
        control: { kind: "aborted", reason: "session deleted" },
      };

    case "agent.tool_use": {
      const ev = event as Extract<ManagedEvent, { type: "agent.tool_use" }>;
      const writes = extractArtifactWrites(ev.name, ev.input);
      const surgeryEvents: SurgeryEvent[] = [
        {
          ...base,
          type: "ToolUse",
          tool: ev.name,
          summary: summarizeToolUse(ev.name, ev.input),
          blocked: false,
        },
      ];
      return { surgeryEvents, artifactWrites: writes, control: { kind: "continue" } };
    }

    case "agent.mcp_tool_use": {
      const ev = event as Extract<ManagedEvent, { type: "agent.mcp_tool_use" }>;
      return {
        surgeryEvents: [
          {
            ...base,
            type: "ToolUse",
            tool: `mcp:${ev.mcp_server_name}:${ev.name}`,
            summary: summarizeToolUse(ev.name, ev.input),
            blocked: false,
          },
        ],
        artifactWrites: [],
        control: { kind: "continue" },
      };
    }

    // Events we deliberately drop on the floor (the live console can show them
    // separately, but they're not meaningful entries in events.jsonl).
    case "agent.tool_result":
    case "agent.message":
    case "agent.thinking":
    case "agent.thread_context_compacted":
    default:
      return { surgeryEvents: [], artifactWrites: [], control: { kind: "continue" } };
  }
}

const SCAFFOLD_PREFIXES = ["plan/", ".surgery/"];
const WORKSPACE_PREFIX = "/workspace/repo/";

/**
 * Pulls (file_path, content)/(file_path, old_string, new_string) out of the
 * SDK tool input and returns them only if the path is under plan/ or .surgery/.
 * Anything outside those scaffolding directories is ignored — the cloud agent
 * shouldn't be reaching for files we can't see locally.
 */
export function extractArtifactWrites(
  toolName: string,
  input: Record<string, unknown>,
): ArtifactWrite[] {
  if (toolName !== "write" && toolName !== "edit") return [];
  const rawPath = pickString(input, ["path", "file_path"]);
  if (!rawPath) return [];
  const normalized = normalizeScaffoldPath(rawPath);
  if (!normalized) return [];

  if (toolName === "write") {
    const content = pickString(input, ["content", "text"]);
    if (content === undefined) return [];
    return [{ path: normalized, kind: "write", content }];
  }

  // edit
  const oldString = pickString(input, ["old_string", "oldString"]);
  const newString = pickString(input, ["new_string", "newString"]);
  if (oldString === undefined || newString === undefined) return [];
  return [{ path: normalized, kind: "edit", oldString, newString }];
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return undefined;
}

/**
 * Returns the input path normalized to a repo-relative form, or undefined if
 * the path is outside plan/ and .surgery/.
 */
export function normalizeScaffoldPath(raw: string): string | undefined {
  let p = raw.replace(/\\/g, "/");
  if (p.startsWith(WORKSPACE_PREFIX)) p = p.slice(WORKSPACE_PREFIX.length);
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) return undefined; // absolute, not under workspace — skip
  if (p.includes("..")) return undefined;
  for (const prefix of SCAFFOLD_PREFIXES) {
    if (p.startsWith(prefix)) return p;
  }
  return undefined;
}

function summarizeToolUse(name: string, input: Record<string, unknown>): string {
  const p = pickString(input, ["path", "file_path"]);
  if (p) return `${name} ${p}`;
  return name;
}
