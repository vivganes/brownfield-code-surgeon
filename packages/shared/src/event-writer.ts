import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { SurgeryEventSchema, type SurgeryEvent, type Engine } from "./events.js";
import { eventsFile, vitalsFile } from "./artifacts.js";
import type { Phase } from "./phases.js";

export async function ensureSurgeryDir(repoRoot: string): Promise<void> {
  await fsp.mkdir(path.join(repoRoot, ".surgery"), { recursive: true });
  await fsp.mkdir(path.join(repoRoot, "plan", ".approvals"), { recursive: true });
}

export async function appendEvent(
  repoRoot: string,
  event: SurgeryEvent,
): Promise<void> {
  const validated = SurgeryEventSchema.parse(event);
  const line = JSON.stringify(validated) + "\n";
  await ensureSurgeryDir(repoRoot);
  await fsp.appendFile(eventsFile(repoRoot), line, "utf8");
}

export function appendEventSync(repoRoot: string, event: SurgeryEvent): void {
  const validated = SurgeryEventSchema.parse(event);
  fs.mkdirSync(path.join(repoRoot, ".surgery"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "plan", ".approvals"), { recursive: true });
  fs.appendFileSync(eventsFile(repoRoot), JSON.stringify(validated) + "\n", "utf8");
}

export async function readEvents(repoRoot: string): Promise<SurgeryEvent[]> {
  const file = eventsFile(repoRoot);
  try {
    const contents = await fsp.readFile(file, "utf8");
    return contents
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => SurgeryEventSchema.parse(JSON.parse(line)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function makeBaseEvent(args: {
  phase: Phase;
  engine: Engine;
  runId: string;
}): { timestamp: string; phase: Phase; engine: Engine; runId: string } {
  return {
    timestamp: new Date().toISOString(),
    phase: args.phase,
    engine: args.engine,
    runId: args.runId,
  };
}

export async function readVitals(repoRoot: string): Promise<unknown> {
  try {
    const contents = await fsp.readFile(vitalsFile(repoRoot), "utf8");
    return JSON.parse(contents);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeVitals(repoRoot: string, vitals: unknown): Promise<void> {
  await ensureSurgeryDir(repoRoot);
  await fsp.writeFile(
    vitalsFile(repoRoot),
    JSON.stringify(vitals, null, 2),
    "utf8",
  );
}
