import { config } from "dotenv";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";

// Load .env.local from the monorepo root (../../../.env.local relative to this file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../../../.env.local");
config({ path: envPath });
import {
  ARTIFACT_PATHS,
  eventsFile,
  vitalsFile,
  planFile,
  seamsFile,
  approvalFile,
  PhaseSchema,
  writeApproval,
  readChangesSince,
  readEvents,
  readVitals,
  type SurgeryEvent,
} from "@brownfield-surgeon/shared";
import { watchEventsFile } from "./tail.js";
import { runManager } from "./run-manager.js";
import {
  readSecrets,
  writeSecrets,
  resolveRepoUrl,
  resolveBaseBranch,
  resolveAnthropicApiKey,
} from "@brownfield-surgeon/managed-runner";
import Anthropic from "@anthropic-ai/sdk";

const PORT = Number(process.env.SURGERY_UI_PORT ?? 7777);

// Resolve the Anthropic API key once at startup.
// Only use it when creating the client for managed environments — don't set env vars.
const anthropicApiKey = resolveAnthropicApiKey();

// Mutable state for dynamic repo switching
let REPO_ROOT = path.resolve(process.env.SURGERY_REPO_ROOT ?? process.cwd());
let eventsWatcher: (() => void) | null = null;
let planIntervalId: NodeJS.Timeout | null = null;
let seamsIntervalId: NodeJS.Timeout | null = null;
let vitalsIntervalId: NodeJS.Timeout | null = null;

// Grep backtick-quoted filenames (anything with a file extension) from markdown,
// return deduplicated basenames.
function extractSeamFiles(markdown: string): string[] {
  const FILE_RE = /`([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|mjs|svelte|vue|py|rb|go|java|cs|kt|swift|rs|cpp|c|h|css|scss|html|json))`/g;
  const seen = new Set<string>();
  for (const m of markdown.matchAll(FILE_RE)) {
    const basename = m[1]!.split("/").pop()!;
    seen.add(basename);
  }
  return [...seen];
}

type SSEClient = {
  id: number;
  res: http.ServerResponse;
};

const clients = new Set<SSEClient>();
let nextClientId = 1;

function broadcast(eventName: string, data: unknown): void {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try {
      c.res.write(payload);
    } catch {
      // client gone; will be cleaned up on close
    }
  }
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(s),
    "access-control-allow-origin": "*",
  });
  res.end(s);
}

function stopWatchers(): void {
  if (eventsWatcher) eventsWatcher();
  if (planIntervalId) clearInterval(planIntervalId);
  if (seamsIntervalId) clearInterval(seamsIntervalId);
  if (vitalsIntervalId) clearInterval(vitalsIntervalId);
  eventsWatcher = null;
  planIntervalId = null;
  seamsIntervalId = null;
  vitalsIntervalId = null;
}

function startWatchers(): void {
  const eventsPath = eventsFile(REPO_ROOT);
  const vitalsPath = vitalsFile(REPO_ROOT);
  const planMdPath = planFile(REPO_ROOT);
  const seamsMdPath = seamsFile(REPO_ROOT);

  // Watch events file
  eventsWatcher = watchEventsFile(eventsPath, (event: SurgeryEvent) => {
    broadcast("event", event);
  });

  // Poll plan.md
  let planMdKnown = false;
  fsp.stat(planMdPath).then(() => { planMdKnown = true; }).catch(() => {});
  planIntervalId = setInterval(async () => {
    try {
      await fsp.stat(planMdPath);
      if (!planMdKnown) {
        planMdKnown = true;
        broadcast("plan-ready", {});
      }
    } catch {
      if (planMdKnown) {
        planMdKnown = false;
        broadcast("plan-removed", {});
      }
    }
  }, 500);

  // Poll seams.md
  let seamsMdKnown = false;
  fsp.stat(seamsMdPath).then(() => { seamsMdKnown = true; }).catch(() => {});
  seamsIntervalId = setInterval(async () => {
    try {
      await fsp.stat(seamsMdPath);
      if (!seamsMdKnown) {
        seamsMdKnown = true;
        broadcast("seams-ready", {});
      }
    } catch {
      if (seamsMdKnown) {
        seamsMdKnown = false;
        broadcast("seams-removed", {});
      }
    }
  }, 500);

  // Poll vitals.json
  let lastVitalsMtime = 0;
  vitalsIntervalId = setInterval(async () => {
    try {
      const stat = await fsp.stat(vitalsPath);
      if (stat.mtimeMs !== lastVitalsMtime) {
        lastVitalsMtime = stat.mtimeMs;
        const v = await readVitals(REPO_ROOT);
        if (v) broadcast("vitals", v);
      }
    } catch {
      // vitals not written yet
    }
  }, 500);
}

