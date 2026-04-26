import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { SurgeryEventSchema, type SurgeryEvent } from "@brownfield-surgeon/shared";

/**
 * Tail a JSONL file, emitting each fully-written line as a parsed SurgeryEvent.
 * Uses a polling loop — robust on Windows, avoids fs.watch quirks with append mode.
 */
export function watchEventsFile(
  filePath: string,
  onEvent: (event: SurgeryEvent) => void,
  opts: { pollMs?: number } = {},
): () => void {
  const pollMs = opts.pollMs ?? 500;
  let position = 0;
  let buffer = "";
  let stopped = false;

  async function poll(): Promise<void> {
    try {
      const stat = await fsp.stat(filePath);
      if (stat.size < position) {
        // File truncated or rotated — restart.
        position = 0;
        buffer = "";
      }
      if (stat.size > position) {
        const stream = fs.createReadStream(filePath, {
          start: position,
          end: stat.size - 1,
          encoding: "utf8",
        });
        for await (const chunk of stream) {
          buffer += chunk as string;
        }
        position = stat.size;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed);
            // Migrate old "unknown" phases to "plan" (pre-fix compatibility)
            if (obj.phase === "unknown") {
              obj.phase = "plan";
            }
            const parsed = SurgeryEventSchema.parse(obj);
            onEvent(parsed);
          } catch (err) {
            console.warn("[tail] skipping invalid event line:", err);
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[tail] error:", err);
      }
    }
  }

  // Make sure directory exists so first create doesn't blow up readers.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const timer = setInterval(() => {
    if (!stopped) void poll();
  }, pollMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
