import type { Provider } from "@opencode-ai/sdk/v2";
import type { ResolvedConfig } from "./config.js";
import { PluginConfigurationError } from "./errors.js";
import { buildGatewayModelUrl } from "./gateway-url.js";
import type { ProviderModelsHook } from "./hooks.js";

const TARGET_MODEL_ID = "gpt-5.6-luna";

export function createProviderModels(config: ResolvedConfig): ProviderModelsHook {
  return async (provider: Provider) => {
    if (provider.id !== "openai") {
      throw new PluginConfigurationError(
        "cloudflare-ai-gateway-chatgpt: provider.models requires the openai provider.",
      );
    }

    const source = provider.models[TARGET_MODEL_ID];
    if (source === undefined) {
      throw new PluginConfigurationError(
        `cloudflare-ai-gateway-chatgpt: provider is missing ${TARGET_MODEL_ID}.`,
      );
    }

    return {
      ...provider.models,
      [TARGET_MODEL_ID]: {
        ...source,
        id: TARGET_MODEL_ID,
        providerID: "openai",
        api: {
          ...source.api,
          id: TARGET_MODEL_ID,
          url: buildGatewayModelUrl(config),
        },
      },
    };
  };
}