async function sendFile(
  res: http.ServerResponse,
  absPath: string,
  contentType: string,
): Promise<void> {
  try {
    const body = await fsp.readFile(absPath, "utf8");
    res.writeHead(200, {
      "content-type": contentType,
      "access-control-allow-origin": "*",
    });
    res.end(body);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.writeHead(404, { "access-control-allow-origin": "*" });
      res.end("");
      return;
    }
    res.writeHead(500, { "access-control-allow-origin": "*" });
    res.end(String(err));
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function handleStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  res.write("retry: 2000\n\n");
  const client: SSEClient = { id: nextClientId++, res };
  clients.add(client);
  req.on("close", () => {
    clients.delete(client);
  });

  // Replay current state on connect.
  (async () => {
    try {
      const vitals = await readVitals(REPO_ROOT);
      if (vitals) {
        res.write(`event: vitals\ndata: ${JSON.stringify(vitals)}\n\n`);
      }
      const events = await readEvents(REPO_ROOT);
      for (const ev of events) {
        res.write(`event: event\ndata: ${JSON.stringify(ev)}\n\n`);
      }
      if (planMdKnown)  res.write(`event: plan-ready\ndata: {}\n\n`);
      if (seamsMdKnown) res.write(`event: seams-ready\ndata: {}\n\n`);
    } catch (err) {
      console.warn("[ui-server] error replaying state on stream connect:", err);
    }
    // Always send hello to signal connection is live, regardless of whether we could read files
    res.write("event: hello\ndata: {}\n\n");
  })();
}

