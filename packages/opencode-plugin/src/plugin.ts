import type { Plugin } from "@opencode-ai/plugin";
import { resolveConfig, type PluginOptions } from "./config.js";
import {
  assertSupportedHost,
  resolveHostVersionCapabilityAsync,
} from "./host-version.js";
import { installFetchInterposer } from "./interposer.js";

export const CloudflareAiGatewayChatgpt: Plugin = async (input, options) => {
  assertSupportedHost(await resolveHostVersionCapabilityAsync(input));
  installFetchInterposer({
    resolveConfig: () =>
      resolveConfig(process.env, (options ?? {}) as PluginOptions),
  });
  return {};
};
