import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CachedAgent {
  agentId: string;
  hash: string;
  model: string;
  createdAt: string;
}

export interface AgentCache {
  // keyed by hash so we can support multiple parallel agents (different model + prompt combos)
  agents: Record<string, CachedAgent>;
}

export function cacheDir(): string {
  return path.join(os.homedir(), ".config", "brownfield-surgeon");
}

export function cachePath(): string {
  return path.join(cacheDir(), "managed.json");
}

export function readCache(): AgentCache {
  try {
    const body = fs.readFileSync(cachePath(), "utf8");
    const parsed = JSON.parse(body) as Partial<AgentCache>;
    return { agents: parsed.agents ?? {} };
  } catch {
    return { agents: {} };
  }
}

export function writeCache(cache: AgentCache): void {
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf8");
}

/**
 * Stable identity for an agent definition. We hash (model + system-prompt body)
 * so that any prompt update or model swap forces a fresh `agents.create`.
 */
export function agentHash(args: { model: string; system: string }): string {
  const h = crypto.createHash("sha256");
  h.update(args.model);
  h.update("\n--\n");
  h.update(args.system);
  return h.digest("hex").slice(0, 16);
}

export type CreateAgentFn = (args: {
  model: string;
  name: string;
  system: string;
}) => Promise<{ id: string }>;

/**
 * Returns the cached agent ID for (model, system) or creates a new one via
 * `createAgent` and caches the result.
 */
export async function resolveAgentId(args: {
  model: string;
  system: string;
  name: string;
  createAgent: CreateAgentFn;
}): Promise<{ agentId: string; cached: boolean }> {
  const hash = agentHash({ model: args.model, system: args.system });
  const cache = readCache();
  const hit = cache.agents[hash];
  if (hit) return { agentId: hit.agentId, cached: true };

  const created = await args.createAgent({
    model: args.model,
    name: args.name,
    system: args.system,
  });
  cache.agents[hash] = {
    agentId: created.id,
    hash,
    model: args.model,
    createdAt: new Date().toISOString(),
  };
  writeCache(cache);
  return { agentId: created.id, cached: false };
}
