import { describe, expect, it } from "vitest";
import type { ResolvedConfig } from "../src/config.js";
import type { ChatHeadersHook } from "../src/hooks.js";
import { createChatHeaders } from "../src/control-headers.js";

const config: ResolvedConfig = {
  accountId: "acct",
  gatewayId: "gw",
  gatewayToken: "sentinel-gateway-token",
  relayToken: "sentinel-relay-token",
  providerSlug: "relay-chatgpt",
  collectLogPayload: true,
  gatewayBaseUrl: "https://gateway.ai.cloudflare.com",
};

function input(providerID: string, id: string): Parameters<ChatHeadersHook>[0] {
  return {
    sessionID: "session",
    agent: "agent",
    model: { providerID, id },
    provider: { id: providerID },
    message: { role: "user", content: [] },
  } as Parameters<ChatHeadersHook>[0];
}

describe("createChatHeaders", () => {
  it("adds control headers only for the target OpenAI model", async () => {
    const hook = createChatHeaders(config);
    const output: Parameters<ChatHeadersHook>[1] = {
      headers: {
        Authorization: "Bearer opaque-oauth",
        "ChatGPT-Account-Id": "opaque-account",
        "X-Caller-Header": "preserve",
      },
    };

    await hook(input("openai", "gpt-5.6-luna"), output);

    expect(output.headers).toEqual({
      Authorization: "Bearer opaque-oauth",
      "ChatGPT-Account-Id": "opaque-account",
      "X-Caller-Header": "preserve",
      "cf-aig-authorization": "Bearer sentinel-gateway-token",
      "x-chatgpt-relay-authorization": "Bearer sentinel-relay-token",
      "cf-aig-collect-log": "true",
      "cf-aig-collect-log-payload": "true",
      "cf-aig-metadata":
        '{"source":"opencode","auth_type":"chatgpt_subscription","plugin":"cloudflare-ai-gateway-chatgpt"}',
      "cf-aig-skip-cache": "true",
      "cf-aig-max-attempts": "1",
    });
    expect(output.headers["x-openai-internal-codex-residency"]).toBeUndefined();
    expect(output.headers["X-OpenAI-Fedramp"]).toBeUndefined();
  });

  it("preserves headers and uses false payload retention", async () => {
    const hook = createChatHeaders({ ...config, collectLogPayload: false });
    const output: Parameters<ChatHeadersHook>[1] = {
      headers: {
        Authorization: "Bearer opaque-oauth",
        "ChatGPT-Account-Id": "opaque-account",
        "x-openai-internal-codex-residency": "host-value",
        "X-OpenAI-Fedramp": "host-value",
      },
    };

    await hook(input("openai", "other-model"), output);

    expect(output.headers).toEqual({
      Authorization: "Bearer opaque-oauth",
      "ChatGPT-Account-Id": "opaque-account",
      "x-openai-internal-codex-residency": "host-value",
      "X-OpenAI-Fedramp": "host-value",
    });

    await hook(input("openai", "gpt-5.6-luna"), output);
    expect(output.headers["cf-aig-collect-log-payload"]).toBe("false");
    expect(output.headers["x-openai-internal-codex-residency"]).toBe("host-value");
    expect(output.headers["X-OpenAI-Fedramp"]).toBe("host-value");
  });
});
