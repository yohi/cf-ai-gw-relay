import { describe, expect, it } from "vitest";
import { buildGatewayModelUrl } from "../src/gateway-url.js";
import type { ResolvedConfig } from "../src/config.js";

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    accountId: "acct",
    gatewayId: "gw",
    gatewayToken: "token",
    relayToken: "relay",
    providerSlug: "relay-chatgpt",
    collectLogPayload: true,
    gatewayBaseUrl: "https://gateway.ai.cloudflare.com",
    ...overrides,
  };
}

describe("buildGatewayModelUrl", () => {
  it("maps to the suffix-free Custom Provider path", () => {
    expect(buildGatewayModelUrl(config())).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct/gw/custom-relay-chatgpt",
    );
  });

  it("URI-encodes every path segment", () => {
    expect(
      buildGatewayModelUrl(
        config({ accountId: "a b", gatewayId: "g/w", providerSlug: "sl/ug" }),
      ),
    ).toBe(
      "https://gateway.ai.cloudflare.com/v1/a%20b/g%2Fw/custom-sl%2Fug",
    );
  });
});