async function handleApproval(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  phaseRaw: string,
): Promise<void> {
  const parsed = PhaseSchema.safeParse(phaseRaw);
  if (!parsed.success) {
    json(res, 400, { error: "invalid phase", phase: phaseRaw });
    return;
  }
  const body = await readBody(req).catch(() => "");
  const payload = body ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : {};
  await writeApproval(REPO_ROOT, parsed.data, {
    approvedBy: payload.approvedBy ?? "ui",
    note: payload.note,
  });
  json(res, 200, { ok: true, phase: parsed.data, file: approvalFile(REPO_ROOT, parsed.data) });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const { pathname } = url;

  if (pathname === "/api/health") {
    json(res, 200, { ok: true, repoRoot: REPO_ROOT });
    return;
  }
  if (pathname === "/api/stream" && req.method === "GET") {
    handleStream(req, res);
    return;
  }
  if (pathname === "/api/vitals" && req.method === "GET") {
    const v = await readVitals(REPO_ROOT);
    if (!v) {
      json(res, 404, { error: "no vitals yet" });
      return;
    }
    json(res, 200, v);
    return;
  }
  if (pathname === "/api/events" && req.method === "GET") {
    const evs = await readEvents(REPO_ROOT);
    json(res, 200, evs);
    return;
  }
  if (pathname === "/api/changes" && req.method === "GET") {
    const v = await readVitals(REPO_ROOT);
    const baseline = v?.baselineRef ?? null;
    const result = readChangesSince(REPO_ROOT, baseline);
    json(res, 200, result);
    return;
  }
  if (pathname === "/api/plan" && req.method === "GET") {
    await sendFile(res, planFile(REPO_ROOT), "text/markdown; charset=utf-8");
    return;
  }
  if (pathname === "/api/seams" && req.method === "GET") {
    await sendFile(res, seamsFile(REPO_ROOT), "text/markdown; charset=utf-8");
    return;
  }
  if (pathname === "/api/seams/files" && req.method === "GET") {
    try {
      const md = await fsp.readFile(seamsFile(REPO_ROOT), "utf8");
      json(res, 200, { files: extractSeamFiles(md) });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        json(res, 200, { files: [] });
      } else {
        json(res, 500, { error: String(err) });
      }
    }
    return;
  }
  const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (approvalMatch && req.method === "POST") {
    await handleApproval(req, res, approvalMatch[1]!);
    return;
  }
  if (pathname === "/api/restart" && req.method === "POST") {
    const signalPath = path.join(REPO_ROOT, ARTIFACT_PATHS.surgeryDir, "restart.signal");
    try {
      await fsp.mkdir(path.dirname(signalPath), { recursive: true });
      await fsp.writeFile(signalPath, new Date().toISOString(), "utf8");
      json(res, 200, { ok: true, signal: signalPath });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
    return;
  }
  if (pathname === "/api/repo/origin" && req.method === "GET") {
    const repoUrl = resolveRepoUrl(REPO_ROOT) ?? null;
    const baseBranch = resolveBaseBranch(REPO_ROOT);
    json(res, 200, { repoUrl, baseBranch });
    return;
  }
  if (pathname === "/api/settings" && req.method === "GET") {
    const s = readSecrets();
    // Don't echo secret values to the browser. Surface only "is set" for the
    // token; the env id is non-secret (it's a public Anthropic resource ID)
    // so we send it back so the dropdown can pre-select.
    json(res, 200, {
      githubTokenSet: Boolean(s.githubToken),
      agentEnvId: s.agentEnvId ?? null,
    });
    return;
  }
  if (pathname === "/api/settings" && req.method === "PUT") {
    const body = await readBody(req).catch(() => "");
    let payload: any = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
    const patch: { githubToken?: string; agentEnvId?: string } = {};
    if (typeof payload.githubToken === "string" && payload.githubToken.length > 0) {
      patch.githubToken = payload.githubToken;
    }
    if (typeof payload.agentEnvId === "string" && payload.agentEnvId.length > 0) {
      patch.agentEnvId = payload.agentEnvId;
    }
    try {
      writeSecrets(patch);
      const s = readSecrets();
      json(res, 200, {
        ok: true,
        githubTokenSet: Boolean(s.githubToken),
        agentEnvId: s.agentEnvId ?? null,
      });
    } catch (err) {
      json(res, 500, { error: String(err) });
    }
    return;
  }
  if (pathname === "/api/managed/environments" && req.method === "GET") {
    if (!anthropicApiKey) {
      json(res, 503, {
        error:
          "SURGERY_ANTHROPIC_API_KEY not set; cannot list managed environments",
      });
      return;
    }
    try {
      const client = new Anthropic({ apiKey: anthropicApiKey });
      const envs: Array<{ id: string; name: string }> = [];
      for await (const e of client.beta.environments.list()) {
        // Filter out archived envs — they cannot accept new sessions.
        if (e.archived_at) continue;
        envs.push({ id: e.id, name: e.name });
      }
      json(res, 200, { environments: envs });
    } catch (err) {
      json(res, 502, { error: String(err) });
    }
    return;
  }
  if (pathname === "/api/run/start" && req.method === "POST") {
    const body = await readBody(req).catch(() => "");
    let payload: any = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
    const engine =
      payload.engine === "plugin" ||
      payload.engine === "managed" ||
      payload.engine === "sdk"
        ? payload.engine
        : "sdk";
    const request = typeof payload.request === "string" ? payload.request : "";
    // request is required for SDK and managed modes, but optional for plugin mode
    // (plugin mode gets the request from the CLI, not the UI)
    if (!request && engine !== "plugin") {
      json(res, 400, { error: "request is required" });
      return;
    }
    try {
      const workspace =
        typeof payload.workspace === "string" && payload.workspace.trim()
          ? path.resolve(payload.workspace.trim())
          : REPO_ROOT;
      const managed =
        engine === "managed" && payload.managed && typeof payload.managed === "object"
          ? {
              repoUrl:
                typeof payload.managed.repoUrl === "string"
                  ? payload.managed.repoUrl
                  : undefined,
              baseBranch:
                typeof payload.managed.baseBranch === "string"
                  ? payload.managed.baseBranch
                  : undefined,
              scratchBranch:
                typeof payload.managed.scratchBranch === "string"
                  ? payload.managed.scratchBranch
                  : undefined,
              agentEnvId:
                typeof payload.managed.agentEnvId === "string"
                  ? payload.managed.agentEnvId
                  : undefined,
            }
          : undefined;
      const state = runManager.start({
        repoRoot: workspace,
        request,
        engine,
        autoApprove: payload.autoApprove === true,
        runId: payload.runId,
        model: typeof payload.model === "string" ? payload.model : undefined,
        permissionMode:
          payload.permissionMode === "acceptEdits" || payload.permissionMode === "bypassPermissions"
            ? payload.permissionMode
            : undefined,
        allowedTools: Array.isArray(payload.allowedTools)
          ? payload.allowedTools.filter((t: unknown) => typeof t === "string")
          : undefined,
        thinking:
          payload.thinking === "off" ||
          payload.thinking === "low" ||
          payload.thinking === "medium" ||
          payload.thinking === "high"
            ? payload.thinking
            : undefined,
        managed,
      });
      json(res, 200, { ok: true, state });
    } catch (err) {
      json(res, 409, { error: String(err) });
    }
    return;
  }
  if (pathname === "/api/watch" && req.method === "POST") {
    const body = await readBody(req).catch(() => "");
    let payload: any = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
    const newRoot = typeof payload.repoRoot === "string" ? payload.repoRoot.trim() : "";
    if (!newRoot) {
      json(res, 400, { error: "repoRoot is required" });
      return;
    }
    try {
      const resolved = path.resolve(newRoot);
      // Verify the directory exists
      await fsp.stat(resolved);
      // Switch to the new directory
      stopWatchers();
      REPO_ROOT = resolved;
      startWatchers();
      // Ensure .surgery dir exists
      fs.mkdirSync(path.join(REPO_ROOT, ARTIFACT_PATHS.surgeryDir), { recursive: true });
      console.log(`[ui-server] switched to watching repo: ${REPO_ROOT}`);
      // Notify all clients to refresh state (new repo context)
      broadcast("repo-switched", { repoRoot: REPO_ROOT });
      // Send fresh vitals from new repo immediately
      const freshVitals = await readVitals(REPO_ROOT);
      console.log(`[ui-server] fresh vitals from ${REPO_ROOT}:`, freshVitals ? "found" : "not found");
      if (freshVitals) {
        broadcast("vitals", freshVitals);
        console.log(`[ui-server] broadcast fresh vitals`);
      } else {
        console.log(`[ui-server] warning: no vitals.json in new repo`);
      }
      json(res, 200, { ok: true, repoRoot: REPO_ROOT });
    } catch (err) {
      json(res, 400, { error: String(err) });
    }
    return;
  }
  if (pathname === "/api/run/abort" && req.method === "POST") {
    const ok = runManager.abort();
    json(res, ok ? 200 : 404, { ok, state: runManager.getState() });
    return;
  }
  if (pathname === "/api/run/status" && req.method === "GET") {
    json(res, 200, {
      running: runManager.isRunning(),
      state: runManager.getState(),
      logs: runManager.getLogs(),
    });
    return;
  }
  json(res, 404, { error: "not found", pathname });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[ui-server] unhandled:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain" });
    }
    res.end(String(err));
  });
});

server.listen(PORT, () => {
  console.log(`[ui-server] listening on http://localhost:${PORT}`);
  console.log(`[ui-server] watching repo: ${REPO_ROOT}`);
});

// Start watchers for initial repo root
startWatchers();

// Heartbeat so proxies don't close SSE connections.
setInterval(() => {
  for (const c of clients) {
    try {
      c.res.write(": heartbeat\n\n");
    } catch {
      // will be pruned on close
    }
  }
}, 15_000);

// Ensure .surgery dir exists so watchers can attach.
fs.mkdirSync(path.join(REPO_ROOT, ARTIFACT_PATHS.surgeryDir), { recursive: true });
