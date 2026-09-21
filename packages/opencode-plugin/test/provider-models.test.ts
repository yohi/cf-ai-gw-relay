import { describe, expect, it } from "vitest";
import type { Provider } from "@opencode-ai/sdk/v2";
import type { ResolvedConfig } from "../src/config.js";
import { PluginConfigurationError } from "../src/errors.js";
import { createProviderModels } from "../src/provider-models.js";

const config: ResolvedConfig = {
  accountId: "acct",
  gatewayId: "gw",
  gatewayToken: "token",
  relayToken: "relay",
  providerSlug: "relay-chatgpt",
  collectLogPayload: true,
  gatewayBaseUrl: "https://gateway.ai.cloudflare.com",
};

const sourceModel = {
  id: "source-id",
  providerID: "source-provider",
  api: { id: "source-api-id", url: "https://source.invalid", npm: "custom-sdk" },
  name: "Source model",
  family: "source-family",
  capabilities: {
    temperature: true,
    reasoning: true,
    attachment: true,
    toolcall: true,
    input: { text: true, audio: false, image: true, video: false, pdf: true },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: { field: "reasoning" },
  },
  cost: {
    input: 1,
    output: 2,
    cache: { read: 3, write: 4 },
    tiers: [{ input: 5, output: 6, cache: { read: 7, write: 8 }, tier: { type: "context", size: 9 } }],
  },
  limit: { context: 100, input: 90, output: 80 },
  status: "active" as const,
  options: { custom: "option" },
  headers: { "x-source": "header" },
  release_date: "2026-09-20",
  variants: { default: { temperature: 0.2 } },
};

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "openai",
    name: "OpenAI",
    source: "api",
    env: [],
    options: { provider: "option" },
    models: { "gpt-5.6-luna": sourceModel },
    ...overrides,
  };
}

describe("createProviderModels", () => {
  it("selects and reroutes only the fixed target model", async () => {
    const result = await createProviderModels(config)(provider(), {});
    const model = result["gpt-5.6-luna"];

    expect(model.api).toMatchObject({
      id: "gpt-5.6-luna",
      npm: "@ai-sdk/openai",
      url: "https://gateway.ai.cloudflare.com/v1/acct/gw/custom-relay-chatgpt",
    });
    expect(model.api.url).not.toMatch(/\/responses$/);
    expect(model.id).toBe("gpt-5.6-luna");
    expect(model.providerID).toBe("openai");
    expect(model.name).toBe(sourceModel.name);
    expect(model.capabilities).toEqual(sourceModel.capabilities);
    expect(model.cost).toEqual(sourceModel.cost);
    expect(model.limit).toEqual(sourceModel.limit);
    expect(model.options).toEqual(sourceModel.options);
    expect(model.headers).toEqual(sourceModel.headers);
    expect(model.variants).toEqual(sourceModel.variants);
  });

  it("rejects a non-OpenAI provider", async () => {
    await expect(
      createProviderModels(config)(provider({ id: "anthropic" }), {}),
    ).rejects.toThrowError(PluginConfigurationError);
  });

  it("rejects an OpenAI provider without the target model", async () => {
    await expect(
      createProviderModels(config)(provider({ models: {} }), {}),
    ).rejects.toThrowError(PluginConfigurationError);
  });
});
