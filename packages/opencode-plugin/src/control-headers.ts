import type { ResolvedConfig } from "./config.js";
import type { ChatHeadersHook } from "./hooks.js";

const TARGET_MODEL_ID = "gpt-5.6-luna";

const METADATA_HEADER_VALUE = JSON.stringify({
  source: "opencode",
  auth_type: "chatgpt_subscription",
  plugin: "cloudflare-ai-gateway-chatgpt",
});

export function createChatHeaders(config: ResolvedConfig): ChatHeadersHook {
  return async (input, output) => {
    if (input.model.providerID !== "openai" || input.model.id !== TARGET_MODEL_ID) {
      return;
    }

    output.headers["cf-aig-authorization"] = `Bearer ${config.gatewayToken}`;
    output.headers["x-chatgpt-relay-authorization"] =
      `Bearer ${config.relayToken}`;
    output.headers["cf-aig-collect-log"] = "true";
    output.headers["cf-aig-collect-log-payload"] = config.collectLogPayload
      ? "true"
      : "false";
    output.headers["cf-aig-metadata"] = METADATA_HEADER_VALUE;
    output.headers["cf-aig-skip-cache"] = "true";
    output.headers["cf-aig-max-attempts"] = "1";
  };
}
