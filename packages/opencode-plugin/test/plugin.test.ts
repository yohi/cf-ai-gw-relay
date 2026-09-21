import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareAiGatewayChatgpt } from "../src/plugin.js";
import { UnsupportedOpenCodeVersionError } from "../src/errors.js";

const originalFetch = globalThis.fetch;
const serverUrl = new URL("https://opencode.test");

function stubHealthyHost(version = "1.18.31"): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input) === new URL("/global/health", serverUrl).toString()) {
      return new Response(JSON.stringify({ healthy: true, version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("unexpected upstream fetch");
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CloudflareAiGatewayChatgpt", () => {
  it("rejects activation when the capability is absent", async () => {
    await expect(
      CloudflareAiGatewayChatgpt({} as never),
    ).rejects.toThrow(UnsupportedOpenCodeVersionError);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("rejects activation for unsupported versions", async () => {
    stubHealthyHost("1.18.19");
    const fetchBeforeActivation = globalThis.fetch;
    await expect(
      CloudflareAiGatewayChatgpt({ serverUrl } as never),
    ).rejects.toThrow(UnsupportedOpenCodeVersionError);
    expect(globalThis.fetch).toBe(fetchBeforeActivation);
  });

  it("returns both public hooks without mutating global fetch", async () => {
    vi.stubEnv("RELAY_CF_ACCOUNT_ID", "acct");
    vi.stubEnv("RELAY_CF_GATEWAY_ID", "gw");
    vi.stubEnv("RELAY_SECRET", "sentinel-relay-token");
    stubHealthyHost();
    const fetchBeforeActivation = globalThis.fetch;

    const hooks = await CloudflareAiGatewayChatgpt(
      { serverUrl } as never,
      { apiKey: "sentinel-gw-token" },
    );

    expect(hooks.provider?.id).toBe("openai");
    expect(hooks.provider?.models).toBeTypeOf("function");
    expect(hooks["chat.headers"]).toBeTypeOf("function");
    expect(globalThis.fetch).toBe(fetchBeforeActivation);
  });

  it("reads the supported host version through the official health API", async () => {
    vi.stubEnv("RELAY_CF_ACCOUNT_ID", "acct");
    vi.stubEnv("RELAY_CF_GATEWAY_ID", "gw");
    vi.stubEnv("RELAY_SECRET", "sentinel-relay-token");
    stubHealthyHost("1.18.31");
    const fetchBeforeActivation = globalThis.fetch;

    const hooks = await CloudflareAiGatewayChatgpt(
      { serverUrl } as never,
      { apiKey: "sentinel-gw-token" },
    );

    expect(hooks.provider?.id).toBe("openai");
    expect(hooks.provider?.models).toBeTypeOf("function");
    expect(hooks["chat.headers"]).toBeTypeOf("function");
    expect(globalThis.fetch).toBe(fetchBeforeActivation);
  });

  it("rejects activation when the health API cannot verify the host", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("health unavailable");
    });
    const fetchBeforeActivation = globalThis.fetch;
    await expect(
      CloudflareAiGatewayChatgpt({ serverUrl } as never),
    ).rejects.toThrow(/could not verify host version capability/i);
    expect(globalThis.fetch).toBe(fetchBeforeActivation);
  });

  it("fails closed with a configuration error before returning hooks", async () => {
    vi.stubEnv("RELAY_CF_ACCOUNT_ID", "acct");
    vi.stubEnv("RELAY_CF_GATEWAY_ID", "gw");
    vi.stubEnv("RELAY_SECRET", "sentinel-relay-token");
    vi.stubEnv("RELAY_CF_AIG_TOKEN", "");
    stubHealthyHost();
    const fetchBeforeActivation = globalThis.fetch;

    await expect(
      CloudflareAiGatewayChatgpt({ serverUrl } as never, {}),
    ).rejects.toThrow(/apiKey/i);
    expect(globalThis.fetch).toBe(fetchBeforeActivation);
  });
});
