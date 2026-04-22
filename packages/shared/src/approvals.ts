import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { approvalFile, ApprovalTokenSchema, type ApprovalToken } from "./artifacts.js";
import type { Phase } from "./phases.js";

export async function writeApproval(
  repoRoot: string,
  phase: Phase,
  opts: { approvedBy?: string; note?: string } = {},
): Promise<void> {
  const token: ApprovalToken = ApprovalTokenSchema.parse({
    phase,
    approvedAt: new Date().toISOString(),
    approvedBy: opts.approvedBy ?? "human",
    note: opts.note,
  });
  const file = approvalFile(repoRoot, phase);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(token, null, 2), "utf8");
}

export function isApproved(repoRoot: string, phase: Phase): boolean {
  return fs.existsSync(approvalFile(repoRoot, phase));
}

export async function readApproval(
  repoRoot: string,
  phase: Phase,
): Promise<ApprovalToken | null> {
  try {
    const contents = await fsp.readFile(approvalFile(repoRoot, phase), "utf8");
    return ApprovalTokenSchema.parse(JSON.parse(contents));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function clearApproval(repoRoot: string, phase: Phase): Promise<void> {
  try {
    await fsp.unlink(approvalFile(repoRoot, phase));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function waitForApproval(
  repoRoot: string,
  phase: Phase,
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<ApprovalToken> {
  const pollMs = opts.pollMs ?? 1000;
  const deadline = opts.timeoutMs ? Date.now() + opts.timeoutMs : Infinity;
  let lastLog = Date.now();
  while (Date.now() < deadline) {
    const token = await readApproval(repoRoot, phase);
    if (token) return token;
    if (Date.now() - lastLog >= 30_000) {
      console.log(`[waitForApproval] still waiting for "${phase}" approval…`);
      lastLog = Date.now();
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`Timed out waiting for approval of phase "${phase}"`);
}
