import fs from "node:fs";
import path from "node:path";
import type { ArtifactWrite } from "./sse-translator.js";

export interface ApplyResult {
  applied: boolean;
  reason?: "applied" | "edit-no-local-file" | "edit-no-match" | "skipped";
}

/**
 * Apply a single ArtifactWrite to the local repo. The path has already been
 * normalized + restricted to plan/ or .surgery/ by the translator, so this
 * function trusts its input.
 */
export function applyArtifactWrite(
  repoRoot: string,
  write: ArtifactWrite,
): ApplyResult {
  const abs = path.join(repoRoot, write.path);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  if (write.kind === "write") {
    if (write.content === undefined) return { applied: false, reason: "skipped" };
    fs.writeFileSync(abs, write.content, "utf8");
    return { applied: true, reason: "applied" };
  }

  // edit
  if (write.oldString === undefined || write.newString === undefined) {
    return { applied: false, reason: "skipped" };
  }
  let body: string;
  try {
    body = fs.readFileSync(abs, "utf8");
  } catch {
    return { applied: false, reason: "edit-no-local-file" };
  }
  if (!body.includes(write.oldString)) {
    return { applied: false, reason: "edit-no-match" };
  }
  // First-occurrence replacement, matching the SDK edit tool's semantics.
  const next = body.replace(write.oldString, write.newString);
  fs.writeFileSync(abs, next, "utf8");
  return { applied: true, reason: "applied" };
}
