import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Secrets {
  githubToken?: string;
  agentEnvId?: string;
}

export function secretsDir(): string {
  return path.join(os.homedir(), ".config", "brownfield-surgeon");
}

export function secretsPath(): string {
  return path.join(secretsDir(), "secrets.json");
}

export function readSecrets(): Secrets {
  try {
    const body = fs.readFileSync(secretsPath(), "utf8");
    const parsed = JSON.parse(body) as Partial<Secrets>;
    return {
      githubToken: typeof parsed.githubToken === "string" ? parsed.githubToken : undefined,
      agentEnvId: typeof parsed.agentEnvId === "string" ? parsed.agentEnvId : undefined,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    return {};
  }
}

export function writeSecrets(patch: Partial<Secrets>): void {
  const dir = secretsDir();
  fs.mkdirSync(dir, { recursive: true });
  const current = readSecrets();
  const merged: Secrets = { ...current, ...patch };
  // strip undefined keys so the file stays clean
  for (const k of Object.keys(merged) as (keyof Secrets)[]) {
    if (merged[k] === undefined) delete merged[k];
  }
  const file = secretsPath();
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), "utf8");
  // 0600 — best-effort; on Windows chmod is a no-op, that's expected
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // ignore
  }
}

/**
 * Resolves the Anthropic API key from (in order): explicit override,
 * then SURGERY_ANTHROPIC_API_KEY env var.
 * Note: We use a separate env var name to avoid conflicts with the SDK.
 */
export function resolveAnthropicApiKey(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (override) return override;
  return env.SURGERY_ANTHROPIC_API_KEY ?? undefined;
}

/**
 * Resolves the GitHub token from (in order): explicit override, secrets file,
 * then GITHUB_TOKEN / SURGERY_GIT_TOKEN env vars.
 */
export function resolveGithubToken(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (override) return override;
  const fromFile = readSecrets().githubToken;
  if (fromFile) return fromFile;
  return env.SURGERY_GIT_TOKEN ?? env.GITHUB_TOKEN ?? undefined;
}

/**
 * Resolves the agent-environment ID from (in order): explicit override,
 * secrets file, then ANTHROPIC_AGENT_ENV_ID env var.
 */
export function resolveAgentEnvId(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (override) return override;
  const fromFile = readSecrets().agentEnvId;
  if (fromFile) return fromFile;
  return env.ANTHROPIC_AGENT_ENV_ID ?? undefined;
}
