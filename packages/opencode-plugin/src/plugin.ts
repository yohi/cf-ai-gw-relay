import type { Plugin } from "@opencode-ai/plugin";
import { resolveConfig, type PluginOptions } from "./config.js";
import {
  assertSupportedHost,
  resolveHostVersionCapabilityAsync,
} from "./host-version.js";
import { createChatHeaders } from "./control-headers.js";
import { createProviderModels } from "./provider-models.js";

export const CloudflareAiGatewayChatgpt: Plugin = async (input, options) => {
  assertSupportedHost(await resolveHostVersionCapabilityAsync(input));
  const config = resolveConfig(process.env, (options ?? {}) as PluginOptions);
  return {
    provider: { id: "openai", models: createProviderModels(config) },
    "chat.headers": createChatHeaders(config),
  };
};
