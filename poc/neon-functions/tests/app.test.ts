import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../src/index.ts";
import { MockCredentialCipher } from "../src/crypto.ts";
import { probeStore } from "../src/probe.ts";
import { InMemoryStateStore } from "../src/store.ts";

const SECRET = "test-poc-key-sufficient-length-000000000000000";
const auth = { authorization: `Bearer ${SECRET}` };
const app = createApp({ apiKey: SECRET, maxSseSeconds: 3 });
function request(path: string, options: { method?: string; key?: string | null; body?: unknown; signal?: AbortSignal } = {}) {
  const headers: Record<string, string> = {};
  if (options.key !== null) headers.authorization = `Bearer ${options.key ?? SECRET}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://mock.invalid${path}`, { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal });
}

test("authentication is mandatory and fail-closed", async () => {
  assert.equal((await app.fetch(request("/v1/health", { key: null }))).status, 401);
  assert.equal((await app.fetch(request("/v1/health", { key: "wrong" }))).status, 401);
  assert.equal((await createApp({ apiKey: "" }).fetch(request("/v1/health"))).status, 401);
  assert.equal((await app.fetch(request("/v1/health"))).status, 200);
});

test("OpenAI-compatible model listing and mock JSON responses", async () => {
  const models = await (await app.fetch(request("/v1/models"))).json();
  assert.equal(models.data[0].id, "x-poc/mock");
  const chat = await app.fetch(request("/v1/chat/completions", { method: "POST", body: { model: "x-poc/mock", messages: [{role:"user", content:"no echo"}] } }));
  assert.equal(chat.status, 200);
  assert.equal((await chat.json()).choices[0].message.content, "neon-functions-poc");
  const responses = await app.fetch(request("/v1/responses", { method: "POST", body: { model: "x-poc/mock", input: "no echo" } }));
  assert.equal((await responses.json()).object, "response");
});

test("unsupported model, invalid stream, invalid type, and unknown routes are rejected", async () => {
  assert.equal((await app.fetch(request("/v1/chat/completions", { method: "POST", body: { model: "gpt-real" } }))).status, 400);
  assert.equal((await app.fetch(request("/v1/responses", { method: "POST", body: { model: "x-poc/mock", stream: "yes" } }))).status, 400);
  assert.equal((await app.fetch(request("/v1/unknown"))).status, 404);
});

test("chat and responses SSE produce discrete events and terminators", async () => {
  for (const kind of ["chat/completions", "responses"]) {
    const response = await app.fetch(request(`/v1/${kind}?chunks=3&intervalMs=1`, { method: "POST", body: { model: "x-poc/mock", stream: true } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const text = await response.text();
    assert.equal((text.match(/delta/g) ?? []).length >= 3, true);
    assert.equal(text.includes(kind === "responses" ? "response.completed" : "[DONE]"), true);
  }
});

test("excessive stream duration is rejected before starting", async () => {
  const response = await app.fetch(request("/v1/responses?chunks=100&intervalMs=100", { method: "POST", body: { model: "x-poc/mock", stream: true } }));
  assert.equal(response.status, 400);
});

test("SSE consumer cancellation stops the stream", async () => {
  const response = await app.fetch(request("/v1/responses?chunks=50&intervalMs=10", { method: "POST", body: { model: "x-poc/mock", stream: true } }));
  const reader = response.body!.getReader();
  const chunk = await reader.read();
  assert.equal(chunk.done, false);
  await reader.cancel();
});

test("encrypted synthetic credential and compare-and-swap probe", async () => {
  const cipher = new MockCredentialCipher(randomBytes(32).toString("base64"));
  const store = new InMemoryStateStore();
  assert.deepEqual(await probeStore(store, cipher), { ok: true, encryptedAtRest: true, staleUpdateRejected: true, finalVersion: 2 });
  const ciphertext = cipher.seal("synthetic-credential");
  assert.equal(cipher.open(ciphertext), "synthetic-credential");
  assert.equal(ciphertext.toString("utf8").includes("synthetic-credential"), false);
  assert.throws(() => cipher.open(Buffer.from(ciphertext).fill(0)));
});

test("two contenders cannot both update the same version", async () => {
  const cipher = new MockCredentialCipher(randomBytes(32).toString("base64"));
  const store = new InMemoryStateStore();
  assert.equal(await store.create("synthetic-account", cipher.seal("one")), true);
  const [a, b] = await Promise.all([
    store.compareAndSwap("synthetic-account", 1, cipher.seal("two")),
    store.compareAndSwap("synthetic-account", 1, cipher.seal("three")),
  ]);
  assert.equal(Number(a) + Number(b), 1);
  assert.equal((await store.read("synthetic-account"))?.version, 2);
});

test("DB probe endpoint is disabled by default", async () => {
  const res = await app.fetch(request("/_poc/store/probe", { method: "POST" }));
  assert.equal(res.status, 404);
});
