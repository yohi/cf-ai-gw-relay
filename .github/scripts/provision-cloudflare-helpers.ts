import type { JsonObject } from "./provision-http.ts";

const GATEWAY_ID_PATTERN = /^[a-z0-9_]+(?:-[a-z0-9_]+)*$/;
const PROVIDER_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CloudflareProvisioningError extends Error {
  override readonly name = "CloudflareProvisioningError";
}

function normalizeIdentifier(
  value: string,
  pattern: RegExp,
  description: string,
  maxLength: number,
): string {
  const identifier = value.trim();
  if (
    identifier.length === 0 ||
    identifier.length > maxLength ||
    !pattern.test(identifier)
  ) {
    throw new CloudflareProvisioningError(description);
  }
  return identifier;
}

export function normalizeGatewayId(value: string): string {
  return normalizeIdentifier(
    value,
    GATEWAY_ID_PATTERN,
    "CLOUDFLARE_GATEWAY_ID is invalid",
    64,
  );
}

export function normalizeProviderSlug(value: string): string {
  return normalizeIdentifier(
    value,
    PROVIDER_SLUG_PATTERN,
    "CLOUDFLARE_PROVIDER_SLUG is invalid",
    128,
  );
}

export function normalizeRelayOrigin(value: string): string {
  const candidate = value.trim();
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" ||
      url.username.length !== 0 ||
      url.password.length !== 0 ||
      url.pathname !== "/" ||
      url.search.length !== 0 ||
      url.hash.length !== 0
    ) {
      throw new CloudflareProvisioningError(
        "RELAY_ORIGIN must be an HTTPS origin without a path",
      );
    }
    return url.origin;
  } catch (error) {
    if (error instanceof CloudflareProvisioningError) throw error;
    throw new CloudflareProvisioningError(
      "RELAY_ORIGIN must be an HTTPS origin without a path",
    );
  }
}

export function createGatewayPayload(gatewayId: string): JsonObject {
  return {
    id: gatewayId,
    authentication: true,
    collect_logs: true,
    cache_ttl: 0,
    cache_invalidate_on_update: true,
    rate_limiting_interval: 0,
    rate_limiting_limit: 0,
  };
}

export function createProviderPayload(
  providerSlug: string,
  relayOrigin: string,
): JsonObject {
  return {
    name: "ChatGPT Codex Deno Relay",
    slug: providerSlug,
    base_url: relayOrigin,
    description: "Fixed-upstream relay for ChatGPT Codex traffic.",
    enable: true,
  };
}
