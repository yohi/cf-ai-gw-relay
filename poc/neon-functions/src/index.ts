import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { constantTimeBearer, MockCredentialCipher } from "./crypto.ts";
import { probeStore } from "./probe.ts";
import { createPostgresStore, type StateStore } from "./store.ts";

const MODEL = "x-poc/mock";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

export interface AppSettings {
  apiKey: string;
  store?: StateStore;
  cipher?: MockCredentialCipher;
  enableDbProbe?: boolean;
  maxSseSeconds?: number;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  if (!/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

async function readModelRequest(request: Request): Promise<{ stream: boolean } | Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: { code: "unsupported_media_type" } }, 415);
  }
  const declaredSize = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > 262_144) return json({ error: { code: "request_too_large" } }, 413);
  let bytes: string;
  try {
    bytes = await request.text();
  } catch {
    return json({ error: { code: "invalid_body" } }, 400);
  }
  if (Buffer.byteLength(bytes, "utf8") > 262_144) return json({ error: { code: "request_too_large" } }, 413);
  let data: unknown;
  try { data = JSON.parse(bytes); } catch { return json({ error: { code: "invalid_json" } }, 400); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: { code: "invalid_request" } }, 400);
  const body = data as Record<string, unknown>;
  if (body.model !== MODEL || (body.stream !== undefined && typeof body.stream !== "boolean")) {
    return json({ error: { code: "unsupported_model_or_stream" } }, 400);
  }
  return { stream: body.stream === true };
}

function mockChat(id: string) {
  return {
    id: `chatcmpl-${id}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: MODEL,
    choices: [{ index: 0, message: { role: "assistant", content: "neon-functions-poc" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
function mockResponse(id: string) {
  return {
    id: `resp_${id}`, object: "response", created_at: Math.floor(Date.now() / 1000), status: "completed", model: MODEL,
    output: [{ id: `msg_${id}`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "neon-functions-poc", annotations: [] }] }],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  };
}

function streamingResponse(request: Request, kind: "chat" | "responses", id: string, count: number, intervalMs: number): Response {
  let canceled = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < count; i++) {
          if (canceled || request.signal.aborted) break;
          if (intervalMs > 0) await sleep(intervalMs, undefined, { signal: request.signal });
          if (canceled || request.signal.aborted) break;
          const frame = kind === "chat"
            ? `data: ${JSON.stringify({ id: `chatcmpl-${id}`, object: "chat.completion.chunk", model: MODEL, choices: [{ index: 0, delta: { content: i === 0 ? "neon-functions-poc" : "" }, finish_reason: i === count - 1 ? "stop" : null }] })}\n\n`
            : `event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", response_id: `resp_${id}`, output_index: 0, content_index: 0, delta: i === 0 ? "neon-functions-poc" : "" })}\n\n`;
          controller.enqueue(encoder.encode(frame));
        }
        if (!canceled && !request.signal.aborted) {
          if (kind === "chat") controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          else {
            controller.enqueue(encoder.encode(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: mockResponse(id) })}\n\n`));
          }
        }
        controller.close();
      } catch {
        // Abort is not an upstream error. Do not expose request or credential data.
        if (!canceled) { try { controller.close(); } catch { /* already closed */ } }
      }
    },
    cancel() { canceled = true; },
  });
  return new Response(stream, {
    headers: { ...JSON_HEADERS, "content-type": "text/event-stream; charset=utf-8", "x-accel-buffering": "no" },
  });
}

export function createApp(settings: AppSettings): { fetch: (request: Request) => Promise<Response> } {
  const maxSseSeconds = Math.max(1, Math.min(900, settings.maxSseSeconds ?? 20));
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname.replace(/^\/v1(?=\/)/, "");
      if (!constantTimeBearer(request, settings.apiKey)) return json({ error: { code: "unauthorized" } }, 401);
      if (request.method === "GET" && path === "/health") return json({ ok: true, mockOnly: true });
      if (request.method === "GET" && path === "/models") {
        return json({ object: "list", data: [{ id: MODEL, object: "model", owned_by: "mock" }] });
      }
      if (request.method === "POST" && path === "/_poc/store/probe") {
        if (!settings.enableDbProbe || !settings.store || !settings.cipher) return json({ error: { code: "not_enabled" } }, 404);
        try { return json(await probeStore(settings.store, settings.cipher)); }
        catch { return json({ error: { code: "db_probe_failed" } }, 503); }
      }
      if (request.method === "POST" && (path === "/chat/completions" || path === "/responses")) {
        const parsed = await readModelRequest(request);
        if (parsed instanceof Response) return parsed;
        const kind = path === "/responses" ? "responses" : "chat";
        const id = randomUUID().replaceAll("-", "");
        if (!parsed.stream) return json(kind === "chat" ? mockChat(id) : mockResponse(id));
        const count = parseBoundedInteger(url.searchParams.get("chunks"), 3, 1, 100);
        const interval = parseBoundedInteger(url.searchParams.get("intervalMs"), 50, 0, 60_000);
        if (count === null || interval === null || count * interval > maxSseSeconds * 1000) {
          return json({ error: { code: "stream_budget_exceeded" } }, 400);
        }
        return streamingResponse(request, kind, id, count, interval);
      }
      return json({ error: { code: "not_found" } }, 404);
    },
  };
}

let hostedAppPromise: Promise<{ fetch: (request: Request) => Promise<Response> }> | undefined;
async function hostedApp() {
  if (!hostedAppPromise) {
    hostedAppPromise = (async () => {
      const key = process.env.X_POC_API_KEY ?? "";
      const allowProbe = process.env.X_POC_ENABLE_DB_PROBE === "true";
      const cipher = allowProbe ? new MockCredentialCipher(process.env.X_POC_ENCRYPTION_KEY ?? "") : undefined;
      const store = allowProbe ? await createPostgresStore(process.env.DATABASE_URL ?? "") : undefined;
      const seconds = Number(process.env.X_POC_MAX_SSE_SECONDS ?? "20");
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900) throw new Error("invalid_max_sse_seconds");
      return createApp({ apiKey: key, cipher, store, enableDbProbe: allowProbe, maxSseSeconds: seconds });
    })();
    hostedAppPromise.catch(() => { hostedAppPromise = undefined; });
  }
  return hostedAppPromise;
}

// Neon Functions expects a default export with a fetch(request) handler.
export default {
  async fetch(request: Request) {
    try { return await (await hostedApp()).fetch(request); }
    catch { return json({ error: { code: "service_unavailable" } }, 503); }
  },
};
