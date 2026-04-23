import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import {
  ARTIFACT_PATHS,
  eventsFile,
  vitalsFile,
  planFile,
  seamsFile,
  approvalFile,
  PhaseSchema,
  writeApproval,
  readEvents,
  readVitals,
  type SurgeryEvent,
} from "@brownfield-surgeon/shared";
import { watchEventsFile } from "./tail.js";
import { runManager } from "./run-manager.js";

const PORT = Number(process.env.SURGERY_UI_PORT ?? 7777);
const REPO_ROOT = path.resolve(process.env.SURGERY_REPO_ROOT ?? process.cwd());

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
      res.write("event: hello\ndata: {}\n\n");
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`);
    }
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
  if (pathname === "/api/plan" && req.method === "GET") {
    await sendFile(res, planFile(REPO_ROOT), "text/markdown; charset=utf-8");
    return;
  }
  if (pathname === "/api/seams" && req.method === "GET") {
    await sendFile(res, seamsFile(REPO_ROOT), "text/markdown; charset=utf-8");
    return;
  }
  const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (approvalMatch && req.method === "POST") {
    await handleApproval(req, res, approvalMatch[1]!);
    return;
  }
  if (pathname === "/api/run/start" && req.method === "POST") {
    const body = await readBody(req).catch(() => "");
    let payload: any = {};
    try { payload = body ? JSON.parse(body) : {}; } catch { payload = {}; }
    const request = typeof payload.request === "string" ? payload.request : "";
    if (!request) {
      json(res, 400, { error: "request is required" });
      return;
    }
    try {
      const state = runManager.start({
        repoRoot: REPO_ROOT,
        request,
        engine: payload.engine ?? "sdk",
        autoApprove: payload.autoApprove === true,
        runId: payload.runId,
        model: typeof payload.model === "string" ? payload.model : undefined,
        thinking:
          payload.thinking === "off" ||
          payload.thinking === "low" ||
          payload.thinking === "medium" ||
          payload.thinking === "high"
            ? payload.thinking
            : undefined,
      });
      json(res, 200, { ok: true, state });
    } catch (err) {
      json(res, 409, { error: String(err) });
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

// Start tailing the events file and rebroadcasting vitals changes.
const eventsPath = eventsFile(REPO_ROOT);
const vitalsPath = vitalsFile(REPO_ROOT);

watchEventsFile(eventsPath, (event: SurgeryEvent) => {
  broadcast("event", event);
});

// Poll vitals.json (simpler and works cross-platform on Windows).
let lastVitalsMtime = 0;
setInterval(async () => {
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
