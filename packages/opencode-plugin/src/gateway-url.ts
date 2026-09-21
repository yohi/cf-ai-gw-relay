import type { ResolvedConfig } from "./config.js";

export function buildGatewayModelUrl(config: ResolvedConfig): string {
  const base = new URL(config.gatewayBaseUrl);
  return `${base.origin}/v1/${encodeURIComponent(config.accountId)}` +
    `/${encodeURIComponent(config.gatewayId)}` +
    `/custom-${encodeURIComponent(config.providerSlug)}`;
}
